'use strict';

function buildImportSql(payload, { dryRun = false } = {}) {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
  const finish = dryRun ? 'ROLLBACK;' : 'COMMIT;';
  return `
BEGIN;

CREATE TEMP TABLE import_payload (payload jsonb) ON COMMIT DROP;
INSERT INTO import_payload (payload)
VALUES (convert_from(decode($payload$${encoded}$payload$, 'base64'), 'UTF8')::jsonb);

CREATE TEMP TABLE src_leagues ON COMMIT DROP AS
SELECT DISTINCT ON ((value->>'id')::bigint) value AS item
FROM import_payload p
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.payload->'leagues', '[]'::jsonb)) AS source(value)
WHERE (value->>'id') IS NOT NULL
ORDER BY (value->>'id')::bigint;

CREATE TEMP TABLE src_seasons ON COMMIT DROP AS
SELECT DISTINCT ON ((value->>'id')::bigint) value AS item
FROM import_payload p
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.payload->'seasons', '[]'::jsonb)) AS source(value)
WHERE (value->>'id') IS NOT NULL
ORDER BY (value->>'id')::bigint;

CREATE TEMP TABLE src_teams ON COMMIT DROP AS
SELECT DISTINCT ON ((value->>'id')::bigint) value AS item
FROM import_payload p
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.payload->'teams', '[]'::jsonb)) AS source(value)
WHERE (value->>'id') IS NOT NULL
ORDER BY (value->>'id')::bigint;

CREATE TEMP TABLE src_team_seasons ON COMMIT DROP AS
SELECT DISTINCT ON ((value->>'season_id')::bigint, (value->>'team_id')::bigint) value AS item
FROM import_payload p
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.payload->'team_seasons', '[]'::jsonb)) AS source(value)
WHERE (value->>'season_id') IS NOT NULL AND (value->>'team_id') IS NOT NULL
ORDER BY (value->>'season_id')::bigint, (value->>'team_id')::bigint;

CREATE TEMP TABLE src_players ON COMMIT DROP AS
SELECT DISTINCT ON ((value->>'id')::bigint) value AS item
FROM import_payload p
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.payload->'players', '[]'::jsonb)) AS source(value)
WHERE (value->>'id') IS NOT NULL
ORDER BY (value->>'id')::bigint;

CREATE TEMP TABLE src_memberships ON COMMIT DROP AS
SELECT DISTINCT ON ((value->>'season_id')::bigint, (value->>'id')::bigint) value AS item
FROM import_payload p
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.payload->'squad_memberships', '[]'::jsonb)) AS source(value)
WHERE (value->>'season_id') IS NOT NULL
  AND (value->>'id') IS NOT NULL
  AND (value->>'player_id') IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM src_players sp WHERE (sp.item->>'id')::bigint = (value->>'player_id')::bigint
  )
ORDER BY (value->>'season_id')::bigint, (value->>'id')::bigint;

CREATE TEMP TABLE src_checkpoints ON COMMIT DROP AS
SELECT DISTINCT ON (value->>'scope') value AS item
FROM import_payload p
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.payload->'checkpoints', '[]'::jsonb)) AS source(value)
WHERE (value->>'scope') IS NOT NULL
ORDER BY value->>'scope';

INSERT INTO public.sync_runs (
  id, mode, status, requested_leagues, stats, error, started_at, finished_at
)
SELECT
  (payload->>'run_id')::uuid,
  COALESCE(NULLIF(payload->>'mode', ''), 'current-season'),
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

INSERT INTO public.leagues (
  id, code, name, country_id, country_name, active, is_demo, raw, synced_at
)
SELECT
  (item->>'id')::bigint,
  item->>'code',
  item->>'name',
  (item->>'country_id')::bigint,
  item->>'country_name',
  COALESCE((item->>'active')::boolean, true),
  COALESCE((item->>'is_demo')::boolean, false),
  COALESCE(item->'raw', '{}'::jsonb),
  now()
FROM src_leagues
ON CONFLICT (id) DO UPDATE SET
  code = EXCLUDED.code,
  name = COALESCE(EXCLUDED.name, public.leagues.name),
  country_id = COALESCE(EXCLUDED.country_id, public.leagues.country_id),
  country_name = COALESCE(EXCLUDED.country_name, public.leagues.country_name),
  active = COALESCE(EXCLUDED.active, public.leagues.active),
  is_demo = EXCLUDED.is_demo,
  raw = EXCLUDED.raw,
  synced_at = now();

INSERT INTO public.seasons (
  id, league_id, name, starting_at, ending_at, is_current, raw, synced_at
)
SELECT
  (item->>'id')::bigint,
  (item->>'league_id')::bigint,
  item->>'name',
  (item->>'starting_at')::date,
  (item->>'ending_at')::date,
  COALESCE((item->>'is_current')::boolean, false),
  COALESCE(item->'raw', '{}'::jsonb),
  now()
FROM src_seasons
WHERE EXISTS (
  SELECT 1 FROM public.leagues l WHERE l.id = (item->>'league_id')::bigint
)
ON CONFLICT (id) DO UPDATE SET
  league_id = EXCLUDED.league_id,
  name = COALESCE(EXCLUDED.name, public.seasons.name),
  starting_at = COALESCE(EXCLUDED.starting_at, public.seasons.starting_at),
  ending_at = COALESCE(EXCLUDED.ending_at, public.seasons.ending_at),
  is_current = COALESCE(EXCLUDED.is_current, public.seasons.is_current),
  raw = EXCLUDED.raw,
  synced_at = now();

UPDATE public.leagues l
SET current_season_id = (s.item->>'current_season_id')::bigint
FROM src_leagues s
WHERE l.id = (s.item->>'id')::bigint
  AND (s.item->>'current_season_id') IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.seasons x
    WHERE x.id = (s.item->>'current_season_id')::bigint
  );

INSERT INTO public.teams (
  id, name, short_code, country_id, image_path, founded, placeholder, raw, synced_at
)
SELECT
  (item->>'id')::bigint,
  item->>'name',
  item->>'short_code',
  (item->>'country_id')::bigint,
  item->>'image_path',
  (item->>'founded')::integer,
  COALESCE((item->>'placeholder')::boolean, false),
  COALESCE(item->'raw', '{}'::jsonb),
  now()
FROM src_teams
ON CONFLICT (id) DO UPDATE SET
  name = COALESCE(EXCLUDED.name, public.teams.name),
  short_code = COALESCE(EXCLUDED.short_code, public.teams.short_code),
  country_id = COALESCE(EXCLUDED.country_id, public.teams.country_id),
  image_path = COALESCE(EXCLUDED.image_path, public.teams.image_path),
  founded = COALESCE(EXCLUDED.founded, public.teams.founded),
  placeholder = COALESCE(EXCLUDED.placeholder, public.teams.placeholder),
  raw = EXCLUDED.raw,
  synced_at = now();

INSERT INTO public.team_seasons (season_id, team_id, raw, first_seen_at, last_seen_at)
SELECT
  (item->>'season_id')::bigint,
  (item->>'team_id')::bigint,
  COALESCE(item->'raw', '{}'::jsonb),
  now(),
  now()
FROM src_team_seasons
WHERE EXISTS (SELECT 1 FROM public.seasons s WHERE s.id = (item->>'season_id')::bigint)
  AND EXISTS (SELECT 1 FROM public.teams t WHERE t.id = (item->>'team_id')::bigint)
ON CONFLICT (season_id, team_id) DO UPDATE SET
  raw = EXCLUDED.raw,
  last_seen_at = now();

INSERT INTO public.players (
  id, common_name, firstname, lastname, name, display_name,
  country_id, nationality_id, nationality_name, city_id,
  position_id, detailed_position_id, position_name, detailed_position_name,
  height_cm, weight_kg, date_of_birth, gender, image_path,
  raw, first_seen_at, last_seen_at, updated_at
)
SELECT
  (item->>'id')::bigint,
  item->>'common_name', item->>'firstname', item->>'lastname',
  item->>'name', item->>'display_name',
  (item->>'country_id')::bigint, (item->>'nationality_id')::bigint,
  item->>'nationality_name', (item->>'city_id')::bigint,
  (item->>'position_id')::bigint, (item->>'detailed_position_id')::bigint,
  item->>'position_name', item->>'detailed_position_name',
  (item->>'height_cm')::integer, (item->>'weight_kg')::integer,
  (item->>'date_of_birth')::date, item->>'gender', item->>'image_path',
  COALESCE(item->'raw', '{}'::jsonb), now(), now(), now()
FROM src_players
ON CONFLICT (id) DO UPDATE SET
  common_name = COALESCE(EXCLUDED.common_name, public.players.common_name),
  firstname = COALESCE(EXCLUDED.firstname, public.players.firstname),
  lastname = COALESCE(EXCLUDED.lastname, public.players.lastname),
  name = COALESCE(EXCLUDED.name, public.players.name),
  display_name = COALESCE(EXCLUDED.display_name, public.players.display_name),
  country_id = COALESCE(EXCLUDED.country_id, public.players.country_id),
  nationality_id = COALESCE(EXCLUDED.nationality_id, public.players.nationality_id),
  nationality_name = COALESCE(EXCLUDED.nationality_name, public.players.nationality_name),
  city_id = COALESCE(EXCLUDED.city_id, public.players.city_id),
  position_id = COALESCE(EXCLUDED.position_id, public.players.position_id),
  detailed_position_id = COALESCE(EXCLUDED.detailed_position_id, public.players.detailed_position_id),
  position_name = COALESCE(EXCLUDED.position_name, public.players.position_name),
  detailed_position_name = COALESCE(EXCLUDED.detailed_position_name, public.players.detailed_position_name),
  height_cm = COALESCE(EXCLUDED.height_cm, public.players.height_cm),
  weight_kg = COALESCE(EXCLUDED.weight_kg, public.players.weight_kg),
  date_of_birth = COALESCE(EXCLUDED.date_of_birth, public.players.date_of_birth),
  gender = COALESCE(EXCLUDED.gender, public.players.gender),
  image_path = COALESCE(EXCLUDED.image_path, public.players.image_path),
  raw = EXCLUDED.raw,
  last_seen_at = now(),
  updated_at = now();

INSERT INTO public.squad_memberships (
  id, season_id, team_id, player_id, position_id, jersey_number,
  is_current, last_seen_run_id, raw, first_seen_at, last_seen_at, updated_at
)
SELECT
  (item->>'id')::bigint,
  (item->>'season_id')::bigint,
  (item->>'team_id')::bigint,
  (item->>'player_id')::bigint,
  (item->>'position_id')::bigint,
  (item->>'jersey_number')::integer,
  true,
  (SELECT (payload->>'run_id')::uuid FROM import_payload),
  COALESCE(item->'raw', '{}'::jsonb),
  now(), now(), now()
FROM src_memberships
WHERE EXISTS (SELECT 1 FROM public.seasons s WHERE s.id = (item->>'season_id')::bigint)
  AND EXISTS (SELECT 1 FROM public.teams t WHERE t.id = (item->>'team_id')::bigint)
  AND EXISTS (SELECT 1 FROM public.players p WHERE p.id = (item->>'player_id')::bigint)
ON CONFLICT (season_id, id) DO UPDATE SET
  team_id = EXCLUDED.team_id,
  player_id = EXCLUDED.player_id,
  position_id = COALESCE(EXCLUDED.position_id, public.squad_memberships.position_id),
  jersey_number = COALESCE(EXCLUDED.jersey_number, public.squad_memberships.jersey_number),
  is_current = true,
  last_seen_run_id = EXCLUDED.last_seen_run_id,
  raw = EXCLUDED.raw,
  last_seen_at = now(),
  updated_at = now();

UPDATE public.squad_memberships sm
SET is_current = false, updated_at = now()
WHERE (SELECT (payload->>'complete')::boolean FROM import_payload)
  AND sm.is_current
  AND sm.season_id IN (
    SELECT DISTINCT (item->>'season_id')::bigint FROM src_memberships
  )
  AND NOT EXISTS (
    SELECT 1 FROM src_memberships s
    WHERE (s.item->>'season_id')::bigint = sm.season_id
      AND (s.item->>'id')::bigint = sm.id
  );

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
  'leagues', (SELECT count(*) FROM src_leagues),
  'seasons', (SELECT count(*) FROM src_seasons),
  'teams', (SELECT count(*) FROM src_teams),
  'players', (SELECT count(*) FROM src_players),
  'memberships', (SELECT count(*) FROM src_memberships),
  'checkpoints', (SELECT count(*) FROM src_checkpoints)
)::text AS import_summary;

${finish}
`;
}

module.exports = { buildImportSql };
