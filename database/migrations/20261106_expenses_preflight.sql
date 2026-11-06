-- Read only; works before/after the migration. Empty result = no review rows.
WITH checked AS (
  SELECT e.*, to_jsonb(e) AS original,
    btrim(note, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') AS clean_note
  FROM public.expenses e
), review AS (
  SELECT id, user_id, amount, category, note, expense_date, original->>'currency' AS existing_currency,
    concat_ws('; ',
      CASE WHEN amount IS NULL OR amount <= 0 OR amount > 999999999999.99 THEN 'invalid amount/range' END,
      CASE WHEN amount <> trunc(amount,2) THEN 'more than 2 decimal places' END,
      CASE WHEN clean_note IS NULL OR char_length(clean_note) NOT BETWEEN 1 AND 1000 THEN 'missing/oversized description' END,
      CASE WHEN category IS NULL OR category NOT IN ('Food','Transport','Bills','Entertainment','Shopping','Health','Other') THEN 'unknown category' END,
      CASE WHEN expense_date IS NULL OR expense_date NOT BETWEEN DATE '0001-01-01' AND DATE '9999-12-31' THEN 'invalid date' END,
      CASE WHEN original ? 'currency' AND original->>'currency' IS DISTINCT FROM 'MYR' THEN 'currency requires review' END
    ) AS review_reason
  FROM checked
)
SELECT * FROM review WHERE review_reason <> '';
