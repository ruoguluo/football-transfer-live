BEGIN;
SET client_min_messages = warning;

CREATE TABLE IF NOT EXISTS public.player_socials (
  id BIGSERIAL PRIMARY KEY,
  player_id BIGINT NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  handle TEXT,
  url TEXT NOT NULL CHECK (url ~* '^https?://'),
  source_name TEXT,
  source_url TEXT CHECK (source_url IS NULL OR source_url ~* '^https?://'),
  verified BOOLEAN NOT NULL DEFAULT false,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (player_id, platform, url)
);

CREATE INDEX IF NOT EXISTS idx_player_socials_player
  ON public.player_socials (player_id, platform);
CREATE INDEX IF NOT EXISTS idx_player_socials_platform
  ON public.player_socials (platform);

CREATE OR REPLACE VIEW public.player_social_links AS
SELECT
  s.id,
  s.player_id,
  p.display_name,
  p.common_name,
  p.name,
  s.platform,
  s.handle,
  s.url,
  s.source_name,
  s.source_url,
  s.verified,
  s.updated_at
FROM public.player_socials s
JOIN public.players p ON p.id = s.player_id;

COMMIT;
