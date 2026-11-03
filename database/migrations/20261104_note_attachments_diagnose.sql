-- Read-only: locate whether recent uploads reached metadata/Storage/confirmation.
SELECT a.id, a.original_name, a.status, a.note_id, a.created_at,
       a.size_bytes AS expected_size,
       (o.id IS NOT NULL) AS storage_object_exists,
       o.metadata->>'size' AS actual_size,
       o.metadata->>'mimetype' AS actual_mime_type
FROM public.note_attachments a
LEFT JOIN storage.objects o
  ON o.bucket_id = 'note-attachments' AND o.name = a.storage_path
ORDER BY a.created_at DESC
LIMIT 20;
-- pending + false: registered, but Storage upload has not committed.
-- pending + true: bytes committed, but upload confirmation has not succeeded.
-- ready + true: both upload and confirmation succeeded.
