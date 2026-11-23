-- 25: Google Health (Fitbit Air) bağlantısı
-- Yenileme anahtarı yalnızca sunucu tarafından (gizli anahtarla) okunur/yazılır; tarayıcı bu tabloya erişemez.
create table if not exists public.health_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  refresh_token text not null,
  scopes text,
  updated_at timestamptz not null default now()
);
alter table public.health_tokens enable row level security;
