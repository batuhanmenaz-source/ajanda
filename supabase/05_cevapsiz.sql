-- Ajanda: cevapsız çağrılar (telefondaki MacroDroid'den gelir)
-- Supabase > SQL Editor > New query içine yapıştırıp Run'a basın.

create table if not exists public.missed_calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text,
  phone text,
  missed_at timestamptz not null default now(),
  handled boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists missed_calls_user_time on public.missed_calls (user_id, missed_at desc);

alter table public.missed_calls enable row level security;
drop policy if exists "sadece_kendi_kayitlarim" on public.missed_calls;
create policy "sadece_kendi_kayitlarim" on public.missed_calls
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Telefonun Ajanda'ya kayıt gönderebilmesi için kişiye özel gizli anahtar
alter table public.app_settings add column if not exists webhook_token text unique;
