'use strict';

const crypto = require('node:crypto');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { ROOT, loadEnvFile } = require('./lib/env');
const { runPsql } = require('./lib/psql');
const { createClient } = require('./lib/sportmonks-client');
const { buildImportSql } = require('./lib/import-sql');
const {
  integer,
  normalizeLeague,
  normalizeMembership,
  normalizePlayer,
  normalizeSeason,
  normalizeTeam,
  relation,
  resolveLeague
} = require('./lib/player-normalizer');

loadEnvFile();

const LEAGUE_DEFINITIONS = [
  { code: 'epl', names: ['Premier League'], countries: ['England', 'United Kingdom'] },
  { code: 'la_liga', names: ['La Liga', 'LaLiga', 'LaLiga EA Sports', 'La Liga EA Sports'], countries: ['Spain'] },
  { code: 'serie_a', names: ['Serie A'], countries: ['Italy'] },
  { code: 'bundesliga', names: ['Bundesliga'], countries: ['Germany'] },
  { code: 'ligue_1', names: ['Ligue 1', 'Ligue 1 McDonald’s'], countries: ['France'] }
];
const VALID_CODES = new Set(LEAGUE_DEFINITIONS.map(item => item.code));
const PLAYER_FIELDS = [
  'common_name', 'firstname', 'lastname', 'name', 'display_name',
  'country_id', 'nationality_id', 'nationality_name', 'city_id',
  'position_id', 'detailed_position_id', 'position_name', 'detailed_position_name',
  'height_cm', 'weight_kg', 'date_of_birth', 'gender', 'image_path'
];

const numeric = (value, fallback, min, max) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};

