-- Read only. SQL Editor bypasses RLS, so also test with two authenticated users.
SELECT relrowsecurity AS expenses_rls_enabled FROM pg_class WHERE oid = 'public.expenses'::regclass;
SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
WHERE table_schema='public' AND table_name='expenses' ORDER BY ordinal_position;
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid='public.expenses'::regclass ORDER BY conname;
SELECT
  has_table_privilege('anon','public.expenses','SELECT') AS anon_can_select,
  has_table_privilege('authenticated','public.expenses','SELECT') AS client_can_select,
  has_column_privilege('authenticated','public.expenses','amount','UPDATE') AS client_can_update_amount,
  has_column_privilege('authenticated','public.expenses','user_id','UPDATE') AS client_can_change_owner,
  has_column_privilege('authenticated','public.expenses','updated_at','UPDATE') AS client_can_set_version;
-- Expected: false / true / true / false / false.
SELECT policyname, permissive, cmd FROM pg_policies WHERE schemaname='public' AND tablename='expenses';
