-- 20: Influencer reklamının sonucu: reklamdan gelen ciro (KDV dahil)
alter table public.collabs add column if not exists ad_revenue numeric(14,2);
