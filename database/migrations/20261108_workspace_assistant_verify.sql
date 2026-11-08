-- Each row: false / true / false / true. Read-only.
SELECT p.proname,
  has_function_privilege('anon',p.oid,'EXECUTE') AS anon_can_call,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS user_can_call,
  p.prosecdef AS uses_definer_privileges,p.provolatile IN ('i','s') AS is_read_only
FROM pg_proc p WHERE p.oid IN ('public.pw_note_plain_text(text)'::regprocedure,'public.search_workspace_notes(text[])'::regprocedure,'public.query_workspace_tasks(text,text,text,date,date)'::regprocedure)
ORDER BY p.proname;
-- All three RLS values must be true.
SELECT relname,relrowsecurity AS rls_enabled FROM pg_class WHERE oid IN ('public.notes'::regclass,'public.tasks'::regclass,'public.subtasks'::regclass) ORDER BY relname;
