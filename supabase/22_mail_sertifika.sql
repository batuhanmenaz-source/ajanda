-- 22: İş mail sunucusunun onayladığın sertifikası (kendi imzalı sertifika kullanan sunucular için)
alter table public.app_settings add column if not exists mail_cert_fp text;
