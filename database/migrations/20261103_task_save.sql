-- Run after fresh_setup.sql, on the existing PlanWise database.
-- Adds a transactional task editor; does not recreate or delete tables.
BEGIN;

CREATE OR REPLACE FUNCTION public.save_task(
  p_task_id uuid,
  p_task jsonb,
  p_subtasks jsonb,
  p_is_new boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  saved public.tasks;
  child jsonb;
  child_ids uuid[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to save tasks' USING ERRCODE = '42501';
  END IF;
  IF p_task_id IS NULL OR p_task IS NULL
     OR jsonb_typeof(p_task) IS DISTINCT FROM 'object'
     OR p_subtasks IS NULL
     OR jsonb_typeof(p_subtasks) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid task payload' USING ERRCODE = '22023';
  END IF;
  IF btrim(coalesce(p_task->>'title', '')) = '' THEN
    RAISE EXCEPTION 'Task title is required' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_subtasks) AS entry
    WHERE btrim(coalesce(entry->>'title', '')) = ''
       OR entry->>'id' IS NULL
  ) THEN
    RAISE EXCEPTION 'Each subtask needs an ID and a title' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(array_agg((entry->>'id')::uuid), ARRAY[]::uuid[])
    INTO child_ids FROM jsonb_array_elements(p_subtasks) AS entry;
  IF cardinality(child_ids) <> (SELECT count(DISTINCT id) FROM unnest(child_ids) AS id) THEN
    RAISE EXCEPTION 'Duplicate subtask IDs' USING ERRCODE = '22023';
  END IF;

  IF p_is_new THEN
    -- The browser retains this UUID across retries, preventing duplicate creates.
    INSERT INTO public.tasks (id, user_id, title)
      VALUES (p_task_id, auth.uid(), btrim(p_task->>'title'))
      ON CONFLICT (id) DO NOTHING;
  END IF;

  -- RLS checks ownership. Lock the parent to serialize full-editor saves.
  SELECT * INTO saved FROM public.tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task is unavailable or you do not have permission'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.tasks SET
    title = btrim(p_task->>'title'),
    description = coalesce(p_task->>'description', ''),
    priority = coalesce(p_task->>'priority', 'Medium'),
    reminder_date = nullif(p_task->>'reminder_date', '')::date,
    reminder_time = nullif(p_task->>'reminder_time', '')::time,
    repeat_option = nullif(p_task->>'repeat_option', '')
  WHERE id = p_task_id RETURNING * INTO saved;
  -- Completion is deliberately independent of editing and child completion.

  DELETE FROM public.subtasks
    WHERE task_id = p_task_id AND NOT (id = ANY(child_ids));
  FOR child IN SELECT * FROM jsonb_array_elements(p_subtasks) LOOP
    INSERT INTO public.subtasks (id, task_id, title, is_completed)
      VALUES ((child->>'id')::uuid, p_task_id, btrim(child->>'title'),
              coalesce((child->>'is_completed')::boolean, false))
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        is_completed = EXCLUDED.is_completed
      WHERE public.subtasks.task_id = p_task_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Subtask does not belong to this task'
        USING ERRCODE = '42501';
    END IF;
  END LOOP;

  RETURN to_jsonb(saved) || jsonb_build_object('subtasks', (
    SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.created_at, s.id), '[]'::jsonb)
    FROM public.subtasks AS s WHERE s.task_id = p_task_id
  ));
END;
$$;

REVOKE ALL ON FUNCTION public.save_task(uuid, jsonb, jsonb, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_task(uuid, jsonb, jsonb, boolean)
  TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
