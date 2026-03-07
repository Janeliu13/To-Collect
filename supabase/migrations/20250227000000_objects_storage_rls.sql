-- Storage RLS for the 'objects' bucket
-- Run in Supabase Dashboard → SQL Editor

-- Public read: anyone can view object images
create policy "objects_storage_select"
  on storage.objects for select
  using (bucket_id = 'objects');

-- Authenticated users can upload into their own folder ({user_id}/*)
create policy "objects_storage_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'objects'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated users can update their own files
create policy "objects_storage_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'objects'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated users can delete their own files
create policy "objects_storage_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'objects'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
