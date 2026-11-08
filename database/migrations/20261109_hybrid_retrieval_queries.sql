-- Interactive retrieval smoke checks, not a production migration.
-- Replace the placeholder with YOUR TEST USER UID; run the whole transaction.
-- Create a matching record in each module first. Repeat with a second account
-- containing the same words: returned IDs must always belong to the chosen UID.
BEGIN;
SELECT set_config('request.jwt.claim.sub','REPLACE_WITH_TEST_USER_UUID',true);
-- Admin prepares ONE current vector owned by this test user before switching role.
CREATE TEMP TABLE pw_test_vector ON COMMIT DROP AS
 SELECT c.embedding FROM public.pw_search_chunks c
 JOIN public.pw_search_documents(auth.uid()) d ON d.source_type=c.source_type AND d.source_id=c.source_id AND d.source_version=c.source_version
 WHERE c.user_id=auth.uid() LIMIT 1;
GRANT SELECT ON pw_test_vector TO authenticated;
SET LOCAL ROLE authenticated;
SELECT public.pw_hybrid_search('note','TAI 课程',ARRAY['TAI','课程'],NULL,'{}',8);
SELECT public.pw_hybrid_search('task','TAI research',ARRAY['TAI','research'],NULL,
 '{"status":"unfinished","priority":"High","from":"2026-11-01","to":"2026-11-30"}',8);
SELECT public.pw_hybrid_search('expense','相关出行',ARRAY['Grab'],NULL,
 '{"from":"2026-01-01","to":"2026-01-31","category":"Transport","maxAmount":"100.00"}',8);
-- Reusing an existing own vector only validates pgvector and scoped source joins.
-- It does NOT prove that the query below was embedded, or model relevance improved.
SELECT public.pw_hybrid_search('note','smoke check',ARRAY[]::text[],(SELECT embedding FROM pw_test_vector LIMIT 1),'{}',8);
ROLLBACK;
