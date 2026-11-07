-- Read-only Expenses Assistant v1. Requires expenses CRUD + payment/time migrations.
BEGIN;
CREATE OR REPLACE FUNCTION public.get_expense_insights(
  p_month date, p_small_amount numeric DEFAULT 20, p_search text DEFAULT NULL,
  p_category text DEFAULT NULL, p_as_of date DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE
  owner_id uuid := auth.uid(); today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  as_of date; current_end date; previous_start date; previous_end date; partial boolean; result jsonb;
BEGIN
  IF owner_id IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  as_of := coalesce(p_as_of,today);
  IF p_month IS NULL OR p_month < DATE '1900-01-01' OR extract(day FROM p_month)<>1
    OR p_month > as_of OR as_of > today OR as_of < DATE '1900-01-01'
    OR p_small_amount IS NULL OR p_small_amount<=0 OR p_small_amount>10000 OR p_small_amount<>trunc(p_small_amount,2)
    OR char_length(p_search)>1000
    OR (p_category IS NOT NULL AND p_category NOT IN ('Food','Transport','Bills','Entertainment','Shopping','Health','Other')) THEN
    RAISE EXCEPTION 'Invalid expense insight filters' USING ERRCODE='22023';
  END IF;
  partial := date_trunc('month',p_month)=date_trunc('month',as_of);
  current_end := CASE WHEN partial THEN as_of ELSE (p_month+interval '1 month - 1 day')::date END;
  previous_start := (p_month-interval '1 month')::date;
  previous_end := CASE WHEN partial THEN least((previous_start+interval '1 month - 1 day')::date,previous_start+extract(day FROM as_of)::integer-1)
    ELSE (p_month-1)::date END;
  WITH periods(name,date_from,date_to) AS (
    VALUES('current'::text,p_month,current_end),('previous'::text,previous_start,previous_end)
  ), matched AS MATERIALIZED (
    SELECT p.name,e.id,e.note,e.category,e.payment_method,e.expense_date,e.expense_time,e.updated_at,
      trunc(e.amount*100) AS cents,lower(regexp_replace(btrim(e.note),'\s+',' ','g')) AS description_key
    FROM periods p JOIN public.expenses e ON e.expense_date BETWEEN p.date_from AND p.date_to
    WHERE e.user_id=owner_id AND (p_search IS NULL OR position(lower(p_search) in lower(e.note))>0)
      AND (p_category IS NULL OR e.category=p_category)
  ), totals AS (
    SELECT p.name,p.date_from,p.date_to,(p.date_to-p.date_from+1)::numeric AS days,
      count(m.id) AS records,coalesce(sum(m.cents),0) AS cents,count(DISTINCT m.expense_date) AS active_days,
      count(m.id) FILTER(WHERE m.cents<=p_small_amount*100) AS small_count,
      coalesce(sum(m.cents) FILTER(WHERE m.cents<=p_small_amount*100),0) AS small_cents
    FROM periods p LEFT JOIN matched m ON m.name=p.name GROUP BY p.name,p.date_from,p.date_to
  ), categories AS (
    SELECT name,category AS key,count(*) AS records,sum(cents) AS cents FROM matched GROUP BY name,category
  ), methods AS (
    SELECT name,coalesce(payment_method,'unrecorded') AS key,count(*) AS records,sum(cents) AS cents FROM matched GROUP BY name,payment_method
  ), daily AS (
    SELECT name,expense_date AS day,count(*) AS records,sum(cents) AS cents FROM matched GROUP BY name,expense_date
  ), weekdays AS (
    SELECT name,extract(isodow FROM expense_date)::integer AS weekday,count(*) AS records,sum(cents) AS cents
    FROM matched GROUP BY name,weekday
  ), frequent AS (
    SELECT name,description_key,min(left(note,160)) AS description,count(*) AS records,sum(cents) AS cents
    FROM matched GROUP BY name,description_key HAVING count(*)>=2
  ), snapshots AS (
    SELECT t.name,jsonb_build_object(
      'count',t.records::text,'total_cents',t.cents::text,
      'average_cents',CASE WHEN t.records=0 THEN '0' ELSE div(t.cents*2+t.records,t.records*2)::text END,
      'daily_average_cents',div(t.cents*2+t.days,t.days*2)::text,'days',t.days::text,'active_days',t.active_days::text,
      'small',jsonb_build_object('count',t.small_count::text,'total_cents',t.small_cents::text,
        'share_basis_points',CASE WHEN t.cents=0 THEN '0' ELSE div(t.small_cents*20000+t.cents,t.cents*2)::text END),
      'categories',coalesce((SELECT jsonb_agg(jsonb_build_object('key',c.key,'count',c.records::text,'total_cents',c.cents::text,
        'share_basis_points',div(c.cents*20000+t.cents,t.cents*2)::text) ORDER BY c.cents DESC,c.key) FROM categories c WHERE c.name=t.name),'[]'::jsonb),
      'methods',coalesce((SELECT jsonb_agg(jsonb_build_object('key',m.key,'count',m.records::text,'total_cents',m.cents::text)
        ORDER BY m.cents DESC,m.key) FROM methods m WHERE m.name=t.name),'[]'::jsonb),
      'daily',coalesce((SELECT jsonb_agg(jsonb_build_object('date',d.day::text,'count',d.records::text,'total_cents',d.cents::text)
        ORDER BY d.day) FROM daily d WHERE d.name=t.name),'[]'::jsonb),
      'weekdays',coalesce((SELECT jsonb_agg(jsonb_build_object('key',w.weekday::text,'count',w.records::text,'total_cents',w.cents::text)
        ORDER BY w.weekday) FROM weekdays w WHERE w.name=t.name),'[]'::jsonb),
      'frequent_group_count',(SELECT count(*)::text FROM frequent f WHERE f.name=t.name),
      'frequent',coalesce((SELECT jsonb_agg(jsonb_build_object('description',f.description,'count',f.records::text,'total_cents',f.cents::text)
        ORDER BY f.records DESC,f.cents DESC,f.description_key) FROM
        (SELECT * FROM frequent WHERE name=t.name ORDER BY records DESC,cents DESC,description_key LIMIT 5) f),'[]'::jsonb),
      'largest',coalesce((SELECT jsonb_agg(jsonb_build_object('id',b.id,'version',b.updated_at::text,'note',left(b.note,160),
        'amount_cents',b.cents::text,'category',b.category,'date',b.expense_date::text,'time',b.expense_time::text,'payment_method',b.payment_method)
        ORDER BY b.cents DESC,b.expense_date DESC,b.id) FROM
        (SELECT * FROM matched WHERE name=t.name ORDER BY cents DESC,expense_date DESC,id LIMIT 5) b),'[]'::jsonb)
    ) AS data FROM totals t
  ), category_changes AS (
    SELECT coalesce(c.key,p.key) AS key,coalesce(c.cents,0) AS current_cents,coalesce(p.cents,0) AS previous_cents,
      coalesce(c.cents,0)-coalesce(p.cents,0) AS delta
    FROM (SELECT * FROM categories WHERE name='current') c FULL JOIN (SELECT * FROM categories WHERE name='previous') p ON p.key=c.key
  )
  SELECT jsonb_build_object(
    'schema','expenses-insights-v1','owner_id',owner_id,'currency','MYR','timezone','Asia/Kuala_Lumpur',
    'data_version',md5(coalesce((SELECT string_agg(m.name||':'||m.id::text||':'||m.updated_at::text,'|' ORDER BY m.name,m.id) FROM matched m),'')),
    'scope',jsonb_build_object('month',to_char(p_month,'YYYY-MM'),'date_from',p_month::text,'date_to',current_end::text,
      'previous_from',previous_start::text,'previous_to',previous_end::text,'as_of',as_of::text,'partial',partial,
      'small_amount_cents',trunc(p_small_amount*100)::text,'search',p_search,'category',p_category),
    'current',(SELECT data FROM snapshots WHERE name='current'),'previous',(SELECT data FROM snapshots WHERE name='previous'),
    'comparison',jsonb_build_object('delta_cents',(c.cents-p.cents)::text,
      'change_basis_points',CASE WHEN p.cents=0 THEN NULL ELSE (sign(c.cents-p.cents)*div(abs(c.cents-p.cents)*20000+p.cents,p.cents*2))::text END,
      'categories',coalesce((SELECT jsonb_agg(jsonb_build_object('key',key,'current_cents',current_cents::text,'previous_cents',previous_cents::text,
        'delta_cents',delta::text) ORDER BY abs(delta) DESC,key) FROM category_changes),'[]'::jsonb))
  ) INTO result FROM totals c CROSS JOIN totals p WHERE c.name='current' AND p.name='previous';
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_expense_insights(date,numeric,text,text,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_expense_insights(date,numeric,text,text,date) TO authenticated;
COMMIT;
NOTIFY pgrst,'reload schema';
