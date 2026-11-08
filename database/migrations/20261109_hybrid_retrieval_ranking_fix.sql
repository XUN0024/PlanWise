-- Ranking-only update for projects that already ran 20261109_hybrid_retrieval.sql.
-- No business records, queue jobs, or saved vectors are rewritten.
BEGIN;
-- Literal Unicode matching (no English stemming) + exact cosine scan + RRF k=60.
-- Exact identifier matches receive a protected first tier. No ANN top-k counts.
CREATE OR REPLACE FUNCTION public.pw_search_identifier(p_term text,p_text text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT CASE WHEN p_term IS NULL OR p_term !~ '^[A-Za-z0-9_-]{2,32}$' THEN false ELSE
 lower(coalesce(p_text,'')) ~ ('(^|[^A-Za-z0-9_])'||lower(p_term)||'([^A-Za-z0-9_]|$)') AND (
  p_term ~ '^[A-Z]{2,16}$'
  OR (p_term ~ '[A-Za-z]' AND p_term ~ '[0-9]')
  OR (p_term ~ '^[A-Za-z]{2,16}$' AND coalesce(p_text,'') ~ ('(^|[^A-Za-z0-9_])'||upper(p_term)||'([^A-Za-z0-9_]|$)'))
 ) END;
$$;
REVOKE ALL ON FUNCTION public.pw_search_identifier(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pw_search_identifier(text,text) TO service_role;
CREATE OR REPLACE FUNCTION public.pw_hybrid_search(p_kind text,p_query text,p_terms text[] DEFAULT '{}',p_vector extensions.vector(1024) DEFAULT NULL,p_filter jsonb DEFAULT '{}',p_limit integer DEFAULT 8)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $$
DECLARE v_owner uuid:=auth.uid(); output jsonb;
BEGIN
 IF v_owner IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 IF p_kind NOT IN ('note','task','expense') OR char_length(p_query)>2000 OR cardinality(p_terms)>24 OR EXISTS(SELECT 1 FROM unnest(p_terms) t WHERE char_length(t)>100) OR jsonb_typeof(p_filter)<>'object' THEN RAISE EXCEPTION 'Invalid search'; END IF;
 WITH eligible AS MATERIALIZED (
 SELECT d.* FROM public.pw_search_documents(v_owner,p_kind) d WHERE d.source_type=p_kind
 AND (NOT p_filter ? 'ids' OR d.source_id::text IN (SELECT jsonb_array_elements_text(p_filter->'ids')))
 AND (coalesce(p_filter->>'search','')='' OR strpos(lower(d.search_text),lower(p_filter->>'search'))>0)
 AND (p_kind<>'task' OR (
  (coalesce(p_filter->>'status','all')='all' OR d.metadata->>'status'=p_filter->>'status') AND (coalesce(p_filter->>'priority','')='' OR d.metadata->>'priority'=p_filter->>'priority')
  AND (coalesce(p_filter->>'from','')='' OR (d.metadata->>'reminder_date')::date >= (p_filter->>'from')::date)
  AND (coalesce(p_filter->>'to','')='' OR (d.metadata->>'reminder_date')::date <= (p_filter->>'to')::date)))
 AND (p_kind<>'expense' OR (
  (coalesce(p_filter->>'category','')='' OR d.metadata->>'category'=p_filter->>'category') AND (coalesce(p_filter->>'paymentMethod','')='' OR CASE WHEN p_filter->>'paymentMethod'='unrecorded' THEN d.metadata->>'payment_method' IS NULL ELSE d.metadata->>'payment_method'=p_filter->>'paymentMethod' END)
  AND (coalesce(p_filter->>'from','')='' OR (d.metadata->>'date')::date >= (p_filter->>'from')::date) AND (coalesce(p_filter->>'to','')='' OR (d.metadata->>'date')::date <= (p_filter->>'to')::date)
  AND (coalesce(p_filter->>'minAmount','')='' OR (d.metadata->>'amount')::numeric >= (p_filter->>'minAmount')::numeric) AND (coalesce(p_filter->>'maxAmount','')='' OR (d.metadata->>'amount')::numeric <= (p_filter->>'maxAmount')::numeric)))
 ), scored AS MATERIALIZED (
 SELECT d.*,c.chunk_no,coalesce(c.subtask_id,(SELECT (s->>'subtask_id')::uuid FROM jsonb_array_elements(d.sections) a(s) WHERE s ? 'subtask_id' AND EXISTS(SELECT 1 FROM unnest(p_terms) term WHERE strpos(lower(s->>'text'),lower(term))>0) LIMIT 1)) subtask_id,c.start_offset,c.end_offset,c.text snippet,
 (SELECT count(*) FROM unnest(p_terms) term WHERE char_length(term)>0 AND strpos(lower(coalesce(c.text,'')),lower(term))>0) chunk_lexical,
 CASE WHEN p_vector IS NOT NULL AND c.embedding IS NOT NULL THEN 1-(c.embedding OPERATOR(extensions.<=>) p_vector) ELSE NULL END similarity,
 (SELECT count(*) FROM unnest(p_terms) term WHERE char_length(term)>0 AND strpos(lower(d.search_text),lower(term))>0)::integer lexical,
 EXISTS(SELECT 1 FROM unnest(p_terms) term WHERE public.pw_search_identifier(term,d.search_text)) exact_identifier
 FROM eligible d LEFT JOIN public.pw_search_chunks c ON c.user_id=v_owner AND c.source_type=d.source_type AND c.source_id=d.source_id AND c.source_version=d.source_version AND c.model='@cf/baai/bge-m3' AND c.index_version=1
 ), candidate_chunks AS (
 SELECT *,max(similarity) OVER(PARTITION BY source_id) semantic_similarity FROM scored
 ), root AS MATERIALIZED (
 SELECT DISTINCT ON(source_id) * FROM candidate_chunks WHERE lexical>0 OR (p_vector IS NOT NULL AND semantic_similarity>=0.42)
 ORDER BY source_id,chunk_lexical DESC,similarity DESC NULLS LAST,chunk_no NULLS LAST
 ), ranked AS (
 SELECT *,CASE WHEN lexical>0 THEN 1.0/(60+rank() OVER(ORDER BY lexical DESC,source_id)) ELSE 0 END+
 CASE WHEN semantic_similarity>=0.42 THEN 1.0/(60+rank() OVER(ORDER BY semantic_similarity DESC NULLS LAST,source_id)) ELSE 0 END fusion FROM root
 ), page AS (
 SELECT * FROM ranked ORDER BY exact_identifier DESC,fusion DESC,semantic_similarity DESC NULLS LAST,lexical DESC,source_id LIMIT greatest(1,least(p_limit,12))
 ) SELECT jsonb_build_object('owner_id',v_owner,'kind',p_kind,'snapshot',(SELECT md5(coalesce(string_agg(source_id::text||':'||source_version,',' ORDER BY source_id),'')) FROM eligible),'eligible_count',(SELECT count(*) FROM eligible),
 'indexed_count',(SELECT count(*) FROM eligible d WHERE EXISTS(SELECT 1 FROM public.pw_search_chunks c WHERE c.user_id=v_owner AND c.source_type=p_kind AND c.source_id=d.source_id AND c.source_version=d.source_version AND c.index_version=1)
 OR (btrim(d.search_text)='' AND EXISTS(SELECT 1 FROM public.pw_search_jobs j WHERE j.user_id=v_owner AND j.source_type=p_kind AND j.source_id=d.source_id AND j.content_hash=d.source_version AND j.state='ready'))),
 'candidate_count',(SELECT count(*) FROM root),'rows',coalesce((SELECT jsonb_agg(jsonb_build_object('id',source_id,'title',left(title,1200),'version',source_version,'metadata',metadata,
 'snippet',left(coalesce(snippet,substring(search_text FROM greatest(1,coalesce((SELECT min(nullif(strpos(lower(search_text),lower(term)),0)) FROM unnest(p_terms) term),1)-120) FOR 1200)),1400),
 'chunk_no',chunk_no,'subtask_id',subtask_id,'start_offset',start_offset,'end_offset',end_offset,'similarity',semantic_similarity,'lexical',lexical) ORDER BY exact_identifier DESC,fusion DESC,semantic_similarity DESC NULLS LAST,lexical DESC,source_id) FROM page),'[]')) INTO output;
 RETURN output;
END $$;
REVOKE ALL ON FUNCTION public.pw_hybrid_search(text,text,text[],extensions.vector,jsonb,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pw_hybrid_search(text,text,text[],extensions.vector,jsonb,integer) TO authenticated;
COMMIT;
