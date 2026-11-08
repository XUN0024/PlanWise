-- Run ONLY after the deployed diagnostic returns embedding.configured=true.
-- Preserve last_error until an actual successful index completion clears it.
-- Do not reset working leases, other error categories, source hashes or generations.
WITH reset AS (
 UPDATE public.pw_search_jobs
 SET state='pending',attempts=0,due_at=clock_timestamp(),lease=NULL,lease_until=NULL,updated_at=clock_timestamp()
 WHERE state IN ('pending','failed') AND last_error='embedding_not_configured'
 RETURNING source_type
)
SELECT source_type,count(*) AS requeued FROM reset GROUP BY source_type;
