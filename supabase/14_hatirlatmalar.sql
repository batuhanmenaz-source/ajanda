-- Ajanda: her kayıt için "ne zaman hatırlatılsın" seçimi, notlara hatırlatma, varsayılanlar
-- Supabase > SQL Editor > New query içine yapıştırıp Run'a basın. Birden fazla kez çalıştırmak güvenlidir.

alter table public.reminders add column if not exists alerts jsonb;
alter table public.calls add column if not exists alerts jsonb;
alter table public.campaigns add column if not exists alerts jsonb;
alter table public.special_dates add column if not exists alerts jsonb;
alter table public.collabs add column if not exists alerts jsonb;
alter table public.notes add column if not exists alerts jsonb;

alter table public.notes add column if not exists remind_at timestamptz;
alter table public.notes add column if not exists google_event_id text;

alter table public.special_dates add column if not exists aux_event_id text;
alter table public.collabs add column if not exists aux_event_id text;

alter table public.app_settings add column if not exists alert_defaults jsonb;
