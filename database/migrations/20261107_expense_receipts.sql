-- PlanWise expense attachments: run in the EXISTING Supabase project's SQL Editor.
-- Run after expenses CRUD. Rerunnable; does not change expenses or note attachments.
BEGIN;

-- Bucket configuration only. Never INSERT/DELETE storage.objects directly.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('expense-receipts', 'expense-receipts', false, 15728640, NULL)
ON CONFLICT (id) DO UPDATE SET
  public = false, file_size_limit = 15728640, allowed_mime_types = NULL;

CREATE TABLE IF NOT EXISTS public.expense_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL REFERENCES public.expenses(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  original_name text NOT NULL CHECK (length(btrim(original_name)) BETWEEN 1 AND 255),
  object_name text NOT NULL DEFAULT 'file'
    CHECK (object_name ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$'),
  storage_path text GENERATED ALWAYS AS
    (user_id::text || '/' || expense_id::text || '/' || id::text || '/' || object_name) STORED,
  mime_type text NOT NULL DEFAULT 'application/octet-stream',
  size_bytes bigint NOT NULL CHECK (size_bytes BETWEEN 0 AND 15728640),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready')),
  created_at timestamptz NOT NULL DEFAULT now(),
  uploaded_at timestamptz,
  UNIQUE (storage_path)
);
CREATE INDEX IF NOT EXISTS expense_attachments_expense_created_idx
  ON public.expense_attachments(expense_id, created_at, id);
CREATE INDEX IF NOT EXISTS expense_attachments_user_idx
  ON public.expense_attachments(user_id);

ALTER TABLE public.expense_attachments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.expense_attachments FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.expense_attachments TO authenticated;
-- Identity, ownership and path cannot be changed later; ready is set only by RPC.
GRANT INSERT (id, expense_id, user_id, original_name, object_name, mime_type, size_bytes)
  ON public.expense_attachments TO authenticated;
GRANT ALL ON public.expense_attachments TO service_role;

DROP POLICY IF EXISTS expense_attachments_select_own ON public.expense_attachments;
CREATE POLICY expense_attachments_select_own ON public.expense_attachments
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND EXISTS (
    SELECT 1 FROM public.expenses n
    WHERE n.id = expense_attachments.expense_id AND n.user_id = (SELECT auth.uid())
  ));
DROP POLICY IF EXISTS expense_attachments_insert_own ON public.expense_attachments;
CREATE POLICY expense_attachments_insert_own ON public.expense_attachments
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND status = 'pending' AND uploaded_at IS NULL
    AND EXISTS (SELECT 1 FROM public.expenses n
      WHERE n.id = expense_attachments.expense_id AND n.user_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS expense_attachments_delete_own ON public.expense_attachments;
CREATE POLICY expense_attachments_delete_own ON public.expense_attachments
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()) AND EXISTS (
    SELECT 1 FROM public.expenses n
    WHERE n.id = expense_attachments.expense_id AND n.user_id = (SELECT auth.uid())
  ));

