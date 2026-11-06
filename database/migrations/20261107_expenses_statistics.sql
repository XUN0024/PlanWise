-- Run after the expenses CRUD and payment/time migrations. Read-only RPC; no records changed.
BEGIN;
CREATE OR REPLACE FUNCTION public.get_expense_statistics(
  p_date_from date DEFAULT NULL, p_date_to date DEFAULT NULL,
  p_category text DEFAULT NULL, p_payment_method text DEFAULT NULL,
  p_search text DEFAULT NULL, p_min_amount numeric DEFAULT NULL, p_max_amount numeric DEFAULT NULL,
  p_granularity text DEFAULT 'auto'
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_owner uuid := auth.uid();
  v_pattern text;
  v_result jsonb;
BEGIN
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF (p_date_from IS NOT NULL AND p_date_from NOT BETWEEN DATE '0001-01-01' AND DATE '9999-12-31')
    OR (p_date_to IS NOT NULL AND p_date_to NOT BETWEEN DATE '0001-01-01' AND DATE '9999-12-31')
    OR p_date_from > p_date_to
    OR (p_category IS NOT NULL AND p_category NOT IN ('Food','Transport','Bills','Entertainment','Shopping','Health','Other'))
    OR (p_payment_method IS NOT NULL AND p_payment_method NOT IN ('cash','debit_card','credit_card','bank_transfer','e_wallet','other','unrecorded'))
    OR (p_min_amount IS NOT NULL AND (p_min_amount < 0 OR p_min_amount > 999999999999.99 OR p_min_amount <> trunc(p_min_amount,2)))
    OR (p_max_amount IS NOT NULL AND (p_max_amount < 0 OR p_max_amount > 999999999999.99 OR p_max_amount <> trunc(p_max_amount,2)))
    OR p_min_amount > p_max_amount OR char_length(p_search) > 1000
    OR p_granularity IS NULL OR p_granularity NOT IN ('auto','day','month') THEN
    RAISE EXCEPTION 'Invalid expense statistics filters' USING ERRCODE = '22023';
  END IF;
  -- Match the list's escaped imatch query, including literal %, _, *, Unicode and backslashes.
  SELECT coalesce(string_agg(CASE WHEN ch = ANY(ARRAY[E'\\','^','$','.','*','+','?','(',')','[',']','{','}','|'])
    THEN E'\\' || ch ELSE ch END, '' ORDER BY ord), '') INTO v_pattern
    FROM unnest(string_to_array(coalesce(p_search,''), NULL)) WITH ORDINALITY AS letters(ch,ord);

  WITH matched AS MATERIALIZED (
    SELECT e.amount,e.category,e.payment_method,e.expense_date FROM public.expenses e
    WHERE e.user_id = v_owner
      AND (p_date_from IS NULL OR e.expense_date >= p_date_from)
      AND (p_date_to IS NULL OR e.expense_date <= p_date_to)
      AND (p_category IS NULL OR e.category = p_category)
      AND (p_payment_method IS NULL OR (p_payment_method = 'unrecorded' AND e.payment_method IS NULL) OR e.payment_method = p_payment_method)
      AND (p_min_amount IS NULL OR e.amount >= p_min_amount)
      AND (p_max_amount IS NULL OR e.amount <= p_max_amount)
      AND (p_search IS NULL OR e.note ~* v_pattern)
  ), totals AS (
    SELECT count(*) AS records,coalesce(sum(amount),0) AS amount,min(expense_date) AS first_date,max(expense_date) AS last_date FROM matched
  ), mode AS (
    SELECT CASE WHEN p_granularity = 'auto' THEN CASE WHEN last_date - first_date > 93 THEN 'month' ELSE 'day' END ELSE p_granularity END AS unit FROM totals
  ), categories AS (
    SELECT category AS key,count(*) AS records,sum(amount) AS amount FROM matched GROUP BY category
  ), methods AS (
    SELECT coalesce(payment_method,'unrecorded') AS key,count(*) AS records,sum(amount) AS amount FROM matched GROUP BY payment_method
  ), trend AS (
    SELECT CASE WHEN mode.unit = 'month' THEN date_trunc('month',expense_date::timestamp)::date ELSE expense_date END AS bucket,
      count(*) AS records,sum(amount) AS amount FROM matched CROSS JOIN mode GROUP BY bucket
  )
  SELECT jsonb_build_object(
    'count',totals.records::text,'total_cents',trunc(totals.amount * 100)::text,
    -- Exact integer quotient avoids rounding a large numeric division before rounding cents.
    'average_cents',CASE WHEN totals.records=0 THEN '0' ELSE div(trunc(totals.amount * 100) * 2 + totals.records,totals.records::numeric * 2)::text END,
    'granularity',mode.unit,
    'categories',coalesce((SELECT jsonb_agg(jsonb_build_object('key',key,'count',records::text,'total_cents',trunc(amount * 100)::text) ORDER BY amount DESC,key) FROM categories),'[]'::jsonb),
    'methods',coalesce((SELECT jsonb_agg(jsonb_build_object('key',key,'count',records::text,'total_cents',trunc(amount * 100)::text) ORDER BY amount DESC,key) FROM methods),'[]'::jsonb),
    'trend',coalesce((SELECT jsonb_agg(jsonb_build_object('date',to_char(bucket,'YYYY-MM-DD'),'count',records::text,'total_cents',trunc(amount * 100)::text) ORDER BY bucket) FROM trend),'[]'::jsonb)
  ) INTO v_result FROM totals CROSS JOIN mode;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_expense_statistics(date,date,text,text,text,numeric,numeric,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_expense_statistics(date,date,text,text,text,numeric,numeric,text) TO authenticated;
COMMIT;
NOTIFY pgrst, 'reload schema';
