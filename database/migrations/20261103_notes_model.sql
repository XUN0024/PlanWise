-- Notes stage 1: apply to the existing PlanWise database.
-- Additive and rerunnable; leaves note content and existing RLS policies intact.
BEGIN;

ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS starred boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '#F59E0B',
  ADD COLUMN IF NOT EXISTS checklist jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.notes'::regclass AND conname = 'notes_checklist_array'
  ) THEN
    ALTER TABLE public.notes ADD CONSTRAINT notes_checklist_array
      CHECK (jsonb_typeof(checklist) = 'array');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.notes'::regclass AND conname = 'notes_color_hex'
  ) THEN
    ALTER TABLE public.notes ADD CONSTRAINT notes_color_hex
      CHECK (color ~ '^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$');
  END IF;
END;
$$;

UPDATE public.notes
  SET updated_at = coalesce(created_at, now())
  WHERE updated_at IS NULL;
ALTER TABLE public.notes
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

CREATE OR REPLACE FUNCTION public.set_note_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.set_note_updated_at() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notes_set_updated_at ON public.notes;
CREATE TRIGGER notes_set_updated_at
  BEFORE UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.set_note_updated_at();

CREATE INDEX IF NOT EXISTS notes_user_updated_idx
  ON public.notes(user_id, updated_at DESC, id);

COMMIT;
NOTIFY pgrst, 'reload schema';
