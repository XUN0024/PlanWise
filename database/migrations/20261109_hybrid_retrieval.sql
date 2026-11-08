-- Requires the Notes tags, workspace assistant and Expenses payment/time migrations.
-- Indexes are disposable projections. Business tables remain authoritative.
BEGIN;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
DO $$ DECLARE v_schema text; BEGIN
 SELECT n.nspname INTO v_schema FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='vector';
 IF v_schema<>'extensions' THEN RAISE EXCEPTION 'vector is installed in schema %. This migration expects extensions; review extension placement before continuing.',v_schema; END IF;
END $$;
GRANT USAGE ON SCHEMA extensions TO authenticated,service_role;
CREATE TABLE IF NOT EXISTS public.pw_search_jobs (
 source_type text NOT NULL CHECK(source_type IN ('note','task','expense')), source_id uuid NOT NULL,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 generation bigint NOT NULL DEFAULT 1, content_hash text NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','working','ready','failed')),
 due_at timestamptz NOT NULL DEFAULT now(), lease uuid, lease_until timestamptz,
 attempts integer NOT NULL DEFAULT 0, last_error text, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(source_type,source_id)
);
CREATE TABLE IF NOT EXISTS public.pw_search_chunks (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 source_type text NOT NULL CHECK(source_type IN ('note','task','expense')), source_id uuid NOT NULL,
 chunk_no integer NOT NULL CHECK(chunk_no>=0), subtask_id uuid,
 start_offset integer NOT NULL CHECK(start_offset>=0), end_offset integer NOT NULL CHECK(end_offset>=start_offset),
 text text NOT NULL CHECK(char_length(text)<=1400), text_hash text NOT NULL,
 source_version text NOT NULL, generation bigint NOT NULL,
 model text NOT NULL CHECK(model='@cf/baai/bge-m3'), index_version integer NOT NULL CHECK(index_version=1),
 embedding extensions.vector(1024) NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(source_type,source_id,chunk_no)
);
CREATE INDEX IF NOT EXISTS pw_search_chunks_owner ON public.pw_search_chunks(user_id,source_type,source_id);
CREATE INDEX IF NOT EXISTS pw_search_chunks_vector ON public.pw_search_chunks USING hnsw(embedding extensions.vector_cosine_ops);
CREATE INDEX IF NOT EXISTS pw_search_jobs_due ON public.pw_search_jobs(due_at) WHERE state IN ('pending','working');
CREATE TABLE IF NOT EXISTS public.pw_search_staging (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, source_type text NOT NULL, source_id uuid NOT NULL,
 source_version text NOT NULL, text_hash text NOT NULL, embedding extensions.vector(1024) NOT NULL,
 PRIMARY KEY(source_type,source_id,source_version,text_hash)
);
ALTER TABLE public.pw_search_staging ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pw_search_staging FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.pw_search_staging TO service_role;
ALTER TABLE public.pw_search_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pw_search_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pw_search_chunks,public.pw_search_jobs FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.pw_search_chunks,public.pw_search_jobs TO service_role;

