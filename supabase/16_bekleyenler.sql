-- Ajanda: bekleyen talepler (kimden ne bekleniyor, kaç gündür)
-- Supabase > SQL Editor > New query içine yapıştırıp Run'a basın. Birden fazla kez çalıştırmak güvenlidir.

create table if not exists public.followups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  party text,
  marketplace text,
  note text,
  since date not null default current_date,
  nudge_days smallint,
  nudge_reminder_id uuid,
  done boolean not null default false,
  done_at date,
  created_at timestamptz not null default now()
);
create index if not exists followups_user on public.followups (user_id, done, since);

alter table public.followups enable row level security;
drop policy if exists "sadece_kendi_kayitlarim" on public.followups;
create policy "sadece_kendi_kayitlarim" on public.followups for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
