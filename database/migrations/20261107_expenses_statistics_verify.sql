-- Expected: false / true / false / false / true.
SELECT
  has_function_privilege('anon',p.oid,'EXECUTE') AS anon_can_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_can_execute,
  p.prosecdef AS security_definer,
  EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_can_execute,
  (SELECT relrowsecurity FROM pg_class WHERE oid='public.expenses'::regclass) AS expenses_rls_enabled
FROM pg_proc p WHERE p.oid='public.get_expense_statistics(date,date,text,text,text,numeric,numeric,text)'::regprocedure;
