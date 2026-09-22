create table if not exists public.portfolios (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{"transactions":[],"goals":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.portfolios enable row level security;

drop policy if exists "Users can read their own portfolio" on public.portfolios;
create policy "Users can read their own portfolio"
on public.portfolios for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own portfolio" on public.portfolios;
create policy "Users can insert their own portfolio"
on public.portfolios for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own portfolio" on public.portfolios;
create policy "Users can update their own portfolio"
on public.portfolios for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
