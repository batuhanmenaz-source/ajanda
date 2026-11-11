-- Ajanda: kampanya / etkinlik başlangıç ve bitiş saati
-- (06–08'deki kampanya sütunları da burada; eksik kaldıysa bu dosya tamamlar)
-- Supabase > SQL Editor > New query içine yapıştırıp Run'a basın. Birden fazla kez çalıştırmak güvenlidir.

alter table public.campaigns add column if not exists kind text not null default 'kampanya';
alter table public.campaigns add column if not exists location text;
alter table public.campaigns add column if not exists location_geo text;
alter table public.campaigns add column if not exists start_time text;
alter table public.campaigns add column if not exists end_time text;
