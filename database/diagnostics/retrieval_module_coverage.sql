-- Administrator read-only PROJECT-WIDE coverage; not a particular chat user's scope.
-- No record text, owner identifiers or secrets are returned.
WITH owners AS (
 SELECT user_id FROM public.notes UNION SELECT user_id FROM public.tasks UNION SELECT user_id FROM public.expenses
), docs AS MATERIALIZED (
 SELECT d.* FROM owners o CROSS JOIN LATERAL public.pw_search_documents(o.user_id) d
), modules(kind) AS (VALUES ('note'),('task'),('expense'))
SELECT m.kind AS source_type,count(d.source_id) AS business_records,
 count(j.source_id) AS queued_records,
 count(*) FILTER(WHERE j.state='pending') AS pending,
 count(*) FILTER(WHERE j.state='working') AS working,
 count(*) FILTER(WHERE j.state='failed') AS failed,
 count(*) FILTER(WHERE j.state='ready' AND j.content_hash=d.source_version) AS ready_current,
 count(*) FILTER(WHERE d.source_id IS NOT NULL AND EXISTS(
  SELECT 1 FROM public.pw_search_chunks c WHERE c.user_id=d.user_id AND c.source_type=d.source_type
  AND c.source_id=d.source_id AND c.source_version=d.source_version
  AND c.model='@cf/baai/bge-m3' AND c.index_version=1
 )) AS records_with_current_vectors
FROM modules m LEFT JOIN docs d ON d.source_type=m.kind
LEFT JOIN public.pw_search_jobs j ON j.source_type=d.source_type AND j.source_id=d.source_id AND j.user_id=d.user_id
GROUP BY m.kind ORDER BY m.kind;
