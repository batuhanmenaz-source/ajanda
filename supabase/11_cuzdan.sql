-- Ajanda: Cüzdan (kişisel gelir/gider, sabit giderler, bütçe) ve İş/Özel ayrımı
-- Supabase > SQL Editor > New query içine yapıştırıp Run'a basın.
-- Birden fazla kez çalıştırmak güvenlidir.

-- Hatırlatma ve aramalarda İş / Özel seçimi
alter table public.reminders add column if not exists scope text;
alter table public.calls add column if not exists scope text;

-- Aylık kategori bütçeleri
alter table public.app_settings add column if not exists budgets jsonb;

-- Sabit giderler / düzenli gelirler (kira, fatura, abonelik, maaş…)
create table if not exists public.money_fixed (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  kind text not null default 'gider',
  amount numeric(14,2) not null,
  category text not null default 'diger',
  day_of_month smallint not null default 1 check (day_of_month between 1 and 31),
  method text,
  remind boolean not null default true,
  reminder_id uuid,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Gelir / gider kayıtları
create table if not exists public.money (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null,
  kind text not null default 'gider',
  amount numeric(14,2) not null check (amount > 0),
  category text not null default 'diger',
  note text,
  method text,
  fixed_id uuid references public.money_fixed(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists money_user_day on public.money (user_id, day desc);
create index if not exists money_fixed_user on public.money_fixed (user_id, day_of_month);

-- Güvenlik: herkes yalnız kendi kayıtlarını görür
alter table public.money enable row level security;
alter table public.money_fixed enable row level security;

drop policy if exists "sadece_kendi_kayitlarim" on public.money;
drop policy if exists "sadece_kendi_kayitlarim" on public.money_fixed;

create policy "sadece_kendi_kayitlarim" on public.money for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "sadece_kendi_kayitlarim" on public.money_fixed for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
