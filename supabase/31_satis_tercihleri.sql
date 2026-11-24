-- 31: Satış raporu tercihleri ve günlük özet (hero ürünler, Bugün sayfasındaki satış özeti)
-- Supabase > SQL Editor > New query içine yapıştırıp Run'a basın. Birden fazla kez çalıştırmak güvenlidir.
-- sales_prefs = { heroes: ["c:4682", ...], digest: { day, r, d1, dw, wr, ww, alerts: [...] } } (birkaç KB)
alter table public.app_settings add column if not exists sales_prefs jsonb;
