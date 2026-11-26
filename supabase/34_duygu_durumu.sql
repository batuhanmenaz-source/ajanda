-- 34: Yarim → Duygu durumu (ikimizin her gün sabah/akşam 1–10 puanı ve notu)
-- Supabase > SQL Editor > New query içine yapıştırıp Run'a basın. Birden fazla kez çalıştırmak güvenlidir.
-- r_* = Yarim (ilk kişi), b_* = ben (ikinci kişi). İsimler ve profil resimleri app_settings.yarim_prefs.mood içinde.
create table if not exists public.moods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null,
  r_am smallint check (r_am between 0 and 10),
  r_pm smallint check (r_pm between 0 and 10),
  b_am smallint check (b_am between 0 and 10),
  b_pm smallint check (b_pm between 0 and 10),
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, day)
);
create index if not exists moods_user_day on public.moods (user_id, day desc);
alter table public.moods enable row level security;
drop policy if exists "sadece_kendi_kayitlarim" on public.moods;
create policy "sadece_kendi_kayitlarim" on public.moods for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
