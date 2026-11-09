-- Ajanda: veritabanı tabloları
-- Supabase > SQL Editor > New query içine yapıştırıp Run'a basın.

-- Pazaryerleri (renkleriyle)
create table if not exists public.marketplaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#868B96',
  sort int not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

-- Hatırlatmalar
create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  due_at timestamptz,
  all_day boolean not null default false,
  marketplace text,
  repeat_rule text,
  done boolean not null default false,
  google_event_id text,
  created_at timestamptz not null default now()
);

-- Aramalar
create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  who text not null,
  topic text,
  phone text,
  due_at timestamptz,
  done boolean not null default false,
  google_event_id text,
  created_at timestamptz not null default now()
);

-- Pazaryeri notları
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  marketplace text,
  brand text,
  title text not null,
  body text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Günlük notlar (her gün için bir not)
create table if not exists public.daily_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  note_date date not null,
  body text not null default '',
  updated_at timestamptz not null default now(),
  unique (user_id, note_date)
);

-- Kampanyalar
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  marketplace text,
  start_date date not null,
  end_date date not null,
  notes text,
  google_event_id text,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

-- Kampanya hazırlık adımları
create table if not exists public.campaign_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  label text not null,
  done boolean not null default false,
  sort int not null default 0
);

-- Hızlı arama için indeksler
create index if not exists reminders_user_due on public.reminders (user_id, due_at);
create index if not exists calls_user_due on public.calls (user_id, due_at);
create index if not exists notes_user_created on public.notes (user_id, created_at desc);
create index if not exists campaigns_user_start on public.campaigns (user_id, start_date);
create index if not exists campaign_tasks_campaign on public.campaign_tasks (campaign_id);

-- Güvenlik: herkes yalnızca kendi kayıtlarını görebilir ve değiştirebilir
do $$
declare t text;
begin
  foreach t in array array['marketplaces','reminders','calls','notes','daily_notes','campaigns','campaign_tasks']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "sadece_kendi_kayitlarim" on public.%I', t);
    execute format(
      'create policy "sadece_kendi_kayitlarim" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t
    );
  end loop;
end $$;
