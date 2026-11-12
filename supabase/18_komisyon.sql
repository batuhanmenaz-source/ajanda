-- 18: Influencer reklamı komisyon oranı (%)
alter table public.collabs add column if not exists commission numeric(5,2);
