-- 19: Cüzdan için kendi gelir/gider kategorilerin
alter table public.app_settings add column if not exists money_cats jsonb;
