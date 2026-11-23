-- 26: Sağlık hedefleri ve haftalık koç yorumu
alter table public.app_settings add column if not exists health_goals jsonb;
alter table public.app_settings add column if not exists health_coach jsonb;
