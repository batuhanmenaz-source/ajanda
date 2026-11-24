-- Ajanda: Ürün listesi (barkod → stok kodu eşlemesi)
-- Supabase > SQL Editor > New query içine yapıştırıp Run'a basın. Birden fazla kez çalıştırmak güvenlidir.
-- Trendyol satış raporunda stok kodu olmadığı için ürünler barkoddan stok koduna bu listeyle bağlanır.
-- Kişi başına tek satır: items = [["barkod","stok kodu"], ...]. Yalnız Satış raporları sayfası açılınca okunur.

create table if not exists public.product_catalog (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  file_name text,
  updated_at timestamptz not null default now()
);

alter table public.product_catalog enable row level security;
drop policy if exists "sadece_kendi_kayitlarim" on public.product_catalog;
create policy "sadece_kendi_kayitlarim" on public.product_catalog for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
