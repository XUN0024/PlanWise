-- Each row: false / true / false / true. Existing RLS is preserved.
SELECT p.proname,has_function_privilege('anon',p.oid,'EXECUTE') AS anon_can_call,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS user_can_call,p.prosecdef AS uses_definer_privileges,p.provolatile='s' AS is_read_only
FROM pg_proc p WHERE p.oid IN ('public.get_expense_range_period(date,date,text,numeric,text,text,text,numeric,numeric)'::regprocedure,
  'public.get_expense_range_insights(date,date,text,date,date,text,numeric,text,text,text,numeric,numeric,date)'::regprocedure) ORDER BY p.proname;
SELECT relrowsecurity AS expenses_rls_enabled FROM pg_class WHERE oid='public.expenses'::regclass;
