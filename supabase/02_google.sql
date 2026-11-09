-- Ajanda: Google Takvim bağlantısı için ek tablo ve sütunlar
-- Supabase > SQL Editor > New query içine yapıştırıp Run'a basın.

create table if not exists public.google_tokens (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  refresh_token text not null,
  updated_at timestamptz not null default now()
);

alter table public.google_tokens enable row level security;
drop policy if exists "sadece_kendi_kayitlarim" on public.google_tokens;
create policy "sadece_kendi_kayitlarim" on public.google_tokens
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Kampanya hazırlık hatırlatmalarının Google etkinlik kimlikleri
alter table public.campaigns add column if not exists prep_event_ids text[] not null default '{}';
