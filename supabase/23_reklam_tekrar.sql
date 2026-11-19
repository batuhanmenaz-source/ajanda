-- 23: Influencer reklamları: dolaylı komisyon ve tekrarlı (otomatik yenilenen) reklamlar
-- commission  = doğrudan (ya da tek) komisyon, commission2 = dolaylı komisyon
-- runs        = tekrarlı reklamın dönemleri [{ s, e, fee, rev }], renew = otomatik yenileniyor
alter table public.collabs add column if not exists commission2 numeric(5,2);
alter table public.collabs add column if not exists runs jsonb;
alter table public.collabs add column if not exists renew boolean not null default false;
