BEGIN;
SET client_min_messages = warning;

CREATE TABLE IF NOT EXISTS public.player_transfers (
  id BIGINT PRIMARY KEY,
  player_id BIGINT NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  from_team_id BIGINT,
  to_team_id BIGINT,
  from_team_name TEXT,
  to_team_name TEXT,
  type_id BIGINT,
  type_name TEXT,
  type_code TEXT,
  transfer_date DATE,
  amount NUMERIC(20, 2) CHECK (amount IS NULL OR amount >= 0),
  amount_text TEXT,
  completed BOOLEAN,
  career_ended BOOLEAN,
  position_id BIGINT,
  detailed_position_id BIGINT,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_player_transfers_player_date
  ON public.player_transfers (player_id, transfer_date DESC NULLS LAST, id DESC);
CREATE INDEX IF NOT EXISTS idx_player_transfers_from_team
  ON public.player_transfers (from_team_id);
CREATE INDEX IF NOT EXISTS idx_player_transfers_to_team
  ON public.player_transfers (to_team_id);

CREATE OR REPLACE VIEW public.player_transfer_history AS
SELECT
  t.id AS transfer_id,
  t.player_id,
  p.display_name,
  p.common_name,
  p.name,
  t.transfer_date,
  t.from_team_id,
  t.from_team_name,
  t.to_team_id,
  t.to_team_name,
  t.type_id,
  t.type_name,
  t.type_code,
  t.amount,
  t.amount_text,
  t.completed,
  t.career_ended,
  t.position_id,
  t.detailed_position_id,
  t.synced_at
FROM public.player_transfers t
JOIN public.players p ON p.id = t.player_id;

COMMIT;
