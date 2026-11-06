-- Run after 20261106_expenses_crud.sql. Additive; does not delete or backfill records.
BEGIN;
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS expense_time time without time zone;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.expenses'::regclass AND conname='expenses_payment_method_valid') THEN
    ALTER TABLE public.expenses ADD CONSTRAINT expenses_payment_method_valid
      CHECK (payment_method IS NULL OR payment_method IN ('cash','debit_card','credit_card','bank_transfer','e_wallet','other'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.expenses'::regclass AND conname='expenses_time_minute_valid') THEN
    -- No time(0) typmod: fractional seconds must be rejected, never rounded.
    ALTER TABLE public.expenses ADD CONSTRAINT expenses_time_minute_valid
      CHECK (expense_time IS NULL OR (expense_time >= TIME '00:00:00' AND expense_time < TIME '24:00:00'
        AND extract(second FROM expense_time) = 0));
  END IF;
END;
$$;

GRANT INSERT (payment_method, expense_time), UPDATE (payment_method, expense_time)
  ON public.expenses TO authenticated;
COMMIT;
NOTIFY pgrst, 'reload schema';
