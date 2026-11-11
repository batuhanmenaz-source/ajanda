-- Ajanda: Yarim alanı — anı defteri, onun sevdikleri, hediye fikirleri, birlikte yapılacaklar, sürpriz hatırlatıcısı
-- Supabase > SQL Editor > New query içine yapıştırıp Run'a basın. Birden fazla kez çalıştırmak güvenlidir.

-- Sevdikleri / hediye fikirleri / birlikte yapılacaklar (tek tablo, "kind" ile ayrılır)
create table if not exists public.yarim_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  detail text,
  category text,
  link text,
  price numeric(14,2),
  location text,
  location_geo text,
  done boolean not null default false,
  done_at date,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists yarim_items_user on public.yarim_items (user_id, kind);

-- Anı defteri
create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null,
  title text not null,
  note text,
  photo_path text,
  created_at timestamptz not null default now()
);
create index if not exists memories_user_day on public.memories (user_id, day desc);

alter table public.yarim_items enable row level security;
alter table public.memories enable row level security;
drop policy if exists "sadece_kendi_kayitlarim" on public.yarim_items;
drop policy if exists "sadece_kendi_kayitlarim" on public.memories;
create policy "sadece_kendi_kayitlarim" on public.yarim_items for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "sadece_kendi_kayitlarim" on public.memories for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Sürpriz hatırlatıcısı ve hediye hatırlatma ayarları
alter table public.app_settings add column if not exists yarim_prefs jsonb;

-- Anı fotoğrafları: herkese kapalı kutu, herkes yalnız kendi klasörü
insert into storage.buckets (id, name, public)
values ('anilar', 'anilar', false)
on conflict (id) do nothing;

drop policy if exists "anilar_kendi" on storage.objects;
create policy "anilar_kendi" on storage.objects for all to authenticated
  using (bucket_id = 'anilar' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'anilar' and (storage.foldername(name))[1] = auth.uid()::text);
