-- 32: Kampanya indirim kurguları (2. ürüne %20, 5 Al 4 Öde, sepette %10, ödül ürün, indirim kodu…) ve kullanım takibi
-- Supabase > SQL Editor > New query içine yapıştırıp Run'a basın. Birden fazla kez çalıştırmak güvenlidir.
-- type: net | kosullu | birlikte | kod     cond: tutar | adet | xurun | sepet | tamamlayici
-- disc_type: yuzde | tl | xaly (X Al Y Öde) | odul (ödül ürün X TL)
-- reward: Birlikte Al'da ödül / tamamlayıcı ürün(ler)
-- threshold: min. sepet tutarı / ürün adedi / X. ürün     pay_qty: X Al Y Öde'deki Y
-- uses = kullanım girişleri [{ d: 'YYYY-AA-GG', n: o güne kadarki toplam kullanım, rev: o güne kadarki satış (isteğe bağlı) }]

create table if not exists public.promos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  marketplace text,
  name text,
  type text not null default 'kosullu',
  cond text,
  disc_type text not null default 'yuzde',
  disc_value numeric(12,2),
  threshold numeric(12,2),
  pay_qty integer,
  reward text,
  code text,
  scope text not null default 'tum',
  scope_note text,
  order_limit integer,
  start_at timestamptz,
  end_at timestamptz,
  uses jsonb not null default '[]'::jsonb,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists promos_user on public.promos (user_id, start_at);
create index if not exists promos_campaign on public.promos (campaign_id);

alter table public.promos enable row level security;
drop policy if exists "sadece_kendi_kayitlarim" on public.promos;
create policy "sadece_kendi_kayitlarim" on public.promos for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Pazaryeri başına indirim hakları (ör. Trendyol: net 100, koşullu 50, birlikte al 50, kod 10)
alter table public.app_settings add column if not exists promo_quota jsonb;
