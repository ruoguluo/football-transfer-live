'use strict';

const { loadEnvFile } = require('./lib/env');
const { runPsql } = require('./lib/psql');

loadEnvFile();

const SQL = `
WITH league_summary AS (
  SELECT
    l.code,
    l.name,
    l.is_demo,
    s.id AS season_id,
    (SELECT count(*) FROM public.team_seasons ts WHERE ts.season_id = s.id) AS teams,
    (SELECT count(*) FROM public.squad_memberships sm
      WHERE sm.season_id = s.id AND sm.is_current) AS current_memberships,
    (SELECT count(DISTINCT sm.player_id) FROM public.squad_memberships sm
      WHERE sm.season_id = s.id AND sm.is_current) AS current_players
  FROM public.leagues l
  JOIN public.seasons s ON s.id = l.current_season_id
), totals AS (
  SELECT
    (SELECT count(*) FROM public.players) AS players,
    (SELECT count(*) FROM public.players WHERE display_name IS NULL) AS missing_display_name,
    (SELECT count(*) FROM public.players WHERE date_of_birth IS NULL) AS missing_birth_date,
    (SELECT count(*) FROM public.players WHERE nationality_id IS NULL) AS missing_nationality,
    (SELECT count(*) FROM public.players WHERE position_id IS NULL) AS missing_position,
    (SELECT count(*) FROM public.squad_memberships WHERE is_current) AS current_memberships,
    (SELECT count(*) FROM public.current_top5_players) AS top_five_view_rows,
    (SELECT count(*) FROM public.current_demo_players) AS demo_view_rows,
    (SELECT count(DISTINCT player_id) FROM public.current_demo_players) AS demo_players,
    (SELECT count(*) FROM public.player_transfers) AS transfer_records,
    (SELECT count(DISTINCT player_id) FROM public.player_transfers) AS players_with_transfers,
    (SELECT count(*) FROM public.player_transfers WHERE transfer_date IS NULL) AS missing_transfer_date,
    (SELECT count(*) FROM public.player_socials) AS social_links,
    (SELECT count(DISTINCT player_id) FROM public.player_socials) AS players_with_socials
)
SELECT jsonb_build_object(
  'generated_at', now(),
  'leagues', COALESCE(
    (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.is_demo, x.code) FROM league_summary x),
    '[]'::jsonb
  ),
  'top_five_leagues', COALESCE(
    (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.code) FROM league_summary x WHERE NOT x.is_demo),
    '[]'::jsonb
  ),
  'demo_leagues', COALESCE(
    (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.code) FROM league_summary x WHERE x.is_demo),
    '[]'::jsonb
  ),
  'totals', (SELECT to_jsonb(t) FROM totals t),
  'latest_sync', COALESCE(
    (SELECT to_jsonb(r) FROM (
      SELECT id, mode, status, requested_leagues, stats, error, started_at, finished_at
      FROM public.sync_runs ORDER BY started_at DESC LIMIT 1
    ) r),
    'null'::jsonb
  )
)::text;
`;

async function main() {
  const databaseUrl = (process.env.DATABASE_URL || '').trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is missing from .env.');
  const output = runPsql({ databaseUrl, sql: SQL });
  console.log(JSON.stringify(JSON.parse(output), null, 2));
}

main().catch(error => {
  console.error(`Verification failed: ${error.message}`);
  process.exitCode = 1;
});
