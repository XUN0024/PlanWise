-- Administrator read-only preflight. Never return secret values or record text.
SELECT current_database() AS database_name,
 to_regclass('public.pw_search_jobs') IS NOT NULL AS jobs_table_exists,
 to_regclass('public.pw_search_chunks') IS NOT NULL AS chunks_table_exists,
 to_regclass('vault.secrets') IS NOT NULL AS vault_exists,
 to_regclass('cron.job') IS NOT NULL AS cron_exists;
SELECT extname,extversion FROM pg_extension WHERE extname IN ('vector','pg_cron','pg_net');
SELECT proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('pw_search_backfill','pw_search_claim','pw_hybrid_search','pw_search_identifier');
SELECT (SELECT count(*) FROM public.notes) AS notes,
 (SELECT count(*) FROM public.tasks) AS tasks,
 (SELECT count(*) FROM public.expenses) AS expenses,
 (SELECT count(*) FROM auth.users) AS accounts;
SELECT source_type,state,count(*) AS records FROM public.pw_search_jobs GROUP BY source_type,state ORDER BY 1,2;
SELECT source_type,count(DISTINCT source_id) AS records,count(*) AS chunks FROM public.pw_search_chunks GROUP BY source_type;
SELECT name FROM vault.secrets WHERE name IN ('pw_supabase_url','pw_index_worker_secret');
