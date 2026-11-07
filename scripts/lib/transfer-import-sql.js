'use strict';

function buildTransferImportSql(payload, { dryRun = false } = {}) {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
  const finish = dryRun ? 'ROLLBACK;' : 'COMMIT;';
  return `
BEGIN;

CREATE TEMP TABLE import_payload (payload jsonb) ON COMMIT DROP;
INSERT INTO import_payload (payload)
VALUES (convert_from(decode($payload$${encoded}$payload$, 'base64'), 'UTF8')::jsonb);

CREATE TEMP TABLE src_transfers ON COMMIT DROP AS
SELECT DISTINCT ON ((value->>'id')::bigint) value AS item
FROM import_payload p
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(p.payload->'player_transfers', '[]'::jsonb)
) AS source(value)
WHERE (value->>'id') IS NOT NULL
  AND (value->>'player_id') IS NOT NULL
ORDER BY (value->>'id')::bigint;

CREATE TEMP TABLE src_checkpoints ON COMMIT DROP AS
SELECT DISTINCT ON (value->>'scope') value AS item
FROM import_payload p
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(p.payload->'checkpoints', '[]'::jsonb)
) AS source(value)
WHERE (value->>'scope') IS NOT NULL
ORDER BY value->>'scope';

INSERT INTO public.sync_runs (
  id, mode, status, requested_leagues, stats, error, started_at, finished_at
)
SELECT
  (payload->>'run_id')::uuid,
  COALESCE(NULLIF(payload->>'mode', ''), 'demo-transfers'),
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

INSERT INTO public.player_transfers (
  id, player_id, from_team_id, to_team_id, from_team_name, to_team_name,
  type_id, type_name, type_code, transfer_date, amount, amount_text,
  completed, career_ended, position_id, detailed_position_id, raw, synced_at
)
SELECT
  (item->>'id')::bigint,
  (item->>'player_id')::bigint,
  (item->>'from_team_id')::bigint,
  (item->>'to_team_id')::bigint,
  item->>'from_team_name',
  item->>'to_team_name',
  (item->>'type_id')::bigint,
  item->>'type_name',
  item->>'type_code',
  (item->>'transfer_date')::date,
  (item->>'amount')::numeric,
  item->>'amount_text',
  CASE WHEN item->>'completed' IS NULL THEN NULL ELSE (item->>'completed')::boolean END,
  CASE WHEN item->>'career_ended' IS NULL THEN NULL ELSE (item->>'career_ended')::boolean END,
  (item->>'position_id')::bigint,
  (item->>'detailed_position_id')::bigint,
  COALESCE(item->'raw', '{}'::jsonb),
  now()
FROM src_transfers
WHERE EXISTS (
  SELECT 1 FROM public.players p WHERE p.id = (item->>'player_id')::bigint
)
ON CONFLICT (id) DO UPDATE SET
  player_id = EXCLUDED.player_id,
  from_team_id = EXCLUDED.from_team_id,
  to_team_id = EXCLUDED.to_team_id,
  from_team_name = EXCLUDED.from_team_name,
  to_team_name = EXCLUDED.to_team_name,
  type_id = EXCLUDED.type_id,
  type_name = EXCLUDED.type_name,
  type_code = EXCLUDED.type_code,
  transfer_date = EXCLUDED.transfer_date,
  amount = EXCLUDED.amount,
  amount_text = EXCLUDED.amount_text,
  completed = EXCLUDED.completed,
  career_ended = EXCLUDED.career_ended,
  position_id = EXCLUDED.position_id,
  detailed_position_id = EXCLUDED.detailed_position_id,
  raw = EXCLUDED.raw,
  synced_at = now();

INSERT INTO public.sync_checkpoints (
  scope, last_run_id, status, cursor, attempts, last_error, updated_at
)
SELECT
  item->>'scope',
  (SELECT (payload->>'run_id')::uuid FROM import_payload),
  item->>'status',
  NULLIF(item->>'cursor', ''),
  COALESCE((item->>'attempts')::integer, 0),
  NULLIF(item->>'last_error', ''),
  now()
FROM src_checkpoints
ON CONFLICT (scope) DO UPDATE SET
  last_run_id = EXCLUDED.last_run_id,
  status = EXCLUDED.status,
  cursor = EXCLUDED.cursor,
  attempts = EXCLUDED.attempts,
  last_error = EXCLUDED.last_error,
  updated_at = now();

SELECT jsonb_build_object(
  'dry_run', ${dryRun ? 'true' : 'false'},
  'run_id', (SELECT payload->>'run_id' FROM import_payload),
  'transfers', (SELECT count(*) FROM src_transfers),
  'checkpoints', (SELECT count(*) FROM src_checkpoints)
)::text AS import_summary;

${finish}
`;
}

module.exports = { buildTransferImportSql };
