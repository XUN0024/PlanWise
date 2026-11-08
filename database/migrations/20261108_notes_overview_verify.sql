-- Both rows: false / true / false / true. No records are changed.
SELECT p.proname,has_function_privilege('anon',p.oid,'EXECUTE') AS anon_can_call,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS user_can_call,
  p.prosecdef AS uses_definer_privileges,p.provolatile='s' AS is_read_only
FROM pg_proc p WHERE p.oid IN ('public.search_workspace_notes(text[])'::regprocedure,'public.get_workspace_note_overview(integer,integer)'::regprocedure)
ORDER BY p.proname;
SELECT relrowsecurity AS notes_rls_enabled FROM pg_class WHERE oid='public.notes'::regclass;
