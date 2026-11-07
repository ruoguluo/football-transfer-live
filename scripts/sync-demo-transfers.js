'use strict';

const crypto = require('node:crypto');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { loadEnvFile } = require('./lib/env');
const { runPsql } = require('./lib/psql');
const { createClient, extractNextUrl } = require('./lib/sportmonks-client');
const { normalizeTransfer } = require('./lib/transfer-normalizer');
const { buildTransferImportSql } = require('./lib/transfer-import-sql');

loadEnvFile();

const PLAYER_BATCH_SIZE = 50;
const TRANSFER_INCLUDE = 'fromTeam;toTeam;type';

const numeric = (value, fallback, min, max) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};

function parseArgs(argv) {
  const options = { dryRun: false, playerLimit: Infinity };
  for (const arg of argv) {
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg.startsWith('--player-limit=')) {
      options.playerLimit = numeric(arg.slice('--player-limit='.length), Infinity, 1, 1000);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

const DEMO_QUERY = `
SELECT jsonb_build_object(
  'player_ids', COALESCE((
    SELECT jsonb_agg(x.player_id ORDER BY x.player_id)
    FROM (SELECT DISTINCT player_id FROM public.current_demo_players) x
  ), '[]'::jsonb),
  'league_codes', COALESCE((
    SELECT jsonb_agg(l.code ORDER BY l.code)
    FROM public.leagues l WHERE l.is_demo
  ), '[]'::jsonb)
)::text;
`;

function chunk(values, size) {
  const rows = [];
  for (let index = 0; index < values.length; index += size) {
    rows.push(values.slice(index, index + size));
  }
  return rows;
}

function byId(rows) {
  const result = new Map();
  for (const row of rows) {
    const id = Number(row?.id);
    if (Number.isInteger(id) && id > 0) result.set(id, row);
  }
  return result;
}

function redacted(error) {
  return String(error?.message || error).slice(0, 1000);
}

function isBlocking(error) {
  return /HTTP (401|403|429)/.test(redacted(error));
}

async function fetchAllFromUrl(client, startUrl, coreBase, maxPages = 30) {
  const rows = [];
  const seenUrls = new Set();
  let url = new URL(startUrl);
  for (let page = 0; page < maxPages; page += 1) {
    if (seenUrls.has(url.href)) throw new Error('Repeated pagination URL for reference types.');
    seenUrls.add(url.href);
    const body = await client.requestUrl(url);
    rows.push(...body.data);
    const pagination = body.pagination || {};
    const next = pagination.next_cursor || pagination.next_page;
    if (pagination.has_more !== true || !next) return rows;
    url = extractNextUrl(next, coreBase, '/types', { filters: 'populate' });
  }
  throw new Error(`Reference type pagination exceeded ${maxPages} pages.`);
}

async function fetchReferences(client, coreBase) {
  const empty = { teamsById: new Map(), typesById: new Map(), teamCount: 0, typeCount: 0, errors: [] };
  let teamRows = [];
  let typeRows = [];
  const errors = [];
  try {
    teamRows = await client.fetchAll('/teams', { filters: 'populate', per_page: '1000' });
  } catch (error) {
    errors.push(`Team reference lookup failed: ${redacted(error)}`);
  }
  try {
    const typeUrl = new URL(`${coreBase}/types`);
    typeUrl.searchParams.set('filters', 'populate');
    typeUrl.searchParams.set('per_page', '1000');
    typeRows = await fetchAllFromUrl(client, typeUrl, coreBase);
  } catch (error) {
    errors.push(`Type reference lookup failed: ${redacted(error)}`);
  }
  return {
    teamsById: byId(teamRows),
    typesById: byId(typeRows),
    teamCount: teamRows.length,
    typeCount: typeRows.length,
    errors
  };
}

async function importPayload(databaseUrl, payload, dryRun) {
  const sql = buildTransferImportSql(payload, { dryRun });
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'demo-transfer-import-'));
  const sqlFile = path.join(directory, 'import.sql');
  try {
    await fsp.writeFile(sqlFile, sql, 'utf8');
    return runPsql({ databaseUrl, sqlFile });
  } finally {
    await fsp.rm(directory, { recursive: true, force: true });
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const databaseUrl = (process.env.DATABASE_URL || '').trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is missing from .env.');

  const demo = JSON.parse(runPsql({ databaseUrl, sql: DEMO_QUERY }));
  const playerIds = (demo.player_ids || [])
    .map(value => Number(value))
    .filter(value => Number.isInteger(value) && value > 0)
    .slice(0, options.playerLimit);
  const leagueCodes = (demo.league_codes || []).map(String);
  if (!playerIds.length) throw new Error('No demo players found. Run npm run sync:demo first.');

  const token = (process.env.SPORTMONKS_TOKEN || '').trim();
  const apiBase = (process.env.SPORTMONKS_API_BASE || 'https://api.sportmonks.com/v3/football').replace(/\/+$/, '');
  const coreBase = /\/football$/.test(apiBase)
    ? apiBase.replace(/\/football$/, '/core')
    : 'https://api.sportmonks.com/v3/core';
  const timeoutMs = numeric(process.env.REQUEST_TIMEOUT_MS, 12000, 3000, 60000);
  const client = createClient({ token, apiBase, timeoutMs, maxRetries: 3 });

  const references = await fetchReferences(client, coreBase);
  const errors = [...references.errors];
  const transfersById = new Map();
  const playersWithTransfers = new Set();
  const checkpoints = [];
  const batches = chunk(playerIds, PLAYER_BATCH_SIZE);
  let processedChunks = 0;
  let failedChunks = 0;
  let stoppedEarly = false;

  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];
    const scope = `transfers:chunk:${index + 1}`;
    try {
      const rows = await client.fetchAll('/transfers', {
        filters: `transferPlayers:${batch.join(',')}`,
        include: TRANSFER_INCLUDE,
        per_page: '50'
      });
      const allowed = new Set(batch);
      for (const row of rows) {
        const normalized = normalizeTransfer(row, references);
        if (!normalized.id || !normalized.player_id || !allowed.has(normalized.player_id)) continue;
        transfersById.set(normalized.id, normalized);
        playersWithTransfers.add(normalized.player_id);
      }
      processedChunks += 1;
      checkpoints.push({ scope, status: 'succeeded', cursor: null, attempts: 1, last_error: null });
    } catch (error) {
      failedChunks += 1;
      const detail = redacted(error);
      errors.push(`${scope}: ${detail}`);
      checkpoints.push({ scope, status: 'failed', cursor: null, attempts: 1, last_error: detail });
      if (isBlocking(error)) {
        stoppedEarly = true;
        break;
      }
    }
  }

  const complete = options.playerLimit === Infinity
    && failedChunks === 0
    && !stoppedEarly
    && processedChunks === batches.length;
  const stats = {
    playerCount: playerIds.length,
    chunkCount: batches.length,
    processedChunks,
    failedChunks,
    transferCount: transfersById.size,
    playersWithTransfers: playersWithTransfers.size,
    teamReferenceCount: references.teamCount,
    typeReferenceCount: references.typeCount,
    complete
  };
  const payload = {
    run_id: crypto.randomUUID(),
    started_at: new Date().toISOString(),
    mode: 'demo-transfers',
    requested_leagues: leagueCodes,
    complete,
    error: errors.length ? errors.slice(0, 20).join(' | ') : null,
    stats,
    player_transfers: [...transfersById.values()],
    checkpoints
  };
  const output = await importPayload(databaseUrl, payload, options.dryRun);
  const databaseSummary = JSON.parse(output.split('\n').filter(Boolean).pop());

  console.log(JSON.stringify({
    mode: options.dryRun ? 'dry-run (rolled back)' : 'persistent import',
    complete,
    stats,
    errors: errors.slice(0, 10),
    databaseSummary
  }, null, 2));
  if (!complete) process.exitCode = 1;
}

main().catch(error => {
  console.error(`Transfer sync failed: ${redacted(error)}`);
  process.exitCode = 1;
});
