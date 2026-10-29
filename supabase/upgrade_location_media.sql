-- Ejecutar una sola vez en SQL Editor del proyecto Supabase EXISTENTE.
-- Conserva las tablas y datos previos.
-- Bucket público: SOLO para demostración; NO subir material sensible.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('incident-evidence','incident-evidence',true,10485760,ARRAY['image/jpeg','image/png','application/pdf','video/mp4'])
on conflict (id) do update set file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "authenticated evidence upload" on storage.objects;
create policy "authenticated evidence upload" on storage.objects for insert to authenticated
with check (bucket_id='incident-evidence' AND auth.uid() IS NOT NULL);
drop policy if exists "authenticated evidence view" on storage.objects;
create policy "authenticated evidence view" on storage.objects for select to authenticated
using (bucket_id='incident-evidence');
-- Para la demo, web y Android comparten public.incidents y sus columnas latitude/longitude.
-- Realtime requiere habilitar la tabla incidents en Database > Publications > supabase_realtime.
