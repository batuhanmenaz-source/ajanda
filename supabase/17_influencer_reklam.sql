-- 17: Influencer reklam takibi (başlangıç/bitiş saati, platform, hesap)
alter table public.collabs add column if not exists start_at timestamptz;
alter table public.collabs add column if not exists end_at timestamptz;
alter table public.collabs add column if not exists platform text;
alter table public.collabs add column if not exists handle text;
create index if not exists collabs_user_start on public.collabs (user_id, start_at);
