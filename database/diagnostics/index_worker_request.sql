-- Run AFTER deploying the worker with runtime diagnostics.
-- This authenticated request checks environment presence only. No model call or job claim.
-- Vault provides credentials internally; this query returns only the HTTP request ID.
SELECT net.http_post(
 url := (SELECT rtrim(decrypted_secret,'/') FROM vault.decrypted_secrets WHERE name='pw_supabase_url' LIMIT 1)
        || '/functions/v1/index-workspace?action=diagnose',
 headers := jsonb_build_object(
   'Content-Type','application/json',
   'Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='pw_index_worker_secret' LIMIT 1)
 ),
 body := '{}'::jsonb,
 timeout_milliseconds := 15000
) AS diagnostic_request_id;

-- Commit this request by finishing the SQL Editor run.
-- In a SEPARATE run (pg_net sends after commit), use the returned ID:
-- SELECT id,status_code,timed_out,error_msg,content
-- FROM net._http_response WHERE id = YOUR_DIAGNOSTIC_REQUEST_ID;
