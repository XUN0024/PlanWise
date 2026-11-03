-- Read-only configuration checks. Run AFTER the Storage migration.
-- SQL Editor uses elevated privileges; these are not signed-in RLS tests.
SELECT id, name, public, file_size_limit, allowed_mime_types,
       (NOT public AND file_size_limit = 15728640) AS configuration_ok
FROM storage.buckets WHERE id = 'note-attachments';

SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'note_attachments';

SELECT column_name, data_type, is_nullable, column_default, is_generated
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'note_attachments'
ORDER BY ordinal_position;

SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE (schemaname = 'public' AND tablename = 'note_attachments')
   OR (schemaname = 'storage' AND tablename = 'objects'
       AND policyname LIKE 'note_attachment_objects_%')
ORDER BY schemaname, policyname;

SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint WHERE conrelid = 'public.note_attachments'::regclass
ORDER BY conname;

SELECT has_table_privilege('anon', 'public.note_attachments', 'SELECT') AS anon_can_select,
       has_table_privilege('authenticated', 'public.note_attachments', 'UPDATE') AS client_can_update_table,
       has_function_privilege('authenticated', 'public.complete_note_attachment(uuid)', 'EXECUTE') AS client_can_finalize;
-- Expected: false, false, true.
