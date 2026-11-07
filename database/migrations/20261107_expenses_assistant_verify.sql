-- Expected: false / true / false / true / true. Read-only; no user records are changed.
SELECT
  has_function_privilege('anon','public.get_expense_insights(date,numeric,text,text,date)','EXECUTE') AS anon_can_call,
  has_function_privilege('authenticated','public.get_expense_insights(date,numeric,text,text,date)','EXECUTE') AS user_can_call,
  p.prosecdef AS uses_definer_privileges,
  p.provolatile='s' AS is_stable_read_only,
  c.relrowsecurity AS expenses_rls_enabled
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN pg_class c JOIN pg_namespace cn ON cn.oid=c.relnamespace
WHERE n.nspname='public' AND p.proname='get_expense_insights' AND p.pronargs=5 AND cn.nspname='public' AND c.relname='expenses';
