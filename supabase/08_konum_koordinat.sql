-- Ajanda: konumların koordinatı (harita pini için)
-- Supabase > SQL Editor > New query içine yapıştırıp Run'a basın.

alter table public.campaigns add column if not exists location_geo text;
alter table public.reminders add column if not exists location_geo text;
