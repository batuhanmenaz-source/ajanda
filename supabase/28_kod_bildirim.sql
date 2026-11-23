-- 28: İndirim kodu bitiş bildirimi (Google Takvim'deki "Ajanda" takvimine yazılan etkinliğin kimliği)
alter table public.inf_codes add column if not exists google_event_id text;
