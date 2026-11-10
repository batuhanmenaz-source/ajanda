-- Ajanda: günlük ciro takibi
-- Supabase > SQL Editor > New query içine yapıştırıp Run'a basın.

create table if not exists public.revenue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null,
  marketplace text not null,
  amount numeric(14,2) not null default 0,
  orders integer,
  updated_at timestamptz not null default now(),
  unique (user_id, day, marketplace)
);

create index if not exists revenue_user_day on public.revenue (user_id, day desc);

alter table public.revenue enable row level security;
drop policy if exists "sadece_kendi_kayitlarim" on public.revenue;
create policy "sadece_kendi_kayitlarim" on public.revenue
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Aylık ciro hedefi
alter table public.app_settings add column if not exists revenue_target numeric(14,2);
