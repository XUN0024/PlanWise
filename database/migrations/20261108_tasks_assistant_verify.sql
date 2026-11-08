-- Expected: false / true / false / true / true / true. Does not change any records.
SELECT has_function_privilege('anon','public.get_task_insights(uuid,date)','EXECUTE') AS anon_can_call,
  has_function_privilege('authenticated','public.get_task_insights(uuid,date)','EXECUTE') AS user_can_call,
  p.prosecdef AS uses_definer_privileges,p.provolatile='s' AS is_stable_read_only,
  (SELECT relrowsecurity FROM pg_class WHERE oid='public.tasks'::regclass) AS tasks_rls_enabled,
  (SELECT relrowsecurity FROM pg_class WHERE oid='public.subtasks'::regclass) AS subtasks_rls_enabled
FROM pg_proc p WHERE p.oid='public.get_task_insights(uuid,date)'::regprocedure;
