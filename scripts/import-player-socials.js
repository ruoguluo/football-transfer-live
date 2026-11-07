'use strict';

const crypto = require('node:crypto');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { ROOT, loadEnvFile } = require('./lib/env');
const { runPsql } = require('./lib/psql');
const { buildSocialImportSql } = require('./lib/social-import-sql');
const { normalizeSocial, socialKey } = require('./lib/social-normalizer');

loadEnvFile();

const DEFAULT_INPUT = path.join(ROOT, 'data', 'player-socials.json');

const DATABASE_QUERY = `
SELECT jsonb_build_object(
  'player_ids', COALESCE((
    SELECT jsonb_agg(id ORDER BY id) FROM public.players
  ), '[]'::jsonb),
  'league_codes', COALESCE((
    SELECT jsonb_agg(code ORDER BY code)
    FROM public.leagues WHERE is_demo
  ), '[]'::jsonb)
)::text;
`;

function parseArgs(argv) {
  const options = { dryRun: false, file: DEFAULT_INPUT };
  for (const arg of argv) {
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg.startsWith('--file=')) {
      const value = arg.slice('--file='.length).trim();
      if (!value) throw new Error('--file must not be empty.');
      options.file = path.resolve(ROOT, value);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function redacted(error) {
  return String(error?.message || error).slice(0, 1000);
}

async function importPayload(databaseUrl, payload, dryRun) {
  const sql = buildSocialImportSql(payload, { dryRun });
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'player-social-import-'));
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

  let rawRows;
  try {
    rawRows = JSON.parse(await fsp.readFile(options.file, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to read social links input: ${redacted(error)}`);
  }
  if (!Array.isArray(rawRows)) throw new Error('Social links input must be a JSON array.');

  const database = JSON.parse(runPsql({ databaseUrl, sql: DATABASE_QUERY }));
  const knownPlayers = new Set((database.player_ids || []).map(Number));
  const leagueCodes = (database.league_codes || []).map(String);

  const errors = [];
  const socialsById = new Map();
  let invalidRows = 0;
  let unknownPlayerRows = 0;

  rawRows.forEach((row, index) => {
    const normalized = normalizeSocial(row);
    if (!normalized) {
      invalidRows += 1;
      errors.push(`row ${index + 1}: missing player_id/platform or unsafe url`);
      return;
    }
    if (!knownPlayers.has(normalized.player_id)) {
      unknownPlayerRows += 1;
      errors.push(`row ${index + 1}: player_id ${normalized.player_id} does not exist`);
      return;
    }
    socialsById.set(socialKey(normalized), normalized);
  });

  const complete = invalidRows === 0 && unknownPlayerRows === 0;
  const stats = {
    inputRows: rawRows.length,
    validRows: socialsById.size,
    invalidRows,
    unknownPlayerRows,
    complete
  };
  const payload = {
    run_id: crypto.randomUUID(),
    started_at: new Date().toISOString(),
    mode: 'socials',
    requested_leagues: leagueCodes,
    complete,
    error: errors.length ? errors.slice(0, 20).join(' | ') : null,
    stats,
    player_socials: [...socialsById.values()]
  };
  const output = await importPayload(databaseUrl, payload, options.dryRun);
  const databaseSummary = JSON.parse(output.split('\n').filter(Boolean).pop());

  console.log(JSON.stringify({
    input: options.file,
    mode: options.dryRun ? 'dry-run (rolled back)' : 'persistent import',
    complete,
    stats,
    errors: errors.slice(0, 10),
    databaseSummary
  }, null, 2));
  if (!complete) process.exitCode = 1;
}

main().catch(error => {
  console.error(`Social links import failed: ${redacted(error)}`);
  process.exitCode = 1;
});
