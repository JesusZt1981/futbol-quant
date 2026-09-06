-- Fútbol Quant v1 — esquema inicial para Supabase/Postgres
-- Ejecutar en Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  provider_team_id bigint,
  name text not null,
  country text,
  league_key text,
  venue jsonb,
  created_at timestamptz not null default now(),
  unique(provider_team_id)
);

create table if not exists fixtures (
  id uuid primary key default gen_random_uuid(),
  provider_fixture_id bigint unique,
  competition text,
  season int,
  kickoff timestamptz,
  home_team_id bigint,
  away_team_id bigint,
  status text,
  home_goals int,
  away_goals int,
  venue jsonb,
  weather jsonb,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists fixture_team_stats (
  id uuid primary key default gen_random_uuid(),
  provider_fixture_id bigint not null,
  provider_team_id bigint not null,
  side text check (side in ('home','away')),
  xg numeric,
  shots int,
  shots_on_target int,
  possession numeric,
  corners int,
  fouls int,
  yellow_cards int,
  red_cards int,
  passes int,
  pass_accuracy numeric,
  big_chances int,
  ppda numeric,
  raw jsonb,
  created_at timestamptz not null default now(),
  unique(provider_fixture_id, provider_team_id)
);

create table if not exists player_fixture_stats (
  id uuid primary key default gen_random_uuid(),
  provider_fixture_id bigint not null,
  provider_player_id bigint not null,
  provider_team_id bigint,
  minutes int,
  rating numeric,
  goals int,
  assists int,
  shots int,
  shots_on_target int,
  passes int,
  key_passes int,
  tackles int,
  interceptions int,
  fouls_committed int,
  fouls_drawn int,
  yellow_cards int,
  red_cards int,
  raw jsonb,
  created_at timestamptz not null default now(),
  unique(provider_fixture_id, provider_player_id)
);

create table if not exists availability (
  id uuid primary key default gen_random_uuid(),
  provider_fixture_id bigint,
  provider_team_id bigint not null,
  provider_player_id bigint,
  type text not null,
  reason text,
  impact_score numeric,
  source text,
  observed_at timestamptz not null default now(),
  raw jsonb
);

create table if not exists odds_snapshots (
  id uuid primary key default gen_random_uuid(),
  provider_fixture_id bigint,
  event_key text,
  bookmaker text not null,
  market text not null,
  selection text not null,
  line numeric,
  decimal_odds numeric not null,
  observed_at timestamptz not null default now(),
  is_closing boolean default false,
  raw jsonb
);
create index if not exists idx_odds_fixture_time on odds_snapshots(provider_fixture_id, observed_at);
create index if not exists idx_odds_event_time on odds_snapshots(event_key, observed_at);

create table if not exists progol_draws (
  id uuid primary key default gen_random_uuid(),
  draw_number text,
  draw_type text default 'media_semana',
  draw_date date,
  line_cost numeric default 15,
  jackpot numeric,
  status text,
  source_url text,
  created_at timestamptz not null default now(),
  unique(draw_type, draw_number)
);

create table if not exists progol_matches (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid references progol_draws(id) on delete cascade,
  position int not null check(position between 1 and 14),
  home_name text not null,
  away_name text not null,
  provider_fixture_id bigint,
  public_l numeric,
  public_e numeric,
  public_v numeric,
  result text check(result in ('L','E','V') or result is null),
  created_at timestamptz not null default now(),
  unique(draw_id, position)
);

create table if not exists model_runs (
  id uuid primary key default gen_random_uuid(),
  model_version text not null,
  provider_fixture_id bigint,
  run_at timestamptz not null default now(),
  cutoff_at timestamptz,
  p_home numeric not null,
  p_draw numeric not null,
  p_away numeric not null,
  p_over25 numeric,
  p_btts numeric,
  xg_home numeric,
  xg_away numeric,
  data_quality numeric,
  lineup_confidence numeric,
  risk_score numeric,
  features jsonb,
  explanation jsonb,
  frozen boolean not null default true
);
create index if not exists idx_model_fixture_run on model_runs(provider_fixture_id, run_at);

create table if not exists predictions (
  id uuid primary key default gen_random_uuid(),
  model_run_id uuid references model_runs(id) on delete cascade,
  market text not null,
  selection text not null,
  model_probability numeric not null,
  fair_odds numeric,
  bookmaker text,
  taken_odds numeric,
  market_probability numeric,
  edge numeric,
  expected_value numeric,
  created_at timestamptz not null default now()
);

create table if not exists bets (
  id uuid primary key default gen_random_uuid(),
  prediction_id uuid references predictions(id),
  mode text not null default 'paper' check(mode in ('paper','real')),
  bankroll_before numeric,
  stake numeric not null,
  decimal_odds numeric not null,
  result text,
  pnl numeric,
  closing_odds numeric,
  clv numeric,
  settled_at timestamptz,
  created_at timestamptz not null default now()
);

-- Tabla genérica usada por la API v1 para snapshots auditables.
create table if not exists snapshots (
  id uuid primary key default gen_random_uuid(),
  kind text,
  provider_fixture_id bigint,
  payload jsonb,
  observed_at timestamptz default now(),
  created_at timestamptz not null default now()
);

-- IMPORTANTE: la service role solo debe existir en backend. Nunca exponerla al navegador.
