-- Ajanda: Influencer indirim kodları (reklamlardan ayrı takip ve kullanım adedine göre rapor)
-- Supabase > SQL Editor > New query içine yapıştırıp Run'a basın. Birden fazla kez çalıştırmak güvenlidir.
-- uses = kullanım girişleri [{ d: 'YYYY-AA-GG', n: o güne kadarki toplam kullanım, rev: o güne kadarki kodlu satış (isteğe bağlı) }]

create table if not exists public.inf_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  code text not null,
  handle text,
  marketplace text,
  brand text,
  disc_type text not null default 'yuzde',
  disc_value numeric(12,2),
  min_basket numeric(12,2),
  use_limit integer,
  scope text not null default 'tum',
  scope_note text,
  start_at timestamptz,
  end_at timestamptz,
  uses jsonb not null default '[]'::jsonb,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists inf_codes_user on public.inf_codes (user_id, start_at);

alter table public.inf_codes enable row level security;
drop policy if exists "sadece_kendi_kayitlarim" on public.inf_codes;
create policy "sadece_kendi_kayitlarim" on public.inf_codes for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
