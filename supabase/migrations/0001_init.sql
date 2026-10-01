-- ChainScope – initial schema (PostgreSQL / Supabase)
-- Apply with:  npm run db:migrate   (uses DATABASE_URL)
-- or paste into the Supabase SQL editor.

create extension if not exists "pgcrypto";

-- ── Users (prepared for auth; Supabase Auth can map auth.users.id here) ──────
create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  email         text unique,
  display_name  text,
  role          text not null default 'analyst' check (role in ('admin', 'analyst', 'viewer')),
  created_at    timestamptz not null default now()
);

-- ── Wallets analyzed ───────────────────────────────────────────────────────
create table if not exists wallets (
  chain             text not null,
  address           text not null,
  first_seen_at     timestamptz not null default now(),
  last_analyzed_at  timestamptz not null default now(),
  last_risk_score   smallint,
  last_risk_level   text,
  data_mode         text not null default 'live' check (data_mode in ('live', 'demo')),
  primary key (chain, address)
);
create index if not exists wallets_last_analyzed_idx on wallets (last_analyzed_at desc);

-- ── Analysis cache (full analysis document) ────────────────────────────────
create table if not exists analysis_cache (
  chain        text not null,
  address      text not null,
  data_mode    text not null,
  analysis     jsonb not null,
  created_at   timestamptz not null default now(),
  primary key (chain, address, data_mode)
);

-- ── Normalized transfers (phase 2+: persisted history for re-analysis) ─────
create table if not exists transactions (
  id            text not null,
  chain         text not null,
  wallet        text not null,
  hash          text not null,
  block_number  bigint,
  ts            timestamptz not null,
  direction     text not null check (direction in ('in', 'out', 'self')),
  counterparty  text,
  asset_symbol  text,
  asset_contract text,
  amount        numeric,
  usd_value     numeric,
  kind          text,
  primary key (chain, wallet, id)
);
create index if not exists transactions_wallet_ts_idx on transactions (chain, wallet, ts desc);

-- ── Counterparty snapshot per analysis ─────────────────────────────────────
create table if not exists counterparties (
  chain          text not null,
  wallet         text not null,
  address        text not null,
  entity_name    text,
  entity_type    text not null,
  incoming_usd   numeric not null default 0,
  outgoing_usd   numeric not null default 0,
  tx_count       integer not null default 0,
  exposure_pct   numeric not null default 0,
  last_interaction timestamptz,
  updated_at     timestamptz not null default now(),
  primary key (chain, wallet, address)
);

-- ── Entity registry (proprietary ChainScope labels) ────────────────────────
create table if not exists entities (
  id            uuid primary key default gen_random_uuid(),
  address       text not null,
  chain         text not null,            -- 'ethereum' | 'base' | 'bsc' | 'evm' (all EVM chains)
  entity_name   text not null,
  entity_type   text not null,
  source        text not null,
  confidence    numeric(3,2) not null check (confidence between 0 and 1),
  reference     text,
  last_updated  timestamptz not null default now(),
  unique (chain, address)
);
create index if not exists entities_address_idx on entities (address);

-- ── Sanctions entries (mirror of synced official lists) ────────────────────
create table if not exists sanctions_entries (
  address     text not null,
  currency    text not null,
  entity      text not null,
  program     text not null,
  source      text not null,
  reference   text not null,
  listed_at   date,
  synced_at   timestamptz not null default now(),
  primary key (source, currency, address)
);
create index if not exists sanctions_entries_address_idx on sanctions_entries (lower(address));

-- ── Risk indicators snapshot per analysis ──────────────────────────────────
create table if not exists risk_indicators (
  id                  uuid primary key default gen_random_uuid(),
  chain               text not null,
  wallet              text not null,
  category            text not null,
  indicator_group     text not null check (indicator_group in ('verified_intelligence', 'behavioral')),
  status              text not null,
  severity            text,
  score_contribution  numeric not null default 0,
  description         text not null,
  evidence            jsonb not null default '[]'::jsonb,
  source              text,
  created_at          timestamptz not null default now()
);
create index if not exists risk_indicators_wallet_idx on risk_indicators (chain, wallet);

-- ── Investigations (no mandatory personal data) ────────────────────────────
create table if not exists investigations (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid references users(id) on delete set null,
  client_reference  text not null default '',
  notes             text not null default '',
  chain             text not null,
  address           text not null,
  risk_score        smallint not null,
  risk_level        text not null,
  status            text not null default 'New' check (status in ('New', 'Reviewing', 'Cleared', 'Escalated')),
  data_mode         text not null default 'live'
);
create index if not exists investigations_created_idx on investigations (created_at desc);

-- ── Reports ────────────────────────────────────────────────────────────────
create table if not exists reports (
  id                     text primary key,           -- CS-YYYYMMDD-XXXXXX
  created_at             timestamptz not null default now(),
  chain                  text not null,
  address                text not null,
  risk_score             smallint not null,
  risk_level             text not null,
  data_mode              text not null,
  analysis_generated_at  timestamptz not null,
  analysis_snapshot      jsonb not null,           -- immutable copy of the analysis the report was built from
  investigation_id       uuid references investigations(id) on delete set null
);
create index if not exists reports_created_idx on reports (created_at desc);

-- ── Activity log ───────────────────────────────────────────────────────────
create table if not exists activity_log (
  id        uuid primary key default gen_random_uuid(),
  at        timestamptz not null default now(),
  type      text not null,
  message   text not null,
  chain     text,
  address   text
);
create index if not exists activity_log_at_idx on activity_log (at desc);
