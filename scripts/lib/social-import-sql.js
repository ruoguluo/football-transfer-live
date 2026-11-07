'use strict';

function buildSocialImportSql(payload, { dryRun = false } = {}) {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
  const finish = dryRun ? 'ROLLBACK;' : 'COMMIT;';
  return `
BEGIN;

CREATE TEMP TABLE import_payload (payload jsonb) ON COMMIT DROP;
INSERT INTO import_payload (payload)
VALUES (convert_from(decode($payload$${encoded}$payload$, 'base64'), 'UTF8')::jsonb);

CREATE TEMP TABLE src_socials ON COMMIT DROP AS
SELECT DISTINCT ON (value->>'player_id', value->>'platform', value->>'url') value AS item
FROM import_payload p
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(p.payload->'player_socials', '[]'::jsonb)
) AS source(value)
WHERE (value->>'player_id') IS NOT NULL
  AND (value->>'platform') IS NOT NULL
  AND (value->>'url') IS NOT NULL
ORDER BY value->>'player_id', value->>'platform', value->>'url';

INSERT INTO public.sync_runs (
  id, mode, status, requested_leagues, stats, error, started_at, finished_at
)
SELECT
  (payload->>'run_id')::uuid,
  COALESCE(NULLIF(payload->>'mode', ''), 'socials'),
  CASE WHEN (payload->>'complete')::boolean THEN 'succeeded' ELSE 'partial' END,
  ARRAY(SELECT jsonb_array_elements_text(COALESCE(payload->'requested_leagues', '[]'::jsonb))),
  COALESCE(payload->'stats', '{}'::jsonb),
  NULLIF(payload->>'error', ''),
  (payload->>'started_at')::timestamptz,
  now()
FROM import_payload
ON CONFLICT (id) DO UPDATE SET
  mode = EXCLUDED.mode,
  status = EXCLUDED.status,
  stats = EXCLUDED.stats,
  error = EXCLUDED.error,
  finished_at = now();

INSERT INTO public.player_socials (
  player_id, platform, handle, url, source_name, source_url,
  verified, raw, created_at, updated_at
)
SELECT
  (item->>'player_id')::bigint,
  item->>'platform',
  item->>'handle',
  item->>'url',
  item->>'source_name',
  item->>'source_url',
  COALESCE((item->>'verified')::boolean, false),
  COALESCE(item->'raw', '{}'::jsonb),
  now(),
  now()
FROM src_socials
WHERE EXISTS (
  SELECT 1 FROM public.players p WHERE p.id = (item->>'player_id')::bigint
)
ON CONFLICT (player_id, platform, url) DO UPDATE SET
  handle = EXCLUDED.handle,
  source_name = EXCLUDED.source_name,
  source_url = EXCLUDED.source_url,
  verified = EXCLUDED.verified,
  raw = EXCLUDED.raw,
  updated_at = now();

SELECT jsonb_build_object(
  'dry_run', ${dryRun ? 'true' : 'false'},
  'run_id', (SELECT payload->>'run_id' FROM import_payload),
  'socials', (SELECT count(*) FROM src_socials)
)::text AS import_summary;

${finish}
`;
}

module.exports = { buildSocialImportSql };
