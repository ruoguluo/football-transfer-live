'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildSocialImportSql } = require('../scripts/lib/social-import-sql');
const { isSafeHttpUrl, normalizeSocial, socialKey } = require('../scripts/lib/social-normalizer');

test('accepts only HTTP and HTTPS social URLs', () => {
  assert.equal(isSafeHttpUrl('https://x.com/example'), true);
  assert.equal(isSafeHttpUrl('http://example.com/profile'), true);
  assert.equal(isSafeHttpUrl('javascript:alert(1)'), false);
  assert.equal(isSafeHttpUrl('not-a-url'), false);
  assert.equal(isSafeHttpUrl(null), false);
});

test('normalizes a verified public social link', () => {
  const result = normalizeSocial({
    player_id: 3385,
    platform: 'X / Twitter',
    handle: '@example',
    url: 'https://x.com/example',
    source_name: 'Manual verification',
    source_url: 'https://example.com/source',
    verified: true
  });
  assert.equal(result.player_id, 3385);
  assert.equal(result.platform, 'X / Twitter');
  assert.equal(result.url, 'https://x.com/example');
  assert.equal(result.verified, true);
  assert.equal(socialKey(result), '3385|X / Twitter|https://x.com/example');
});

test('rejects incomplete social rows and unsafe source URLs', () => {
  assert.equal(normalizeSocial({ player_id: 3385, platform: 'X', url: 'javascript:alert(1)' }), null);
  assert.equal(normalizeSocial({ player_id: 3385, url: 'https://x.com/example' }), null);
  const result = normalizeSocial({
    player_id: 3385,
    platform: 'Instagram',
    url: 'https://instagram.com/example',
    source_url: 'javascript:alert(1)'
  });
  assert.equal(result.source_url, null);
  assert.equal(result.handle, null);
  assert.equal(result.verified, false);
});

test('builds idempotent social import with dry-run rollback', () => {
  const payload = {
    run_id: '44444444-4444-4444-8444-444444444444',
    started_at: '2026-11-06T00:00:00.000Z',
    mode: 'socials',
    requested_leagues: ['demo_scottish_premiership'],
    complete: true,
    stats: {},
    player_socials: [{
      player_id: 3385,
      platform: 'X / Twitter',
      handle: '@example',
      url: 'https://x.com/example',
      source_name: 'Manual verification',
      source_url: null,
      verified: true,
      raw: {}
    }]
  };
  const dryRunSql = buildSocialImportSql(payload, { dryRun: true });
  const persistentSql = buildSocialImportSql(payload, { dryRun: false });
  assert.match(dryRunSql, /BEGIN;/);
  assert.match(dryRunSql, /INSERT INTO public.player_socials/);
  assert.match(dryRunSql, /ON CONFLICT \(player_id, platform, url\) DO UPDATE/);
  assert.match(dryRunSql, /ROLLBACK;/);
  assert.match(persistentSql, /COMMIT;/);
  assert.doesNotMatch(persistentSql, /ROLLBACK;/);
});
