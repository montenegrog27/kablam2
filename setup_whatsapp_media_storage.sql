insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'whatsapp-media',
  'whatsapp-media',
  true,
  67108864,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'audio/ogg',
    'audio/mpeg',
    'audio/webm',
    'application/pdf',
    'text/plain'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "whatsapp_media_public_read" on storage.objects;
create policy "whatsapp_media_public_read"
on storage.objects
for select
using (bucket_id = 'whatsapp-media');

drop policy if exists "whatsapp_media_service_role_write" on storage.objects;
create policy "whatsapp_media_service_role_write"
on storage.objects
for all
using (bucket_id = 'whatsapp-media')
with check (bucket_id = 'whatsapp-media');
