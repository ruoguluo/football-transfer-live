'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { extractNextUrl } = require('../scripts/lib/sportmonks-client');
const { buildTransferImportSql } = require('../scripts/lib/transfer-import-sql');
const { normalizeTransfer, parseAmount } = require('../scripts/lib/transfer-normalizer');

test('normalizes confirmed transfer with lowercase relation names', () => {
  const result = normalizeTransfer({
    id: 581526,
    player_id: 37365878,
    from_team_id: 150,
    to_team_id: 309,
    type_id: 219,
    date: '2026-07-20',
    career_ended: false,
    completed: true,
    amount: null,
    fromteam: { id: 150, name: 'Burton Albion' },
    toteam: { id: 309, name: 'Motherwell' },
    type: { id: 219, name: 'Transfer', code: 'transfer' }
  });
  assert.equal(result.id, 581526);
  assert.equal(result.player_id, 37365878);
  assert.equal(result.from_team_name, 'Burton Albion');
  assert.equal(result.to_team_name, 'Motherwell');
  assert.equal(result.type_name, 'Transfer');
  assert.equal(result.type_code, 'transfer');
  assert.equal(result.transfer_date, '2026-07-20');
  assert.equal(result.amount, null);
  assert.equal(result.completed, true);
  assert.equal(result.career_ended, false);
});

test('resolves team and type names from reference dictionaries when includes are absent', () => {
  const references = {
    teamsById: new Map([
      [150, { id: 150, name: 'Burton Albion' }],
      [309, { id: 309, name: 'Motherwell' }]
    ]),
    typesById: new Map([
      [219, { id: 219, name: 'Transfer', code: 'transfer' }]
    ])
  };
  const result = normalizeTransfer({
    id: 581526,
    player_id: 37365878,
    from_team_id: 150,
    to_team_id: 309,
    type_id: 219,
    date: '2026-07-20',
    completed: true,
    amount: 0
  }, references);
  assert.equal(result.from_team_name, 'Burton Albion');
  assert.equal(result.to_team_name, 'Motherwell');
  assert.equal(result.type_name, 'Transfer');
  assert.equal(result.type_code, 'transfer');
  assert.equal(result.amount, 0);
});

test('preserves undisclosed and free-transfer amounts without coercion', () => {
  assert.equal(parseAmount(null), null);
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('not-a-number'), null);
  assert.equal(parseAmount(0), 0);
  assert.equal(parseAmount(909000), 909000);
  assert.equal(parseAmount('1200000'), 1200000);
});

test('extracts cursor tokens from absolute pagination URLs', () => {
  const absolute = extractNextUrl(
    'https://api.sportmonks.com/v3/football/transfers?filters=populate&cursor=abc123',
    'https://api.sportmonks.com/v3/football',
    '/transfers',
    { filters: 'populate' }
  );
  assert.equal(absolute.searchParams.get('cursor'), 'abc123');
  assert.equal(absolute.searchParams.has('per_page'), false);

  const raw = extractNextUrl(
    'raw-token',
    'https://api.sportmonks.com/v3/football',
    '/transfers',
    { filters: 'transferPlayers:1,2', include: 'type', per_page: '50', page: '1' }
  );
  assert.equal(raw.searchParams.get('cursor'), 'raw-token');
  assert.equal(raw.searchParams.has('per_page'), false);
  assert.equal(raw.searchParams.has('page'), false);
  assert.equal(raw.searchParams.get('filters'), 'transferPlayers:1,2');
});

test('builds transactional transfer import with dry-run rollback', () => {
  const payload = {
    run_id: '33333333-3333-4333-8333-333333333333',
    started_at: '2026-11-06T00:00:00.000Z',
    mode: 'demo-transfers',
    requested_leagues: ['demo_scottish_premiership'],
    complete: true,
    stats: {},
    player_transfers: [{
      id: 581526,
      player_id: 37365878,
      from_team_id: 150,
      to_team_id: 309,
      from_team_name: 'Burton Albion',
      to_team_name: 'Motherwell',
      type_id: 219,
      type_name: 'Transfer',
      type_code: 'transfer',
      transfer_date: '2026-07-20',
      amount: null,
      amount_text: null,
      completed: true,
      career_ended: false,
      position_id: 25,
      detailed_position_id: null,
      raw: {}
    }],
    checkpoints: []
  };
  const dryRunSql = buildTransferImportSql(payload, { dryRun: true });
  const persistentSql = buildTransferImportSql(payload, { dryRun: false });
  assert.match(dryRunSql, /BEGIN;/);
  assert.match(dryRunSql, /INSERT INTO public.player_transfers/);
  assert.match(dryRunSql, /ON CONFLICT \(id\) DO UPDATE/);
  assert.match(dryRunSql, /ROLLBACK;/);
  assert.match(persistentSql, /COMMIT;/);
  assert.doesNotMatch(persistentSql, /ROLLBACK;/);
});
