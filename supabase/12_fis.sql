-- Ajanda: fiş fotoğrafları
-- Supabase > SQL Editor > New query içine yapıştırıp Run'a basın.
-- Birden fazla kez çalıştırmak güvenlidir.

-- Harcama kaydına fiş fotoğrafının yeri
alter table public.money add column if not exists receipt_path text;

-- Fotoğrafların durduğu özel (herkese kapalı) kutu
insert into storage.buckets (id, name, public)
values ('fisler', 'fisler', false)
on conflict (id) do nothing;

-- Herkes yalnız kendi klasöründeki fişleri görebilir, ekleyebilir, silebilir
drop policy if exists "fisler_kendi" on storage.objects;
create policy "fisler_kendi" on storage.objects for all to authenticated
  using (bucket_id = 'fisler' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'fisler' and (storage.foldername(name))[1] = auth.uid()::text);
