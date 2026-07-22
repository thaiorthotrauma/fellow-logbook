-- Storage setup for case images (Question 11).
-- Run in the Supabase SQL editor after schema.sql. Safe to re-run.
--
-- Bucket is PRIVATE: images are only reachable through short-lived signed URLs
-- minted for the owning fellow. Objects live at:
--   {user_id}/{case_id}/{uuid}.{ext}
-- so the first path segment is the owner's auth.uid(), which every policy keys on.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'case-images',
  'case-images',
  false,
  10485760, -- 10 MB per-file backstop; the 10 MB *total* is enforced client-side
  array['image/jpeg', 'image/png', 'image/heic', 'image/heif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- A fellow may read/write/delete only objects under their own {user_id}/ folder.
drop policy if exists "case-images own read" on storage.objects;
create policy "case-images own read"
  on storage.objects for select to authenticated
  using (bucket_id = 'case-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "case-images own insert" on storage.objects;
create policy "case-images own insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'case-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "case-images own delete" on storage.objects;
create policy "case-images own delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'case-images' and (storage.foldername(name))[1] = auth.uid()::text);
