SELECT id,public,file_size_limit FROM storage.buckets WHERE id='expense-receipts';
SELECT conname,pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.expense_attachments'::regclass AND contype='f';
SELECT policyname,permissive,cmd FROM pg_policies WHERE (schemaname='public' AND tablename='expense_attachments')
  OR (schemaname='storage' AND tablename='objects' AND policyname LIKE 'expense_attachment_objects_%');
-- Expected: false / false / true / true.
SELECT has_table_privilege('anon','public.expense_attachments','SELECT') AS anon_can_read,
  has_table_privilege('authenticated','public.expense_attachments','UPDATE') AS client_can_update,
  has_function_privilege('authenticated','public.complete_expense_attachment(uuid)','EXECUTE') AS client_can_finalize,
  (SELECT relrowsecurity FROM pg_class WHERE oid='public.expense_attachments'::regclass) AS rls_enabled;
