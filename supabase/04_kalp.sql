-- Ajanda: Yarim ayarları (WhatsApp numarası, mesaj) ve kalp sayacı
-- Supabase > SQL Editor > New query içine yapıştırıp Run'a basın.

create table if not exists public.app_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  yarim_phone text,
  love_message text not null default 'Seni seviyorum ❤️',
  updated_at timestamptz not null default now()
);

create table if not exists public.love_taps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;
alter table public.love_taps enable row level security;

drop policy if exists "sadece_kendi_kayitlarim" on public.app_settings;
create policy "sadece_kendi_kayitlarim" on public.app_settings
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "sadece_kendi_kayitlarim" on public.love_taps;
create policy "sadece_kendi_kayitlarim" on public.love_taps
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
