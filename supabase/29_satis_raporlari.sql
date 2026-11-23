-- Ajanda: Pazaryeri satış raporları (Trendyol "Ürün bazlı satış raporu", Hepsiburada "Satış raporu" Excel'leri)
-- Supabase > SQL Editor > New query içine yapıştırıp Run'a basın. Birden fazla kez çalıştırmak güvenlidir.
-- Excel dosyasının kendisi saklanmaz; yalnız ürün bazlı özet (ürün, adet, ciro, iptal, iade, komisyon, stok) tutulur.
-- Müşteri bilgisi (ad, adres, telefon) bu raporlarda yoktur ve saklanmaz.
-- totals = { r: net ciro, q: satış adedi, o: sipariş, x: iptal, i: iade, f: komisyon, g: brüt ciro, d: indirim, n: ürün sayısı }
-- items  = [{ k: barkod/SKU, n: ürün adı, br: marka, c: kategori, q, o, x, i, g, d, r, f, s: stok, p: fiyat }]

create table if not exists public.sales_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  marketplace text not null,
  period_start date not null,
  period_end date not null,
  file_name text,
  totals jsonb not null default '{}'::jsonb,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists sales_reports_user on public.sales_reports (user_id, marketplace, period_end);

alter table public.sales_reports enable row level security;
drop policy if exists "sadece_kendi_kayitlarim" on public.sales_reports;
create policy "sadece_kendi_kayitlarim" on public.sales_reports for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
