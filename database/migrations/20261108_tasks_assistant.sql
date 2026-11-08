-- Read-only Tasks Assistant. Run after fresh_setup.sql; preserves all task records.
BEGIN;
CREATE OR REPLACE FUNCTION public.get_task_insights(p_task_id uuid DEFAULT NULL, p_as_of date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  caller uuid := auth.uid();
  business_day date := coalesce(p_as_of, (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date);
  result jsonb;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF business_day < date '1900-01-01' OR business_day > (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date THEN
    RAISE EXCEPTION 'Invalid analysis date' USING ERRCODE='22023';
  END IF;
  WITH owned AS MATERIALIZED (
    SELECT t.*, coalesce(t.priority,'Medium') AS effective_priority
    FROM public.tasks t WHERE t.user_id=caller AND (p_task_id IS NULL OR t.id=p_task_id)
  ), children AS MATERIALIZED (
    SELECT s.* FROM public.subtasks s JOIN owned t ON t.id=s.task_id
  ), records AS MATERIALIZED (
    SELECT t.*, coalesce(ch.items,'[]'::jsonb) AS children,
      coalesce(ch.total,0) AS child_count, coalesce(ch.done,0) AS child_done,
      md5(to_jsonb(t)::text || coalesce(ch.items,'[]'::jsonb)::text) AS version
    FROM owned t LEFT JOIN LATERAL (
      SELECT count(*) AS total, count(*) FILTER (WHERE s.is_completed) AS done,
        jsonb_agg(to_jsonb(s) ORDER BY s.created_at,s.id) AS items
      FROM children s WHERE s.task_id=t.id
    ) ch ON true
  ), ranked AS (
    SELECT r.*, row_number() OVER (ORDER BY
      CASE WHEN r.reminder_date=business_day THEN 0 WHEN r.reminder_date<business_day THEN 1 ELSE 2 END,
      CASE r.effective_priority WHEN 'High' THEN 0 WHEN 'Medium' THEN 1 ELSE 2 END,
      r.reminder_date NULLS LAST,r.created_at,r.id) AS rank
    FROM records r WHERE p_task_id IS NOT NULL OR NOT r.is_completed
  ), selected AS (
    SELECT * FROM ranked WHERE rank <= CASE WHEN p_task_id IS NULL THEN 3 ELSE 1 END
  )
  SELECT jsonb_build_object(
    'schema','tasks-insights-v1','owner_id',caller,'timezone','Asia/Kuala_Lumpur','as_of',business_day,
    'scope',jsonb_build_object('task_id',p_task_id),
    'data_version',md5(coalesce((SELECT string_agg(id::text || ':' || version,',' ORDER BY id) FROM records),'')),
    'summary',(SELECT jsonb_build_object('total',count(*),'completed',count(*) FILTER (WHERE is_completed),
      'incomplete',count(*) FILTER (WHERE NOT is_completed),
      'high_priority',count(*) FILTER (WHERE NOT is_completed AND effective_priority='High'),
      'reminders_today',count(*) FILTER (WHERE NOT is_completed AND reminder_date=business_day),
      'past_reminders',count(*) FILTER (WHERE NOT is_completed AND reminder_date<business_day),
      'subtasks_total',coalesce(sum(child_count),0),'subtasks_completed',coalesce(sum(child_done),0)) FROM records),
    'tasks',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id',s.id,'version',s.version,'title',left(s.title,300),
      'description',left(coalesce(s.description,''),CASE WHEN p_task_id IS NULL THEN 1500 ELSE 8000 END),
      'priority',s.effective_priority,'is_completed',s.is_completed,'created_at',s.created_at,
      'reminder_date',s.reminder_date,'reminder_time',s.reminder_time,'repeat_option',left(s.repeat_option,100),
      'subtasks_total',s.child_count,'subtasks_completed',s.child_done,
      'omitted_subtasks',greatest(0,s.child_count-CASE WHEN p_task_id IS NULL THEN 10 ELSE 50 END),
      'text_truncated',length(s.title)>300 OR length(coalesce(s.description,''))>CASE WHEN p_task_id IS NULL THEN 1500 ELSE 8000 END
        OR length(coalesce(s.repeat_option,''))>100 OR EXISTS (SELECT 1 FROM children c WHERE c.task_id=s.id AND length(c.title)>300),
      'subtasks',coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'title',left(c.title,300),'is_completed',c.is_completed) ORDER BY c.created_at,c.id)
        FROM (SELECT * FROM children WHERE task_id=s.id ORDER BY created_at,id LIMIT CASE WHEN p_task_id IS NULL THEN 10 ELSE 50 END) c),'[]'::jsonb)
    ) ORDER BY s.rank) FROM selected s),'[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_task_insights(uuid,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_task_insights(uuid,date) TO authenticated;
COMMIT;
NOTIFY pgrst,'reload schema';
