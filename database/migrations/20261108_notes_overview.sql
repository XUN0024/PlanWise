-- Run after 20261108_workspace_assistant.sql. Read-only overview + exact library/search counts.
-- Preserves all notes and existing RLS. No UID or secrets are required.
BEGIN;
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
CREATE OR REPLACE FUNCTION public.get_workspace_note_overview(p_offset integer DEFAULT 0,p_limit integer DEFAULT 10)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_offset IS NULL OR p_offset<0 OR p_offset>1000000 OR p_limit IS NULL OR p_limit NOT IN (0,10) OR (p_limit=0 AND p_offset<>0) THEN
    RAISE EXCEPTION 'Invalid overview page' USING ERRCODE='22023';
  END IF;
  WITH owned AS MATERIALIZED (
    SELECT id,title,created_at,coalesce(updated_at,created_at) AS version,
      public.pw_note_plain_text(content)||E'\n'||coalesce((SELECT string_agg(
        CASE WHEN item->>'done'='true' THEN '[x] ' ELSE '[ ] ' END||coalesce(item->>'text',''),E'\n')
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(checklist)='array' THEN checklist ELSE '[]'::jsonb END) item),'') AS plain
    FROM public.notes WHERE user_id=auth.uid()
  ), page AS (
    SELECT * FROM owned ORDER BY created_at DESC,id OFFSET p_offset LIMIT p_limit
  ), meta AS (
    SELECT count(*) AS total,md5(coalesce(string_agg(id::text||':'||md5(to_jsonb(owned)::text),',' ORDER BY id),'')) AS version FROM owned
  ) SELECT jsonb_build_object('owner_id',auth.uid(),'total',meta.total,'library_total',meta.total,'offset',p_offset,'limit',p_limit,
    'next_offset',CASE WHEN p_limit>0 AND p_offset+p_limit<meta.total THEN p_offset+p_limit ELSE NULL END,'version',meta.version,
    'rows',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'title',left(coalesce(title,''),300),'version',version,
      'text',left(btrim(plain),1200)) ORDER BY created_at DESC,id) FROM page),'[]'::jsonb)) INTO result FROM meta;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.search_workspace_notes(text[]),public.get_workspace_note_overview(integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.search_workspace_notes(text[]),public.get_workspace_note_overview(integer,integer) TO authenticated;
COMMIT;
NOTIFY pgrst,'reload schema';
