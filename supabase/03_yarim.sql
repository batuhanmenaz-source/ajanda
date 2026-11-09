-- Ajanda: "Yarim" alanı için hatırlatma ve aramalara işaret sütunu
-- Supabase > SQL Editor > New query içine yapıştırıp Run'a basın.

alter table public.reminders add column if not exists for_yarim boolean not null default false;
alter table public.calls add column if not exists for_yarim boolean not null default false;
