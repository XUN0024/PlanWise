-- OPTIONAL PRODUCTION SCHEDULER, run after deploying index-workspace.
-- First create Vault secrets named pw_supabase_url and pw_index_worker_secret
-- through the Supabase Vault UI. The worker secret must equal its Edge Secret.
-- Never paste a token into this file or commit it.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM vault.decrypted_secrets WHERE name='pw_supabase_url')
 OR NOT EXISTS(SELECT 1 FROM vault.decrypted_secrets WHERE name='pw_index_worker_secret') THEN
 RAISE EXCEPTION 'Create the two named Vault secrets first'; END IF;
END $$;
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname='pw-index-workspace';
SELECT cron.schedule('pw-index-workspace','* * * * *',$cron$
 SELECT net.http_post(
  url:=(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='pw_supabase_url' LIMIT 1)||'/functions/v1/index-workspace',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='pw_index_worker_secret' LIMIT 1)),
  body:='{}'::jsonb,timeout_milliseconds:=120000
 );
$cron$);
