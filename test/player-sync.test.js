'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildImportSql } = require('../scripts/lib/import-sql');
const { parseDatabaseUrl } = require('../scripts/lib/psql');
const {
  normalizeMembership,
  normalizePlayer,
  resolveLeague
} = require('../scripts/lib/player-normalizer');

test('normalizes player profile and lowercase detailedposition relation', () => {
  const result = normalizePlayer({
    id: 37365878,
    country_id: 462,
    nationality_id: 462,
    city_id: null,
    position_id: 25,
    detailed_position_id: 155,
    common_name: 'D. R. Williams',
    firstname: 'Dylan',
    lastname: 'Williams',
    name: 'Dylan Riley Williams',
    display_name: 'Dylan Williams',
    image_path: 'https://example.test/player.png',
    height: null,
    weight: null,
    date_of_birth: '2003-09-13',
    gender: 'male',
    nationality: { id: 462, name: 'England' },
    detailedposition: { id: 155, name: 'Left Back' }
  });
  assert.equal(result.id, 37365878);
  assert.equal(result.display_name, 'Dylan Williams');
  assert.equal(result.nationality_name, 'England');
  assert.equal(result.detailed_position_name, 'Left Back');
  assert.equal(result.height_cm, null);
  assert.equal(result.weight_kg, null);
  assert.equal(result.date_of_birth, '2003-09-13');
});

test('keeps missing basic values null instead of coercing them', () => {
  const result = normalizePlayer({
    id: 1,
    height: '',
    weight: 0,
    date_of_birth: 'invalid',
    display_name: '',
    common_name: '',
    name: ''
  });
  assert.equal(result.height_cm, null);
  assert.equal(result.weight_kg, null);
  assert.equal(result.date_of_birth, null);
  assert.equal(result.display_name, null);
});

test('normalizes season squad membership', () => {
  const result = normalizeMembership({
    id: 1881099892,
    player_id: 37365878,
    team_id: 309,
    season_id: 28275,
    position_id: 25,
    jersey_number: 20,
    position: { id: 25, name: 'Defender' }
  });
  assert.deepEqual(
    { id: result.id, seasonId: result.season_id, teamId: result.team_id, playerId: result.player_id },
    { id: 1881099892, seasonId: 28275, teamId: 309, playerId: 37365878 }
  );
  assert.equal(result.jersey_number, 20);
  assert.equal(result.position_name, 'Defender');
});

test('matches only exact domestic league names', () => {
  const definition = {
    code: 'epl',
    names: ['Premier League'],
    countries: ['England', 'United Kingdom']
  };
  const rows = [
    { id: 8, name: 'Premier League', sub_type: 'domestic', active: true, country: { name: 'England' } },
    { id: 501, name: 'Premiership', sub_type: 'domestic', active: true, country: { name: 'Scotland' } }
  ];
  assert.equal(resolveLeague(rows, definition)?.id, 8);
  assert.equal(resolveLeague(rows.slice(1), definition), null);
});

test('parses encoded database credentials without requiring query-string secrets', () => {
  const db = parseDatabaseUrl('postgresql://user:p%40ss@db.example.test:5432/postgres?sslmode=require');
  assert.equal(db.user, 'user');
  assert.equal(db.password, 'p@ss');
  assert.equal(db.host, 'db.example.test');
  assert.equal(db.database, 'postgres');
  assert.equal(db.sslmode, 'require');
});

test('builds an idempotent transactional import with dry-run rollback', () => {
  const payload = {
    run_id: '11111111-1111-4111-8111-111111111111',
    started_at: '2026-11-06T00:00:00.000Z',
    requested_leagues: ['epl'],
    complete: false,
    stats: {},
    leagues: [],
    seasons: [],
    teams: [],
    team_seasons: [],
    players: [],
    squad_memberships: [],
    checkpoints: []
  };
  const dryRunSql = buildImportSql(payload, { dryRun: true });
  const persistentSql = buildImportSql(payload, { dryRun: false });
  assert.match(dryRunSql, /BEGIN;/);
  assert.match(dryRunSql, /ON CONFLICT \(id\) DO UPDATE/);
  assert.match(dryRunSql, /ROLLBACK;/);
  assert.match(persistentSql, /COMMIT;/);
  assert.doesNotMatch(persistentSql, /ROLLBACK;/);
});

test('builds demo import with an explicit mode and demo flag', () => {
  const payload = {
    run_id: '22222222-2222-4222-8222-222222222222',
    started_at: '2026-11-06T00:00:00.000Z',
    mode: 'demo',
    requested_leagues: ['demo_scottish_premiership'],
    complete: true,
    stats: {},
    leagues: [{
      id: 501,
      code: 'demo_scottish_premiership',
      name: 'Premiership',
      is_demo: true,
      raw: {}
    }],
    seasons: [],
    teams: [],
    team_seasons: [],
    players: [],
    squad_memberships: [],
    checkpoints: []
  };
  const sql = buildImportSql(payload, { dryRun: false });
  assert.match(sql, /COALESCE\(NULLIF\(payload->>'mode', ''\), 'current-season'\)/);
  assert.match(sql, /is_demo = EXCLUDED.is_demo/);
  assert.match(sql, /COALESCE\(\(item->>'is_demo'\)::boolean, false\)/);
});
