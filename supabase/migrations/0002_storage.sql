-- Supabase Storage: private bucket for notes/homework uploads.
-- Files live at notes/<parent_id>/<session_id>/<file>. Only that parent can
-- read, upload or delete them. Not run in PGlite tests (no storage schema).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'notes', 'notes', false, 15728640,
  array['image/jpeg', 'image/png', 'image/heic', 'image/webp', 'application/pdf']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists notes_select_own on storage.objects;
create policy notes_select_own on storage.objects for select to authenticated
  using (bucket_id = 'notes' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists notes_insert_own on storage.objects;
create policy notes_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'notes' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists notes_delete_own on storage.objects;
create policy notes_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'notes' and (storage.foldername(name))[1] = auth.uid()::text);
