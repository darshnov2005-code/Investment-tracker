-- Run this once in Supabase → SQL Editor → New query → Run
-- Free tier is enough for personal multi-device sync.

create table if not exists public.portfolio_sync (
  sync_id text primary key,
  ciphertext text not null,
  iv text not null,
  salt text not null,
  updated_at timestamptz not null default now(),
  device_label text,
  meta jsonb default '{}'::jsonb
);

create index if not exists portfolio_sync_updated_at_idx
  on public.portfolio_sync (updated_at desc);

alter table public.portfolio_sync enable row level security;

-- No public policies: only the service role (Vercel API) can read/write.
-- Do NOT enable anon access to this table.

comment on table public.portfolio_sync is
  'Encrypted InvestTrack backups. Payload is AES-GCM ciphertext; only sync_id holders + PIN can restore.';
