-- 27: Tekrarlanan etkinlikler (tek günlük etkinliklerde "her salı", "2 haftada bir", bitiş tarihi)
alter table public.campaigns add column if not exists repeat_rule text;