-- Lock the reservation during Storage INSERT to serialize upload vs. receipt deletion.
CREATE OR REPLACE FUNCTION public.can_upload_expense_receipt(p_path text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  SELECT a.id INTO v_id FROM public.expense_attachments a
    WHERE a.storage_path=p_path AND a.user_id=auth.uid() AND a.status='pending'
      AND EXISTS(SELECT 1 FROM public.expenses e WHERE e.id=a.expense_id AND e.user_id=auth.uid())
    FOR KEY SHARE;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.can_upload_expense_receipt(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.can_upload_expense_receipt(text) TO authenticated;

DROP POLICY IF EXISTS expense_attachments_owner_fence ON public.expense_attachments;
CREATE POLICY expense_attachments_owner_fence ON public.expense_attachments AS RESTRICTIVE FOR ALL TO authenticated
  USING(user_id=(SELECT auth.uid()) AND EXISTS(SELECT 1 FROM public.expenses e WHERE e.id=expense_attachments.expense_id AND e.user_id=(SELECT auth.uid())))
  WITH CHECK(user_id=(SELECT auth.uid()) AND EXISTS(SELECT 1 FROM public.expenses e WHERE e.id=expense_attachments.expense_id AND e.user_id=(SELECT auth.uid())));

-- Restrictive bucket fences also block broad pre-existing permissive policies.
DROP POLICY IF EXISTS expense_attachment_objects_anon_fence ON storage.objects;
CREATE POLICY expense_attachment_objects_anon_fence ON storage.objects
  AS RESTRICTIVE FOR ALL TO anon
  USING (bucket_id <> 'expense-receipts')
  WITH CHECK (bucket_id <> 'expense-receipts');
DROP POLICY IF EXISTS expense_attachment_objects_owner_fence ON storage.objects;
CREATE POLICY expense_attachment_objects_owner_fence ON storage.objects
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (bucket_id <> 'expense-receipts' OR EXISTS (
    SELECT 1 FROM public.expense_attachments a
    JOIN public.expenses n ON n.id = a.expense_id
    WHERE a.storage_path = storage.objects.name
      AND a.user_id = (SELECT auth.uid()) AND n.user_id = (SELECT auth.uid())
  ))
  WITH CHECK (bucket_id <> 'expense-receipts' OR public.can_upload_expense_receipt(storage.objects.name));
-- No overwrite/upsert: every attachment receives its own UUID/path.
DROP POLICY IF EXISTS expense_attachment_objects_no_overwrite ON storage.objects;
CREATE POLICY expense_attachment_objects_no_overwrite ON storage.objects
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (bucket_id <> 'expense-receipts')
  WITH CHECK (bucket_id <> 'expense-receipts');

DROP POLICY IF EXISTS expense_attachment_objects_select ON storage.objects;
CREATE POLICY expense_attachment_objects_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'expense-receipts' AND EXISTS (
    SELECT 1 FROM public.expense_attachments a
    JOIN public.expenses n ON n.id = a.expense_id
    WHERE a.storage_path = storage.objects.name
      AND a.user_id = (SELECT auth.uid()) AND n.user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS expense_attachment_objects_insert ON storage.objects;
CREATE POLICY expense_attachment_objects_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'expense-receipts' AND EXISTS (
    SELECT 1 FROM public.expense_attachments a
    JOIN public.expenses n ON n.id = a.expense_id
    WHERE a.storage_path = storage.objects.name
      AND a.user_id = (SELECT auth.uid()) AND n.user_id = (SELECT auth.uid())
      AND a.status = 'pending'
  ));

DROP POLICY IF EXISTS expense_attachment_objects_delete ON storage.objects;
CREATE POLICY expense_attachment_objects_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'expense-receipts' AND EXISTS (
    SELECT 1 FROM public.expense_attachments a
    JOIN public.expenses n ON n.id = a.expense_id
    WHERE a.storage_path = storage.objects.name
      AND a.user_id = (SELECT auth.uid()) AND n.user_id = (SELECT auth.uid())
  ));

-- Finalize only after the real object exists and its actual size matches.
-- SECURITY DEFINER is limited to this explicit ownership-checked operation.
CREATE OR REPLACE FUNCTION public.complete_expense_attachment(p_attachment_id uuid)
RETURNS public.expense_attachments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  attachment public.expense_attachments;
  object_metadata jsonb;
  actual_size_text text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to complete an attachment' USING ERRCODE = '42501';
  END IF;
  SELECT a.* INTO attachment FROM public.expense_attachments a
    WHERE a.id = p_attachment_id AND a.user_id = auth.uid()
      AND EXISTS (SELECT 1 FROM public.expenses n
        WHERE n.id = a.expense_id AND n.user_id = auth.uid())
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attachment is unavailable' USING ERRCODE = '42501';
  END IF;
  SELECT metadata INTO object_metadata FROM storage.objects
    WHERE bucket_id = 'expense-receipts' AND name = attachment.storage_path;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'File has not finished uploading' USING ERRCODE = '22023';
  END IF;
  actual_size_text := object_metadata->>'size';
  IF actual_size_text IS NULL OR actual_size_text !~ '^[0-9]+$' THEN
    RAISE EXCEPTION 'Storage did not report a valid file size' USING ERRCODE = '22023';
  END IF;
  IF actual_size_text::bigint <> attachment.size_bytes
     OR actual_size_text::bigint > 15728640 THEN
    RAISE EXCEPTION 'File size does not match the attachment record' USING ERRCODE = '22023';
  END IF;
  UPDATE public.expense_attachments
    SET status = 'ready',
        uploaded_at = coalesce(uploaded_at, now()),
        mime_type = coalesce(nullif(object_metadata->>'mimetype', ''), mime_type)
    WHERE id = attachment.id RETURNING * INTO attachment;
  RETURN attachment;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_expense_attachment(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_expense_attachment(uuid) TO authenticated;

-- A row cannot disappear while its Storage object still exists.
-- Removal order: Storage API remove -> DELETE attachment row -> DELETE expense.
CREATE OR REPLACE FUNCTION public.guard_expense_attachment_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM storage.objects
    WHERE bucket_id = 'expense-receipts' AND name = OLD.storage_path) THEN
    RAISE EXCEPTION 'Remove the file using Storage API before deleting its attachment record'
      USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_expense_attachment_delete() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS expense_attachments_before_delete ON public.expense_attachments;
CREATE TRIGGER expense_attachments_before_delete BEFORE DELETE ON public.expense_attachments
  FOR EACH ROW EXECUTE FUNCTION public.guard_expense_attachment_delete();

COMMIT;
NOTIFY pgrst, 'reload schema';
