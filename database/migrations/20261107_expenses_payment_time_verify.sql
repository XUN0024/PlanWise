-- Read-only checks after 20261107_expenses_payment_time.sql.
SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
WHERE table_schema='public' AND table_name='expenses' AND column_name IN ('payment_method','expense_time');
-- Both nullable; expense_time should be time without time zone, no inferred default.
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid='public.expenses'::regclass AND conname IN ('expenses_payment_method_valid','expenses_time_minute_valid');
SELECT
  has_table_privilege('anon','public.expenses','SELECT') AS anon_can_read,
  has_column_privilege('authenticated','public.expenses','payment_method','INSERT') AS can_insert_payment,
  has_column_privilege('authenticated','public.expenses','payment_method','UPDATE') AS can_update_payment,
  has_column_privilege('authenticated','public.expenses','expense_time','INSERT') AS can_insert_time,
  has_column_privilege('authenticated','public.expenses','expense_time','UPDATE') AS can_update_time,
  has_column_privilege('authenticated','public.expenses','user_id','UPDATE') AS can_change_owner,
  has_column_privilege('authenticated','public.expenses','updated_at','UPDATE') AS can_set_version;
-- Expected: false / true / true / true / true / false / false.
