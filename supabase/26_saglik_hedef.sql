-- 26: Sağlık hedefleri (spor, haftalık seans, amaç, adım/uyku hedefi)
alter table public.app_settings add column if not exists health_goals jsonb;
