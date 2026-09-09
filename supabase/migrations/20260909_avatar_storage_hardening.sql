-- Restrict public avatar uploads to safe image formats and a small file size.
-- Additive / non-destructive. Apply after the avatars bucket exists.

update storage.buckets
set
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
where id = 'avatars';
