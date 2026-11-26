-- 33: Ajanda'nın kendi bildirimleri (telefon bildirimi: Yapıldı / Yarına ertele düğmeleri, sabah özeti, satış-stok, kurgu, ciro uyarıları)
-- Supabase > SQL Editor > New query içine yapıştırıp Run'a basın. Birden fazla kez çalıştırmak güvenlidir.

-- Bildirim alan cihazlar (her telefon/tarayıcı bir satır)
create table if not exists public.push_subs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  token text not null,          -- bildirimdeki düğmelerin (Yapıldı / Ertele) bu cihazdan geldiğini doğrular
  device text,
  created_at timestamptz not null default now(),
  last_ok timestamptz
);
create index if not exists push_subs_user on public.push_subs (user_id);
alter table public.push_subs enable row level security;
drop policy if exists "sadece_kendi_kayitlarim" on public.push_subs;
create policy "sadece_kendi_kayitlarim" on public.push_subs for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Gönderilen bildirimler (aynı bildirim iki kez gitmesin)
create table if not exists public.push_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.push_log enable row level security;
drop policy if exists "sadece_kendi_kayitlarim" on public.push_log;
create policy "sadece_kendi_kayitlarim" on public.push_log for select to authenticated using (user_id = auth.uid());

-- Bildirim ayarları (hangi bildirim, hangi saatte)
alter table public.app_settings add column if not exists notify jsonb;

-- Zamanlayıcının gizli anahtarı: yalnız sunucu okur (tarayıcıdan okunamaz)
create table if not exists public.push_cron (
  id integer primary key default 1,
  secret text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
);
alter table public.push_cron enable row level security;
insert into public.push_cron (id) values (1) on conflict (id) do nothing;

-- Zamanlayıcı: cron-job.org her dakika aşağıdaki adresi çağırır (Supabase pg_cron bu projede kurulamadı).
-- Bu sorgunun sonucundaki adresi kopyalayıp cron-job.org'a gir.
select 'https://ajanda-nu.vercel.app/api/push?action=tick&key=' || secret as zamanlayici_adresi from public.push_cron where id = 1;
