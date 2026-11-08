-- Shared read-only text retrieval and filtered task queries. Does not write business records.
BEGIN;
CREATE OR REPLACE FUNCTION public.pw_note_plain_text(body text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE doc jsonb; result text;
BEGIN
  IF body IS NULL THEN RETURN ''; END IF;
  IF left(body,length('planwise-richtext:v1:'))<>'planwise-richtext:v1:' THEN RETURN body; END IF;
  BEGIN doc:=substring(body FROM length('planwise-richtext:v1:')+1)::jsonb; EXCEPTION WHEN others THEN RETURN ''; END;
  WITH RECURSIVE nodes(node,path,depth) AS (
    SELECT doc,ARRAY[]::bigint[],0
    UNION ALL SELECT child.value,n.path||child.ordinality,n.depth+1 FROM nodes n
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(n.node->'content')='array' THEN n.node->'content' ELSE '[]'::jsonb END) WITH ORDINALITY child
      WHERE n.depth<64
  ) SELECT coalesce(string_agg(CASE node->>'type' WHEN 'text' THEN node->>'text' WHEN 'paragraph' THEN E'\n' WHEN 'hardBreak' THEN E'\n' ELSE '' END,'' ORDER BY path),'') INTO result FROM nodes;
  RETURN result;
END;
$$;
CREATE OR REPLACE FUNCTION public.search_workspace_notes(p_terms text[] DEFAULT ARRAY[]::text[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_terms IS NULL OR cardinality(p_terms)>8 OR EXISTS(SELECT 1 FROM unnest(p_terms) t WHERE t IS NULL OR length(t)<1 OR length(t)>100) THEN RAISE EXCEPTION 'Invalid search terms' USING ERRCODE='22023'; END IF;
  WITH owned AS MATERIALIZED (
    SELECT id,title,coalesce(updated_at,created_at) AS version,
      public.pw_note_plain_text(content)||E'\n'||coalesce((SELECT string_agg(item->>'text',E'\n') FROM jsonb_array_elements(CASE WHEN jsonb_typeof(checklist)='array' THEN checklist ELSE '[]'::jsonb END) item),'') AS plain
    FROM public.notes WHERE user_id=auth.uid()
  ), matched AS MATERIALIZED (
    SELECT * FROM owned n WHERE NOT EXISTS(SELECT 1 FROM unnest(p_terms) term WHERE strpos(lower(coalesce(n.title,'')||E'\n'||n.plain),lower(term))=0)
  ), top_notes AS (
    SELECT * FROM matched ORDER BY version DESC NULLS LAST,id LIMIT 5
  ) SELECT jsonb_build_object('owner_id',auth.uid(),'total',(SELECT count(*) FROM matched),'library_total',(SELECT count(*) FROM owned),
    'version',md5(coalesce((SELECT string_agg(id::text||':'||coalesce(version::text,'')||':'||md5(coalesce(title,'')||plain),',' ORDER BY id) FROM matched),'')),
    'rows',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'title',left(coalesce(title,''),300),'version',version,
      'text',substring(plain FROM greatest(1,coalesce((SELECT min(nullif(strpos(lower(plain),lower(term)),0)) FROM unnest(p_terms) term),1)-150) FOR 1500)) ORDER BY version DESC NULLS LAST,id) FROM top_notes),'[]'::jsonb)) INTO result;
  RETURN result;
END;
$$;
CREATE OR REPLACE FUNCTION public.query_workspace_tasks(p_status text DEFAULT 'all',p_priority text DEFAULT '',p_search text DEFAULT '',p_from date DEFAULT NULL,p_to date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_status IS NULL OR p_status NOT IN ('all','unfinished','completed') OR p_priority IS NULL OR p_priority NOT IN ('','High','Medium','Low') OR p_search IS NULL OR length(p_search)>200 OR (p_from IS NOT NULL AND p_to IS NOT NULL AND p_from>p_to) THEN RAISE EXCEPTION 'Invalid task filters' USING ERRCODE='22023'; END IF;
  WITH matched AS MATERIALIZED (
    SELECT t.*,coalesce(t.priority,'Medium') AS effective_priority,
      md5(to_jsonb(t)::text||coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id)::text FROM public.subtasks s WHERE s.task_id=t.id),'[]')) AS version
    FROM public.tasks t WHERE t.user_id=auth.uid() AND (p_status='all' OR t.is_completed=(p_status='completed'))
      AND (p_priority='' OR coalesce(t.priority,'Medium')=p_priority)
      AND (p_search='' OR strpos(lower(t.title||E'\n'||coalesce(t.description,'')),lower(p_search))>0)
      AND (p_from IS NULL OR t.reminder_date>=p_from) AND (p_to IS NULL OR t.reminder_date<=p_to)
  ), top_tasks AS (
    SELECT * FROM matched ORDER BY is_completed,CASE effective_priority WHEN 'High' THEN 0 WHEN 'Medium' THEN 1 ELSE 2 END,reminder_date NULLS LAST,created_at,id LIMIT 30
  ) SELECT jsonb_build_object('owner_id',auth.uid(),'total',(SELECT count(*) FROM matched),
    'version',md5(coalesce((SELECT string_agg(id::text||':'||version,',' ORDER BY id) FROM matched),'')),
    'rows',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'title',left(title,300),'priority',effective_priority,'is_completed',is_completed,'reminder_date',reminder_date,'version',version)) FROM top_tasks),'[]'::jsonb)) INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.pw_note_plain_text(text),public.search_workspace_notes(text[]),public.query_workspace_tasks(text,text,text,date,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pw_note_plain_text(text),public.search_workspace_notes(text[]),public.query_workspace_tasks(text,text,text,date,date) TO authenticated;
COMMIT;
NOTIFY pgrst,'reload schema';
