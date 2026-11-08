-- Existing installations: interleave eligible note/task/expense indexing jobs.
-- Preserves existing rows, generation checks, retry due times and active leases.
BEGIN;
CREATE OR REPLACE FUNCTION public.pw_search_claim(p_limit integer DEFAULT 2)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r record; doc record; result jsonb:='[]'; v_lease uuid;
BEGIN
 FOR r IN
 WITH fair AS MATERIALIZED (
  SELECT source_type,source_id,row_number() OVER(PARTITION BY source_type ORDER BY due_at,source_id) AS module_position
  FROM public.pw_search_jobs WHERE (state='pending' AND due_at<=clock_timestamp()) OR (state='working' AND lease_until<clock_timestamp())
 )
 SELECT j.* FROM public.pw_search_jobs j JOIN fair f USING(source_type,source_id)
 WHERE (j.state='pending' AND j.due_at<=clock_timestamp()) OR (j.state='working' AND j.lease_until<clock_timestamp())
 ORDER BY f.module_position,j.due_at,j.source_type,j.source_id
 LIMIT greatest(1,least(p_limit,4)) FOR UPDATE OF j SKIP LOCKED LOOP
  SELECT * INTO doc FROM public.pw_search_documents(r.user_id,r.source_type,r.source_id) WHERE source_type=r.source_type AND source_id=r.source_id;
  IF doc.source_id IS NULL THEN PERFORM public.pw_enqueue_search(r.source_type,r.source_id,r.user_id); CONTINUE; END IF;
  v_lease:=gen_random_uuid();
  UPDATE public.pw_search_jobs SET state='working',lease=v_lease,lease_until=clock_timestamp()+interval '3 minutes',attempts=attempts+1 WHERE source_type=r.source_type AND source_id=r.source_id;
  result:=result||jsonb_build_array(jsonb_build_object('source_type',r.source_type,'source_id',r.source_id,'user_id',r.user_id,'generation',r.generation,'lease',v_lease,'version',doc.source_version,'sections',doc.sections,
   'existing',coalesce((SELECT jsonb_agg(jsonb_build_object('text_hash',c.text_hash,'embedding',c.embedding::text)) FROM (
    SELECT text_hash,embedding FROM public.pw_search_chunks WHERE source_type=r.source_type AND source_id=r.source_id AND model='@cf/baai/bge-m3' AND index_version=1
    UNION ALL SELECT text_hash,embedding FROM public.pw_search_staging WHERE source_type=r.source_type AND source_id=r.source_id AND source_version=doc.source_version
   ) c),'[]')));
 END LOOP;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.pw_search_claim(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pw_search_claim(integer) TO service_role;
COMMIT;
