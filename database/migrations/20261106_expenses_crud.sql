-- Expenses stage 1: exact MYR amounts and owner-scoped CRUD.
-- Apply to the existing database; do not rerun fresh_setup.sql.
BEGIN;
LOCK TABLE public.expenses IN SHARE ROW EXCLUSIVE MODE;

CREATE OR REPLACE FUNCTION public.trim_expense_text(value text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER SET search_path = '' AS $$
  SELECT btrim(value, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
$$;
REVOKE ALL ON FUNCTION public.trim_expense_text(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trim_expense_text(text) TO authenticated;

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'MYR',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- Validate existing rows before adding constraints; never round or take abs().
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.expenses WHERE amount IS NULL OR amount <= 0
    OR amount > 999999999999.99 OR amount <> trunc(amount, 2)
    OR currency IS DISTINCT FROM 'MYR'
    OR note IS NULL OR char_length(public.trim_expense_text(note)) NOT BETWEEN 1 AND 1000
    OR category IS NULL OR category NOT IN ('Food','Transport','Bills','Entertainment','Shopping','Health','Other')
    OR expense_date IS NULL OR expense_date NOT BETWEEN DATE '0001-01-01' AND DATE '9999-12-31') THEN
    RAISE EXCEPTION 'EXPENSE_LEGACY_REVIEW_REQUIRED: review invalid rows using 20261106_expenses_preflight.sql; no amounts were changed';
  END IF;
END;
$$;

ALTER TABLE public.expenses
  ALTER COLUMN currency SET DEFAULT 'MYR', ALTER COLUMN currency SET NOT NULL,
  ALTER COLUMN note SET NOT NULL, ALTER COLUMN category SET NOT NULL,
  ALTER COLUMN expense_date SET NOT NULL,
  ALTER COLUMN expense_date SET DEFAULT ((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date);
UPDATE public.expenses SET updated_at = COALESCE(created_at, clock_timestamp()) WHERE updated_at IS NULL;
ALTER TABLE public.expenses ALTER COLUMN updated_at SET DEFAULT clock_timestamp(), ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.expenses'::regclass AND conname='expenses_amount_positive') THEN
    ALTER TABLE public.expenses ADD CONSTRAINT expenses_amount_positive CHECK (amount > 0 AND amount <= 999999999999.99);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.expenses'::regclass AND conname='expenses_myr_only') THEN
    ALTER TABLE public.expenses ADD CONSTRAINT expenses_myr_only CHECK (currency = 'MYR');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.expenses'::regclass AND conname='expenses_description_valid') THEN
    ALTER TABLE public.expenses ADD CONSTRAINT expenses_description_valid CHECK (char_length(public.trim_expense_text(note)) BETWEEN 1 AND 1000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.expenses'::regclass AND conname='expenses_category_valid') THEN
    ALTER TABLE public.expenses ADD CONSTRAINT expenses_category_valid CHECK (category IN ('Food','Transport','Bills','Entertainment','Shopping','Health','Other'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.expenses'::regclass AND conname='expenses_date_valid') THEN
    ALTER TABLE public.expenses ADD CONSTRAINT expenses_date_valid CHECK (expense_date BETWEEN DATE '0001-01-01' AND DATE '9999-12-31');
  END IF;
END;
$$;

-- numeric(14,2) would round 1.005 before any trigger/CHECK can inspect it.
-- Exact numeric + range/scale constraints enforce the same bounds while
-- rejecting excess precision, including direct authenticated API writes.
ALTER TABLE public.expenses ALTER COLUMN amount TYPE numeric USING amount::numeric;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.expenses'::regclass AND conname='expenses_amount_scale') THEN
    ALTER TABLE public.expenses ADD CONSTRAINT expenses_amount_scale CHECK (amount = trunc(amount, 2));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_expense_updated_at() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  NEW.note := public.trim_expense_text(NEW.note);
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := greatest(clock_timestamp(), OLD.updated_at + interval '1 microsecond');
  ELSE NEW.updated_at := clock_timestamp(); END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.set_expense_updated_at() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS expenses_set_updated_at ON public.expenses;
CREATE TRIGGER expenses_set_updated_at BEFORE INSERT OR UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_expense_updated_at();

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.expenses FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.expenses TO authenticated;
GRANT INSERT (id,user_id,amount,currency,note,category,expense_date) ON public.expenses TO authenticated;
GRANT UPDATE (amount,currency,note,category,expense_date) ON public.expenses TO authenticated;
DROP POLICY IF EXISTS expenses_select_own ON public.expenses;
DROP POLICY IF EXISTS expenses_insert_own ON public.expenses;
DROP POLICY IF EXISTS expenses_update_own ON public.expenses;
DROP POLICY IF EXISTS expenses_delete_own ON public.expenses;
CREATE POLICY expenses_select_own ON public.expenses FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY expenses_insert_own ON public.expenses FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY expenses_update_own ON public.expenses FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY expenses_delete_own ON public.expenses FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS expenses_owner_fence ON public.expenses;
CREATE POLICY expenses_owner_fence ON public.expenses AS RESTRICTIVE FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

CREATE INDEX IF NOT EXISTS expenses_user_created_id_idx ON public.expenses(user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS expenses_user_date_idx ON public.expenses(user_id, expense_date DESC, id DESC);
COMMIT;
NOTIFY pgrst, 'reload schema';
