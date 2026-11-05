-- Additive tag migration. Run after 20261103_notes_model.sql.
BEGIN;

-- Match JavaScript String.trim(), including tabs, CJK space and BOM.
CREATE OR REPLACE FUNCTION public.clean_note_tag_name(value text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER SET search_path = '' AS $$
  SELECT btrim(value, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
$$;
REVOKE ALL ON FUNCTION public.clean_note_tag_name(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clean_note_tag_name(text) TO authenticated;

CREATE TABLE IF NOT EXISTS public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (name = public.clean_note_tag_name(name) AND char_length(name) BETWEEN 1 AND 100),
  normalized_name text GENERATED ALWAYS AS (lower(public.clean_note_tag_name(name))) STORED,
  color text NOT NULL DEFAULT '#3B82F6' CHECK (color IN ('#F59E0B','#EF4444','#3B82F6','#10B981','#8B5CF6','#EC4899')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (user_id, normalized_name),
  UNIQUE (user_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS notes_user_id_id_key ON public.notes(user_id, id);
CREATE TABLE IF NOT EXISTS public.note_tags (
  user_id uuid NOT NULL,
  note_id uuid NOT NULL,
  tag_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (note_id, tag_id),
  FOREIGN KEY (user_id, note_id) REFERENCES public.notes(user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, tag_id) REFERENCES public.tags(user_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS note_tags_user_tag_idx ON public.note_tags(user_id, tag_id, note_id);

-- Migrate legacy data once. A marker prevents a rerun from resurrecting removed
-- associations or deleted/renamed labels from the retained notes.tags column.
CREATE TABLE IF NOT EXISTS public.note_tag_migrations (
  version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.note_tag_migrations FROM PUBLIC, anon, authenticated;
ALTER TABLE public.note_tag_migrations ENABLE ROW LEVEL SECURITY;
LOCK TABLE public.notes IN SHARE ROW EXCLUSIVE MODE;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.note_tag_migrations WHERE version = 'legacy_tags_v1') THEN
    IF EXISTS (SELECT 1 FROM public.notes n, unnest(n.tags) AS old_name WHERE char_length(public.clean_note_tag_name(old_name)) > 100) THEN
      RAISE EXCEPTION 'Legacy tag exceeds 100 characters; review notes.tags before retrying migration' USING ERRCODE = '22001';
    END IF;
    INSERT INTO public.tags(user_id, name)
      SELECT DISTINCT ON (n.user_id, lower(public.clean_note_tag_name(old_name))) n.user_id, public.clean_note_tag_name(old_name)
      FROM public.notes n CROSS JOIN LATERAL unnest(n.tags) AS old_name
      WHERE old_name IS NOT NULL AND public.clean_note_tag_name(old_name) <> ''
      ORDER BY n.user_id, lower(public.clean_note_tag_name(old_name)), public.clean_note_tag_name(old_name)
      ON CONFLICT (user_id, normalized_name) DO NOTHING;
    INSERT INTO public.note_tags(user_id, note_id, tag_id)
      SELECT DISTINCT n.user_id, n.id, t.id
      FROM public.notes n CROSS JOIN LATERAL unnest(n.tags) AS old_name
      JOIN public.tags t ON t.user_id = n.user_id AND t.normalized_name = lower(public.clean_note_tag_name(old_name))
      ON CONFLICT DO NOTHING;
    INSERT INTO public.note_tag_migrations(version) VALUES ('legacy_tags_v1');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_tag_updated_at() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN NEW.updated_at = clock_timestamp(); RETURN NEW; END;
$$;
REVOKE ALL ON FUNCTION public.set_tag_updated_at() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS tags_set_updated_at ON public.tags;
CREATE TRIGGER tags_set_updated_at BEFORE UPDATE ON public.tags
  FOR EACH ROW EXECUTE FUNCTION public.set_tag_updated_at();

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.note_tags ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tags, public.note_tags FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.tags TO authenticated;
GRANT INSERT (user_id, name, color), UPDATE (name, color) ON public.tags TO authenticated;
GRANT SELECT, DELETE ON public.note_tags TO authenticated;
GRANT INSERT (user_id, note_id, tag_id) ON public.note_tags TO authenticated;
DROP POLICY IF EXISTS tags_own ON public.tags;
CREATE POLICY tags_own ON public.tags FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS note_tags_own ON public.note_tags;
CREATE POLICY note_tags_own ON public.note_tags FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

-- One statement gives a consistent snapshot; RLS also applies inside the RPC.
CREATE OR REPLACE FUNCTION public.get_note_tag_state() RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'tags', COALESCE((SELECT jsonb_agg(t ORDER BY t.normalized_name, t.id)
      FROM public.tags t WHERE t.user_id = (SELECT auth.uid())), '[]'::jsonb),
    'links', COALESCE((SELECT jsonb_agg(jsonb_build_object('note_id', n.note_id, 'tag_id', n.tag_id))
      FROM public.note_tags n WHERE n.user_id = (SELECT auth.uid())), '[]'::jsonb)
  );
$$;
REVOKE ALL ON FUNCTION public.get_note_tag_state() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_note_tag_state() TO authenticated;

-- A mutation and its returned snapshot share one transaction. Create+attach is
-- atomic; individual attach/remove operations never replace the full tag set.
CREATE OR REPLACE FUNCTION public.change_note_tag(
  p_action text, p_note_id uuid DEFAULT NULL, p_tag_id uuid DEFAULT NULL,
  p_name text DEFAULT NULL, p_color text DEFAULT NULL,
  p_expected_updated_at timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE owner_id uuid := auth.uid(); target_id uuid; saved_name text;
BEGIN
  IF owner_id IS NULL THEN RAISE EXCEPTION 'TAG_AUTH_REQUIRED'; END IF;
  IF p_action NOT IN ('create','create_attach','attach','detach','update','delete') OR p_action IS NULL THEN
    RAISE EXCEPTION 'TAG_INVALID_ACTION';
  END IF;
  IF p_action IN ('create_attach','attach','detach') THEN
    PERFORM 1 FROM public.notes WHERE id = p_note_id AND user_id = owner_id FOR KEY SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'TAG_NOTE_NOT_FOUND'; END IF;
  END IF;
  IF p_action IN ('create','create_attach','update') THEN
    saved_name := public.clean_note_tag_name(p_name);
    IF saved_name IS NULL OR char_length(saved_name) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'TAG_INVALID_NAME'; END IF;
    IF p_color IS NOT NULL AND p_color NOT IN ('#F59E0B','#EF4444','#3B82F6','#10B981','#8B5CF6','#EC4899') THEN
      RAISE EXCEPTION 'TAG_INVALID_COLOR';
    END IF;
  END IF;
  IF p_action IN ('create','create_attach') THEN
    INSERT INTO public.tags(user_id, name, color)
      VALUES (owner_id, saved_name, COALESCE(p_color, '#3B82F6'))
      ON CONFLICT (user_id, normalized_name) DO NOTHING RETURNING id INTO target_id;
    IF target_id IS NULL THEN
      SELECT id INTO target_id FROM public.tags
        WHERE user_id = owner_id AND normalized_name = lower(saved_name) FOR KEY SHARE;
      IF target_id IS NULL THEN RAISE EXCEPTION 'TAG_CONFLICT'; END IF;
    END IF;
  ELSIF p_action IN ('attach','detach') THEN
    SELECT id INTO target_id FROM public.tags WHERE id = p_tag_id AND user_id = owner_id FOR KEY SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'TAG_NOT_FOUND'; END IF;
  ELSIF p_action = 'update' THEN
    UPDATE public.tags SET name = saved_name, color = COALESCE(p_color, color)
      WHERE id = p_tag_id AND user_id = owner_id AND updated_at = p_expected_updated_at RETURNING id INTO target_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'TAG_CONFLICT'; END IF;
  ELSIF p_action = 'delete' THEN
    DELETE FROM public.tags WHERE id = p_tag_id AND user_id = owner_id AND updated_at = p_expected_updated_at;
    IF NOT FOUND THEN RAISE EXCEPTION 'TAG_CONFLICT'; END IF;
  END IF;
  IF p_action IN ('create_attach','attach') THEN
    INSERT INTO public.note_tags(user_id, note_id, tag_id) VALUES (owner_id, p_note_id, target_id) ON CONFLICT DO NOTHING;
  ELSIF p_action = 'detach' THEN
    DELETE FROM public.note_tags WHERE user_id = owner_id AND note_id = p_note_id AND tag_id = target_id;
  END IF;
  RETURN public.get_note_tag_state();
END;
$$;
REVOKE ALL ON FUNCTION public.change_note_tag(text,uuid,uuid,text,text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.change_note_tag(text,uuid,uuid,text,text,timestamptz) TO authenticated;
COMMIT;
NOTIFY pgrst, 'reload schema';
