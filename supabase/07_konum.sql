-- Ajanda: etkinlik ve hatırlatmalara konum
-- Supabase > SQL Editor > New query içine yapıştırıp Run'a basın.

alter table public.campaigns add column if not exists location text;
alter table public.reminders add column if not exists location text;
