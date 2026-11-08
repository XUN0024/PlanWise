-- Read-only, run AFTER the migration. No private record text or secrets returned.
SELECT p.proname,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_can_call,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS user_can_call,
 has_function_privilege('service_role',p.oid,'EXECUTE') AS server_can_call,
 p.prosecdef AS security_definer
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND (p.proname LIKE 'pw_search_%' OR p.proname IN ('pw_hybrid_search','pw_embedding_reserve','pw_enqueue_search')) ORDER BY p.proname;
-- Expected: all anon=false; only pw_hybrid_search user=true; server RPCs server=true.
-- Trigger function server_can_call may be false: PostgreSQL invokes triggers itself.
SELECT c.relname,c.relrowsecurity AS rls_enabled,
 has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE') AS user_can_write,
 has_table_privilege('authenticated',c.oid,'SELECT') AS user_can_read
FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname='public' AND c.relname IN ('pw_search_chunks','pw_search_jobs','pw_search_staging','pw_embedding_usage','pw_embedding_rate');
-- Expected: true / false / false for every table.
SELECT extname,extversion FROM pg_extension WHERE extname='vector';
SELECT indexname FROM pg_indexes WHERE tablename IN ('pw_search_chunks','pw_search_jobs');
SELECT source_type,state,count(*) FROM public.pw_search_jobs GROUP BY source_type,state ORDER BY 1,2;
SELECT source_type,count(DISTINCT source_id) AS indexed_records,count(*) AS chunks FROM public.pw_search_chunks GROUP BY source_type;
SELECT source_type,count(*) AS stale_chunks FROM public.pw_search_chunks c
WHERE NOT EXISTS(SELECT 1 FROM public.pw_search_documents(c.user_id) d WHERE d.source_type=c.source_type AND d.source_id=c.source_id AND d.source_version=c.source_version) GROUP BY source_type;
-- Stale rows can wait for replacement, but pw_hybrid_search excludes them immediately.
