-- 21: Bekleyen talebi bir gönderilmiş maile bağla (cevap gelince kendiliğinden kapanır)
alter table public.followups add column if not exists mail_id text;
create index if not exists followups_user_mail on public.followups (user_id, mail_id);
