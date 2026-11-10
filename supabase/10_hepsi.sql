-- Ajanda: yedekleme, rehber, influencer, özel günler, listeler, alışkanlıklar
-- Supabase > SQL Editor > New query içine yapıştırıp Run'a basın.
-- Birden fazla kez çalıştırmak güvenlidir.

-- Son yedek zamanı
alter table public.app_settings add column if not exists last_backup_at timestamptz;

-- ---------- Rehber (kişiler ve influencer'lar) ----------
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  phone text,
  company text,
  is_influencer boolean not null default false,
  handle text,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists contacts_user on public.contacts (user_id, name);

-- ---------- Influencer iş birlikleri ----------
create table if not exists public.collabs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  title text,
  brand text,
  marketplace text,
  publish_date date,
  fee numeric(14,2),
  status text not null default 'planlandi',
  link text,
  notes text,
  google_event_id text,
  created_at timestamptz not null default now()
);
create index if not exists collabs_user on public.collabs (user_id, publish_date);

-- ---------- Özel günler (her yıl tekrarlar) ----------
create table if not exists public.special_dates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  kind text not null default 'dogum',
  month smallint not null check (month between 1 and 12),
  day smallint not null check (day between 1 and 31),
  year smallint,
  remind_days smallint not null default 1,
  for_yarim boolean not null default false,
  google_event_id text,
  created_at timestamptz not null default now()
);
create index if not exists special_dates_user on public.special_dates (user_id, month, day);

-- ---------- Listeler ----------
create table if not exists public.lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.list_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  list_id uuid not null references public.lists(id) on delete cascade,
  label text not null,
  done boolean not null default false,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists list_items_list on public.list_items (list_id, sort);

-- ---------- Alışkanlıklar ----------
create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  emoji text,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  habit_id uuid not null references public.habits(id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  unique (habit_id, day)
);
create index if not exists habit_logs_user_day on public.habit_logs (user_id, day desc);

-- ---------- Güvenlik: herkes yalnız kendi kayıtlarını görür ----------
alter table public.contacts enable row level security;
alter table public.collabs enable row level security;
alter table public.special_dates enable row level security;
alter table public.lists enable row level security;
alter table public.list_items enable row level security;
alter table public.habits enable row level security;
alter table public.habit_logs enable row level security;

drop policy if exists "sadece_kendi_kayitlarim" on public.contacts;
drop policy if exists "sadece_kendi_kayitlarim" on public.collabs;
drop policy if exists "sadece_kendi_kayitlarim" on public.special_dates;
drop policy if exists "sadece_kendi_kayitlarim" on public.lists;
drop policy if exists "sadece_kendi_kayitlarim" on public.list_items;
drop policy if exists "sadece_kendi_kayitlarim" on public.habits;
drop policy if exists "sadece_kendi_kayitlarim" on public.habit_logs;

create policy "sadece_kendi_kayitlarim" on public.contacts for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "sadece_kendi_kayitlarim" on public.collabs for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "sadece_kendi_kayitlarim" on public.special_dates for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "sadece_kendi_kayitlarim" on public.lists for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "sadece_kendi_kayitlarim" on public.list_items for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "sadece_kendi_kayitlarim" on public.habits for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "sadece_kendi_kayitlarim" on public.habit_logs for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