function parseArgs(argv) {
  const options = {
    dryRun: false,
    migrate: false,
    demo: false,
    league: null,
    leagueId: null,
    code: null,
    teamLimit: Infinity
  };
  let codeProvided = false;
  for (const arg of argv) {
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--migrate') options.migrate = true;
    else if (arg === '--demo') options.demo = true;
    else if (arg.startsWith('--league=')) options.league = arg.slice('--league='.length);
    else if (arg.startsWith('--league-id=')) options.leagueId = integer(arg.slice('--league-id='.length), { positive: true });
    else if (arg.startsWith('--code=')) {
      options.code = arg.slice('--code='.length).trim();
      codeProvided = true;
    } else if (arg.startsWith('--team-limit=')) {
      options.teamLimit = numeric(arg.slice('--team-limit='.length), Infinity, 1, 1000);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!codeProvided) options.code = options.demo ? 'demo_scottish_premiership' : 'smoke';
  if (options.leagueId && !options.dryRun && !options.demo) {
    throw new Error('--league-id requires --dry-run or --demo to avoid writing unlabeled non-top-five data.');
  }
  if (!options.code) throw new Error('--code must not be empty.');
  return options;
}

function selectedLeagues(options) {
  if (options.leagueId || options.demo) return [];
  const configured = process.env.PLAYER_SYNC_LEAGUES;
  const codes = options.league
    ? [options.league]
    : configured
      ? configured.split(',').map(code => code.trim()).filter(Boolean)
      : LEAGUE_DEFINITIONS.map(item => item.code);
  for (const code of codes) {
    if (!VALID_CODES.has(code)) throw new Error(`Unsupported league code: ${code}`);
  }
  return LEAGUE_DEFINITIONS.filter(item => codes.includes(item.code));
}

function findDemoLeagueRow(rows, leagueId) {
  if (leagueId) {
    return rows.find(row => integer(row?.id, { positive: true }) === leagueId) || null;
  }
  return resolveLeague(rows, {
    code: 'demo_scottish_premiership',
    names: ['Premiership'],
    countries: ['Scotland']
  }) || rows.find(row => integer(row?.id, { positive: true }) === 501) || null;
}

function mergePlayer(existing, incoming) {
  for (const field of PLAYER_FIELDS) {
    if (existing[field] === null && incoming[field] !== null) existing[field] = incoming[field];
  }
  if (JSON.stringify(incoming.raw || {}).length > JSON.stringify(existing.raw || {}).length) {
    existing.raw = incoming.raw;
  }
  return existing;
}

function redacted(error) {
  return String(error?.message || error).slice(0, 1000);
}

async function applyMigration(databaseUrl) {
  const directory = path.join(ROOT, 'db', 'migrations');
  const files = (await fsp.readdir(directory))
    .filter(name => name.endsWith('.sql'))
    .sort();
  for (const name of files) {
    runPsql({ databaseUrl, sqlFile: path.join(directory, name) });
  }
  console.log(`Applied ${files.length} migrations from db/migrations.`);
}

async function discoverLeagueRows(client) {
  return client.fetchAll('/leagues', { include: 'currentSeason;country' });
}

async function buildPayload(client, options) {
  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const allLeagueRows = await discoverLeagueRows(client);
  const selections = selectedLeagues(options);
  const specialLeague = Boolean(options.leagueId || options.demo);
  const requestedLeagues = specialLeague ? [options.code] : selections.map(item => item.code);
  const leagues = [];
  const seasons = [];
  const teams = [];
  const teamSeasons = [];
  const players = new Map();
  const memberships = [];
  const checkpoints = [];
  const errors = [];
  let succeededTeams = 0;
  let failedTeams = 0;
  let skippedRecords = 0;

  const workItems = specialLeague
    ? [{
      code: options.code,
      leagueRow: findDemoLeagueRow(allLeagueRows, options.leagueId),
      definition: null
    }]
    : selections.map(definition => ({
      code: definition.code,
      leagueRow: resolveLeague(allLeagueRows, definition),
      definition
    }));

  if (specialLeague && !workItems[0].leagueRow) {
    throw new Error(options.demo
      ? 'Scottish Premiership demo league is not visible to the current token.'
      : `League ID ${options.leagueId} is not visible to the current token.`);
  }

  for (const item of workItems) {
    if (!item.leagueRow) {
      errors.push(`League ${item.code}: not visible or ambiguous in the current subscription.`);
      continue;
    }
    const league = normalizeLeague(item.leagueRow, item.code);
    league.is_demo = options.demo;
    const seasonRaw = relation(item.leagueRow, 'currentSeason', 'currentseason', 'current_season');
    const season = normalizeSeason(seasonRaw, league.id);
    if (!league.id || !season.id) {
      errors.push(`League ${item.code}: missing league ID or current season ID.`);
      continue;
    }
    leagues.push(league);
    seasons.push(season);

    let teamRows;
    try {
      teamRows = await client.fetchAll(`/teams/seasons/${season.id}`);
    } catch (error) {
      errors.push(`League ${item.code} season ${season.id}: ${redacted(error)}`);
      continue;
    }
    const discoveredTeams = teamRows.map(normalizeTeam).filter(team => team.id && team.name);
    for (const rawTeam of teamRows) {
      const team = normalizeTeam(rawTeam);
      if (!team.id || !team.name) continue;
      teams.push(team);
      teamSeasons.push({ season_id: season.id, team_id: team.id, raw: rawTeam || {} });
    }
    const limitedTeams = discoveredTeams.slice(0, options.teamLimit);
    for (const team of limitedTeams) {
      const scope = `season:${season.id}:team:${team.id}`;
      try {
        const response = await client.request(
          `/squads/seasons/${season.id}/teams/${team.id}`,
          { include: 'player.nationality;player.detailedPosition;position' }
        );
        for (const squad of response.data) {
          const player = normalizePlayer(relation(squad, 'player'));
          const membership = normalizeMembership(squad);
          if (!player.id || !membership.id || !membership.player_id) {
            skippedRecords += 1;
            continue;
          }
          if (!player.position_id && membership.position_id) player.position_id = membership.position_id;
          if (!player.position_name && membership.position_name) player.position_name = membership.position_name;
          if (players.has(player.id)) mergePlayer(players.get(player.id), player);
          else players.set(player.id, player);
          memberships.push(membership);
        }
        succeededTeams += 1;
        checkpoints.push({ scope, status: 'succeeded', cursor: null, attempts: 1, last_error: null });
      } catch (error) {
        failedTeams += 1;
        const detail = redacted(error);
        errors.push(`${scope}: ${detail}`);
        checkpoints.push({ scope, status: 'failed', cursor: null, attempts: 1, last_error: detail });
      }
    }
  }

  if (!leagues.length) {
    const available = allLeagueRows.map(row => row?.name).filter(Boolean).join(', ');
    throw new Error(
      `None of the requested leagues are available. Visible leagues: ${available || 'none'}. ` +
      'Use a Starter or equivalent token, or run --demo for the Scottish Premiership demo dataset.'
    );
  }

  const expectedLeagueCount = specialLeague ? 1 : selections.length;
  const complete = options.teamLimit === Infinity
    && errors.length === 0
    && leagues.length === expectedLeagueCount
    && failedTeams === 0;

  return {
    run_id: runId,
    started_at: startedAt,
    mode: options.demo ? 'demo' : 'current-season',
    requested_leagues: requestedLeagues,
    complete,
    error: errors.length ? errors.slice(0, 20).join(' | ') : null,
    stats: {
      demo: options.demo,
      requestedLeagues: requestedLeagues.length,
      discoveredLeagues: allLeagueRows.length,
      matchedLeagues: leagues.length,
      seasons: seasons.length,
      teams: teams.length,
      requestedTeams: checkpoints.length,
      succeededTeams,
      failedTeams,
      players: players.size,
      memberships: memberships.length,
      skippedRecords
    },
    leagues,
    seasons,
    teams,
    team_seasons: teamSeasons,
    players: [...players.values()],
    squad_memberships: memberships,
    checkpoints,
    errors
  };
}

async function importPayload(databaseUrl, payload, dryRun) {
  const sql = buildImportSql(payload, { dryRun });
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'top5-player-import-'));
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
  if (options.migrate) {
    await applyMigration(databaseUrl);
    return;
  }

  const token = (process.env.SPORTMONKS_TOKEN || '').trim();
  const apiBase = (process.env.SPORTMONKS_API_BASE || 'https://api.sportmonks.com/v3/football').replace(/\/+$/, '');
  const timeoutMs = numeric(process.env.REQUEST_TIMEOUT_MS, 12000, 3000, 60000);
  const client = createClient({ token, apiBase, timeoutMs, maxRetries: 3 });
  const payload = await buildPayload(client, options);
  const output = await importPayload(databaseUrl, payload, options.dryRun);
  const summary = JSON.parse(output.split('\n').filter(Boolean).pop());
  console.log(JSON.stringify({
    mode: options.dryRun ? 'dry-run (rolled back)' : 'persistent import',
    demo: options.demo,
    complete: payload.complete,
    stats: payload.stats,
    errors: payload.errors.slice(0, 10),
    databaseSummary: summary
  }, null, 2));
}

main().catch(error => {
  console.error(`Sync failed: ${redacted(error)}`);
  process.exitCode = 1;
});