-- One canonical, current document per ROOT record. Only trusted functions can call it.
-- Hash includes structured facts, subtask state and real tag associations.
CREATE OR REPLACE FUNCTION public.pw_search_documents(p_owner uuid,p_kind text DEFAULT NULL,p_id uuid DEFAULT NULL)
RETURNS TABLE(source_type text,source_id uuid,user_id uuid,title text,sections jsonb,metadata jsonb,source_version text,search_text text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 WITH docs AS (
 SELECT 'note'::text kind,n.id,n.user_id,coalesce(n.title,'') title,
 jsonb_build_array(jsonb_build_object('text',concat_ws(E'\n',n.title,public.pw_note_plain_text(n.content),
  (SELECT string_agg(coalesce(x->>'text',''),E'\n' ORDER BY ord) FROM jsonb_array_elements(coalesce(n.checklist,'[]')) WITH ORDINALITY a(x,ord)),
  (SELECT string_agg(t.name,' ' ORDER BY t.id) FROM public.note_tags nt JOIN public.tags t ON t.id=nt.tag_id AND t.user_id=n.user_id WHERE nt.note_id=n.id AND nt.user_id=n.user_id)))) sections,
 jsonb_build_object('updated_at',n.updated_at) meta
 FROM public.notes n WHERE n.user_id=p_owner AND (p_kind IS NULL OR p_kind='note') AND (p_id IS NULL OR n.id=p_id)
 UNION ALL
 SELECT 'task',t.id,t.user_id,coalesce(t.title,''),
 jsonb_build_array(jsonb_build_object('text',concat_ws(E'\n',t.title,t.description))) ||
 coalesce((SELECT jsonb_agg(jsonb_build_object('subtask_id',s.id,'text',concat_ws(E'\n',t.title,s.title),'completed',s.is_completed) ORDER BY s.id) FROM public.subtasks s WHERE s.task_id=t.id),'[]'),
 jsonb_build_object('status',CASE WHEN t.is_completed THEN 'completed' ELSE 'unfinished' END,'priority',t.priority,'reminder_date',t.reminder_date)
 FROM public.tasks t WHERE t.user_id=p_owner AND (p_kind IS NULL OR p_kind='task') AND (p_id IS NULL OR t.id=p_id)
 UNION ALL
 SELECT 'expense',e.id,e.user_id,coalesce(e.note,''),jsonb_build_array(jsonb_build_object('text',concat_ws(E'\n',e.note,e.category))),
 jsonb_build_object('date',e.expense_date,'amount',e.amount::text,'category',e.category,'payment_method',e.payment_method,'updated_at',e.updated_at,'expense_time',e.expense_time)
 FROM public.expenses e WHERE e.user_id=p_owner AND (p_kind IS NULL OR p_kind='expense') AND (p_id IS NULL OR e.id=p_id)
 ) SELECT kind,id,user_id,title,sections,meta,md5(jsonb_build_array(title,sections,meta)::text),
 (SELECT string_agg(x->>'text',E'\n' ORDER BY ord) FROM jsonb_array_elements(sections) WITH ORDINALITY a(x,ord)) FROM docs;
$$;
REVOKE ALL ON FUNCTION public.pw_search_documents(uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pw_search_documents(uuid,text,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.pw_enqueue_search(p_kind text,p_id uuid,p_owner uuid,p_force boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_hash text;
BEGIN
 SELECT source_version INTO v_hash FROM public.pw_search_documents(p_owner,p_kind,p_id) WHERE source_type=p_kind AND source_id=p_id;
 IF v_hash IS NULL THEN
   DELETE FROM public.pw_search_chunks WHERE source_type=p_kind AND source_id=p_id;
   DELETE FROM public.pw_search_staging WHERE source_type=p_kind AND source_id=p_id;
   DELETE FROM public.pw_search_jobs WHERE source_type=p_kind AND source_id=p_id;
   RETURN;
 END IF;
 INSERT INTO public.pw_search_jobs(source_type,source_id,user_id,content_hash,due_at)
 VALUES(p_kind,p_id,p_owner,v_hash,clock_timestamp()+interval '3 seconds')
 ON CONFLICT(source_type,source_id) DO UPDATE SET content_hash=excluded.content_hash,user_id=excluded.user_id,
 generation=pw_search_jobs.generation+1,state='pending',due_at=excluded.due_at,lease=NULL,lease_until=NULL,attempts=0,last_error=NULL,updated_at=clock_timestamp()
 WHERE p_force OR pw_search_jobs.content_hash IS DISTINCT FROM excluded.content_hash;
END $$;
REVOKE ALL ON FUNCTION public.pw_enqueue_search(text,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pw_enqueue_search(text,uuid,uuid,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.pw_search_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r record; v_id uuid; v_owner uuid; v_kind text;
BEGIN
 IF TG_TABLE_NAME IN ('notes','tasks','expenses') THEN
   v_kind=CASE TG_TABLE_NAME WHEN 'notes' THEN 'note' WHEN 'tasks' THEN 'task' ELSE 'expense' END;
   IF TG_OP<>'INSERT' THEN PERFORM public.pw_enqueue_search(v_kind,OLD.id,OLD.user_id); END IF;
   IF TG_OP<>'DELETE' THEN PERFORM public.pw_enqueue_search(v_kind,NEW.id,NEW.user_id); END IF;
 ELSIF TG_TABLE_NAME='subtasks' THEN
   IF TG_OP<>'INSERT' THEN SELECT user_id INTO v_owner FROM public.tasks WHERE id=OLD.task_id; IF v_owner IS NOT NULL THEN PERFORM public.pw_enqueue_search('task',OLD.task_id,v_owner); END IF; END IF;
   IF TG_OP<>'DELETE' THEN SELECT user_id INTO v_owner FROM public.tasks WHERE id=NEW.task_id; IF v_owner IS NOT NULL THEN PERFORM public.pw_enqueue_search('task',NEW.task_id,v_owner); END IF; END IF;
 ELSIF TG_TABLE_NAME='note_tags' THEN
   IF TG_OP<>'INSERT' THEN PERFORM public.pw_enqueue_search('note',OLD.note_id,OLD.user_id); END IF;
   IF TG_OP<>'DELETE' THEN PERFORM public.pw_enqueue_search('note',NEW.note_id,NEW.user_id); END IF;
 ELSE
   FOR r IN SELECT nt.note_id,nt.user_id FROM public.note_tags nt WHERE nt.tag_id=NEW.id LOOP PERFORM public.pw_enqueue_search('note',r.note_id,r.user_id); END LOOP;
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.pw_search_change() FROM PUBLIC,anon,authenticated;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['notes','tasks','expenses','subtasks','note_tags'] LOOP
 EXECUTE format('DROP TRIGGER IF EXISTS pw_search_sync ON public.%I',t);
 EXECUTE format('CREATE TRIGGER pw_search_sync AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.pw_search_change()',t);
 END LOOP;
END $$;
DROP TRIGGER IF EXISTS pw_search_sync ON public.tags;
CREATE TRIGGER pw_search_sync AFTER UPDATE ON public.tags FOR EACH ROW EXECUTE FUNCTION public.pw_search_change();

-- Bounded, cursor-based backfill. A returned cursor can be safely resumed/replayed.
CREATE OR REPLACE FUNCTION public.pw_search_backfill(p_after text DEFAULT '',p_limit integer DEFAULT 100,p_force boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r record; n integer:=0; cursor text:=p_after;
BEGIN
 FOR r IN SELECT * FROM (
 SELECT 'note' kind,id,user_id FROM public.notes UNION ALL SELECT 'task',id,user_id FROM public.tasks UNION ALL SELECT 'expense',id,user_id FROM public.expenses
 ) s WHERE kind||':'||id::text>p_after ORDER BY kind||':'||id::text LIMIT greatest(1,least(p_limit,200)) LOOP
 PERFORM public.pw_enqueue_search(r.kind,r.id,r.user_id,p_force);n:=n+1;cursor:=r.kind||':'||r.id::text;
 END LOOP;
 RETURN jsonb_build_object('processed',n,'cursor',cursor,'done',n<greatest(1,least(p_limit,200)));
END $$;
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
CREATE OR REPLACE FUNCTION public.pw_search_reset_failed()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE n integer;
BEGIN
 UPDATE public.pw_search_jobs SET state='pending',attempts=0,due_at=clock_timestamp(),last_error=NULL,lease=NULL,lease_until=NULL
 WHERE (source_type,source_id) IN (SELECT source_type,source_id FROM public.pw_search_jobs WHERE state='failed' ORDER BY due_at LIMIT 200 FOR UPDATE SKIP LOCKED);
 GET DIAGNOSTICS n=ROW_COUNT;RETURN n;
END $$;
CREATE OR REPLACE FUNCTION public.pw_search_complete(p_kind text,p_id uuid,p_generation bigint,p_lease uuid,p_version text,p_chunks jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $$
DECLARE j public.pw_search_jobs; v_hash text;
BEGIN
 SELECT * INTO j FROM public.pw_search_jobs WHERE source_type=p_kind AND source_id=p_id FOR UPDATE;
 IF j.generation IS DISTINCT FROM p_generation OR j.lease IS DISTINCT FROM p_lease OR j.state<>'working' THEN RETURN false; END IF;
 SELECT source_version INTO v_hash FROM public.pw_search_documents(j.user_id,p_kind,p_id) WHERE source_type=p_kind AND source_id=p_id;
 IF v_hash IS DISTINCT FROM p_version OR j.content_hash IS DISTINCT FROM p_version THEN PERFORM public.pw_enqueue_search(p_kind,p_id,j.user_id,true); RETURN false; END IF;
 IF jsonb_typeof(p_chunks)<>'array' OR jsonb_array_length(p_chunks)>256 THEN RAISE EXCEPTION 'Invalid chunks'; END IF;
 DELETE FROM public.pw_search_chunks WHERE source_type=p_kind AND source_id=p_id;
 INSERT INTO public.pw_search_chunks(user_id,source_type,source_id,chunk_no,subtask_id,start_offset,end_offset,text,text_hash,source_version,generation,model,index_version,embedding)
 SELECT j.user_id,p_kind,p_id,(x->>'chunk_no')::integer,(x->>'subtask_id')::uuid,(x->>'start_offset')::integer,(x->>'end_offset')::integer,x->>'text',x->>'text_hash',p_version,p_generation,'@cf/baai/bge-m3',1,(x->>'embedding')::extensions.vector(1024) FROM jsonb_array_elements(p_chunks) a(x);
 UPDATE public.pw_search_jobs SET state='ready',lease=NULL,lease_until=NULL,last_error=NULL,updated_at=clock_timestamp() WHERE source_type=p_kind AND source_id=p_id;
 DELETE FROM public.pw_search_staging WHERE source_type=p_kind AND source_id=p_id;
 RETURN true;
END $$;
-- Checkpoint each batch so a long document resumes without paying for prior batches again.
CREATE OR REPLACE FUNCTION public.pw_search_checkpoint(p_kind text,p_id uuid,p_generation bigint,p_lease uuid,p_version text,p_vectors jsonb,p_yield boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $$
DECLARE j public.pw_search_jobs;
BEGIN
 SELECT * INTO j FROM public.pw_search_jobs WHERE source_type=p_kind AND source_id=p_id FOR UPDATE;
 IF j.generation IS DISTINCT FROM p_generation OR j.lease IS DISTINCT FROM p_lease OR j.state<>'working' OR j.content_hash IS DISTINCT FROM p_version THEN RETURN false; END IF;
 IF jsonb_typeof(p_vectors)<>'array' OR jsonb_array_length(p_vectors)>8 THEN RAISE EXCEPTION 'Invalid vectors'; END IF;
 DELETE FROM public.pw_search_staging WHERE source_type=p_kind AND source_id=p_id AND source_version<>p_version;
 INSERT INTO public.pw_search_staging(user_id,source_type,source_id,source_version,text_hash,embedding)
 SELECT j.user_id,p_kind,p_id,p_version,x->>'text_hash',(x->>'embedding')::extensions.vector(1024) FROM jsonb_array_elements(p_vectors) a(x)
 ON CONFLICT(source_type,source_id,source_version,text_hash) DO NOTHING;
 IF p_yield THEN UPDATE public.pw_search_jobs SET state='pending',due_at=clock_timestamp(),lease=NULL,lease_until=NULL,attempts=greatest(0,attempts-1) WHERE source_type=p_kind AND source_id=p_id; END IF;
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.pw_search_retry(p_kind text,p_id uuid,p_generation bigint,p_lease uuid,p_error text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 UPDATE public.pw_search_jobs SET state=CASE WHEN p_error<>'embedding_budget_limit' AND attempts>=8 THEN 'failed' ELSE 'pending' END,
 due_at=clock_timestamp()+make_interval(secs=>CASE WHEN p_error='embedding_budget_limit' THEN 900 ELSE least(3600,15*power(2,least(attempts,8)))::integer END),
 attempts=CASE WHEN p_error='embedding_budget_limit' THEN greatest(0,attempts-1) ELSE attempts END,lease=NULL,lease_until=NULL,last_error=left(p_error,80)
 WHERE source_type=p_kind AND source_id=p_id AND generation=p_generation AND lease=p_lease;
$$;

-- Shared query+index daily quota. Service only; failed attempts still consume budget.
CREATE TABLE IF NOT EXISTS public.pw_embedding_usage(day date NOT NULL,scope text NOT NULL,characters bigint NOT NULL DEFAULT 0,PRIMARY KEY(day,scope));
ALTER TABLE public.pw_embedding_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pw_embedding_usage FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.pw_embedding_usage TO service_role;
CREATE TABLE IF NOT EXISTS public.pw_embedding_rate(window_start timestamptz NOT NULL,scope text NOT NULL,calls integer NOT NULL DEFAULT 0,PRIMARY KEY(window_start,scope));
ALTER TABLE public.pw_embedding_rate ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pw_embedding_rate FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.pw_embedding_rate TO service_role;
CREATE OR REPLACE FUNCTION public.pw_embedding_reserve(p_owner uuid,p_characters integer,p_worker boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_day date:=(clock_timestamp() AT TIME ZONE 'UTC')::date; v_window timestamptz:=date_trunc('minute',clock_timestamp()); v_scope text:=CASE WHEN p_worker THEN 'worker' ELSE 'user:'||p_owner::text END; n bigint;
BEGIN
 IF p_characters NOT BETWEEN 1 AND 12000 OR (NOT p_worker AND p_owner IS NULL) THEN RETURN false; END IF;
 INSERT INTO public.pw_embedding_usage VALUES(v_day,'global',0) ON CONFLICT DO NOTHING;
 SELECT characters INTO n FROM public.pw_embedding_usage WHERE day=v_day AND scope='global' FOR UPDATE;
 IF n+p_characters>2000000 THEN RETURN false; END IF;
 INSERT INTO public.pw_embedding_usage VALUES(v_day,v_scope,0) ON CONFLICT DO NOTHING;
 SELECT characters INTO n FROM public.pw_embedding_usage WHERE day=v_day AND scope=v_scope FOR UPDATE;
 IF n+p_characters>(CASE WHEN p_worker THEN 1800000 ELSE 20000 END) THEN RETURN false; END IF;
 INSERT INTO public.pw_embedding_rate VALUES(v_window,'global',0),(v_window,v_scope,0) ON CONFLICT DO NOTHING;
 IF (SELECT calls>=60 FROM public.pw_embedding_rate WHERE window_start=v_window AND scope='global')
 OR (SELECT calls>=CASE WHEN p_worker THEN 50 ELSE 6 END FROM public.pw_embedding_rate WHERE window_start=v_window AND scope=v_scope) THEN RETURN false; END IF;
 UPDATE public.pw_embedding_rate SET calls=calls+1 WHERE window_start=v_window AND scope IN ('global',v_scope);
 DELETE FROM public.pw_embedding_rate WHERE window_start<v_window-interval '1 hour';
 UPDATE public.pw_embedding_usage SET characters=characters+p_characters WHERE day=v_day AND scope IN ('global',v_scope);
 DELETE FROM public.pw_embedding_usage WHERE day<v_day-35;
 RETURN true;
END $$;

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
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT oid::regprocedure sig FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('pw_search_backfill','pw_search_claim','pw_search_complete','pw_search_checkpoint','pw_search_retry','pw_search_reset_failed','pw_embedding_reserve') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',r.sig);
 EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',r.sig);
 END LOOP;
END $$;
COMMIT;
