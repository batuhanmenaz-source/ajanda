-- Ajanda: çok günlü etkinlikler (kampanya dışındaki fuar, izin, tatil vb.)
-- Supabase > SQL Editor > New query içine yapıştırıp Run'a basın.

alter table public.campaigns add column if not exists kind text not null default 'kampanya';
