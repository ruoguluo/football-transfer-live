BEGIN;
SET client_min_messages = warning;

CREATE TABLE IF NOT EXISTS public.sync_runs (
  id UUID PRIMARY KEY,
  mode TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'partial', 'failed')),
  requested_leagues TEXT[] NOT NULL DEFAULT '{}',
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.sync_checkpoints (
  scope TEXT PRIMARY KEY,
  last_run_id UUID REFERENCES public.sync_runs(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed')),
  cursor TEXT,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.leagues (
  id BIGINT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  country_id BIGINT,
  country_name TEXT,
  current_season_id BIGINT,
  active BOOLEAN NOT NULL DEFAULT true,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.seasons (
  id BIGINT PRIMARY KEY,
  league_id BIGINT NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  starting_at DATE,
  ending_at DATE,
  is_current BOOLEAN NOT NULL DEFAULT false,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leagues_current_season_id_fkey'
  ) THEN
    ALTER TABLE public.leagues
      ADD CONSTRAINT leagues_current_season_id_fkey
      FOREIGN KEY (current_season_id) REFERENCES public.seasons(id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.teams (
  id BIGINT PRIMARY KEY,
  name TEXT NOT NULL,
  short_code TEXT,
  country_id BIGINT,
  image_path TEXT,
  founded INTEGER CHECK (founded IS NULL OR founded > 0),
  placeholder BOOLEAN NOT NULL DEFAULT false,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.team_seasons (
  season_id BIGINT NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  team_id BIGINT NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (season_id, team_id)
);

CREATE TABLE IF NOT EXISTS public.players (
  id BIGINT PRIMARY KEY,
  common_name TEXT,
  firstname TEXT,
  lastname TEXT,
  name TEXT,
  display_name TEXT,
  country_id BIGINT,
  nationality_id BIGINT,
  nationality_name TEXT,
  city_id BIGINT,
  position_id BIGINT,
  detailed_position_id BIGINT,
  position_name TEXT,
  detailed_position_name TEXT,
  height_cm INTEGER CHECK (height_cm IS NULL OR height_cm > 0),
  weight_kg INTEGER CHECK (weight_kg IS NULL OR weight_kg > 0),
  date_of_birth DATE,
  gender TEXT,
  image_path TEXT,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.squad_memberships (
  id BIGINT NOT NULL,
  season_id BIGINT NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  team_id BIGINT NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  player_id BIGINT NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  position_id BIGINT,
  jersey_number INTEGER CHECK (jersey_number IS NULL OR jersey_number >= 0),
  is_current BOOLEAN NOT NULL DEFAULT true,
  last_seen_run_id UUID,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (season_id, id)
);

CREATE INDEX IF NOT EXISTS idx_team_seasons_team_season
  ON public.team_seasons (team_id, season_id);
CREATE INDEX IF NOT EXISTS idx_players_nationality
  ON public.players (nationality_id);
CREATE INDEX IF NOT EXISTS idx_players_position
  ON public.players (position_id);
CREATE INDEX IF NOT EXISTS idx_squad_memberships_current_team
  ON public.squad_memberships (season_id, team_id) WHERE is_current;
CREATE INDEX IF NOT EXISTS idx_squad_memberships_player_season
  ON public.squad_memberships (player_id, season_id);

CREATE OR REPLACE VIEW public.current_league_players AS
SELECT
  l.code AS league_code,
  l.name AS league_name,
  l.is_demo,
  s.id AS season_id,
  t.id AS team_id,
  t.name AS team_name,
  p.id AS player_id,
  p.display_name,
  p.common_name,
  p.name,
  p.date_of_birth,
  p.nationality_id,
  p.nationality_name,
  p.position_id,
  p.position_name,
  p.detailed_position_id,
  p.detailed_position_name,
  p.height_cm,
  p.weight_kg,
  p.image_path,
  sm.jersey_number,
  sm.id AS source_squad_id
FROM public.leagues l
JOIN public.seasons s ON s.id = l.current_season_id
JOIN public.team_seasons ts ON ts.season_id = s.id
JOIN public.teams t ON t.id = ts.team_id
JOIN public.squad_memberships sm
  ON sm.season_id = s.id AND sm.team_id = t.id AND sm.is_current
JOIN public.players p ON p.id = sm.player_id;

CREATE OR REPLACE VIEW public.current_top5_players AS
SELECT
  league_code, league_name, season_id, team_id, team_name,
  player_id, display_name, common_name, name, date_of_birth,
  nationality_id, nationality_name, position_id, position_name,
  detailed_position_id, detailed_position_name, height_cm, weight_kg,
  image_path, jersey_number, source_squad_id, is_demo
FROM public.current_league_players
WHERE league_code IN ('epl', 'la_liga', 'serie_a', 'bundesliga', 'ligue_1')
  AND NOT is_demo;

CREATE OR REPLACE VIEW public.current_demo_players AS
SELECT * FROM public.current_league_players WHERE is_demo;

COMMIT;
