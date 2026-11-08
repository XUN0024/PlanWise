-- Read-only date-range/trend integration. Requires get_expense_statistics and expenses CRUD/payment migrations.
BEGIN;
CREATE OR REPLACE FUNCTION public.get_expense_range_period(
  p_from date,p_to date,p_granularity text,p_small numeric,p_category text,p_payment text,p_search text,p_min numeric,p_max numeric
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE stats jsonb; extra jsonb; unit text; days numeric:=p_to-p_from+1; buckets jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_from>p_to OR p_granularity IS NULL OR p_granularity NOT IN ('auto','day','month') OR p_small IS NULL OR p_small<=0 OR p_small>10000 OR p_small<>trunc(p_small,2) THEN RAISE EXCEPTION 'Invalid period' USING ERRCODE='22023'; END IF;
  unit:=CASE WHEN p_granularity='auto' THEN CASE WHEN days>93 THEN 'month' ELSE 'day' END ELSE p_granularity END;
  IF (unit='day' AND days>731) OR (unit='month' AND (extract(year FROM p_to)-extract(year FROM p_from))*12+extract(month FROM p_to)-extract(month FROM p_from)>599) THEN RAISE EXCEPTION 'EXPENSE_RANGE_TOO_WIDE' USING ERRCODE='22023'; END IF;
  stats:=public.get_expense_statistics(p_from,p_to,p_category,p_payment,p_search,p_min,p_max,unit);
  SELECT coalesce(jsonb_agg(jsonb_build_object('date',to_char(day,'YYYY-MM-DD'),'count',coalesce(found.item->>'count','0'),'total_cents',coalesce(found.item->>'total_cents','0')) ORDER BY day),'[]'::jsonb)
    INTO buckets FROM generate_series(date_trunc(unit,p_from::timestamp),date_trunc(unit,p_to::timestamp),CASE WHEN unit='month' THEN interval '1 month' ELSE interval '1 day' END) day
    LEFT JOIN LATERAL (SELECT item FROM jsonb_array_elements(stats->'trend') item WHERE item->>'date'=to_char(day,'YYYY-MM-DD')) found ON true;
  WITH matched AS MATERIALIZED (
    SELECT e.*,trunc(e.amount*100) AS cents FROM public.expenses e WHERE e.user_id=auth.uid() AND e.expense_date BETWEEN p_from AND p_to
      AND (p_category IS NULL OR e.category=p_category) AND (p_payment IS NULL OR e.payment_method=p_payment OR (p_payment='unrecorded' AND e.payment_method IS NULL))
      AND (p_search IS NULL OR strpos(lower(e.note),lower(p_search))>0) AND (p_min IS NULL OR e.amount>=p_min) AND (p_max IS NULL OR e.amount<=p_max)
  ) SELECT jsonb_build_object('days',days::text,'daily_average_cents',div((stats->>'total_cents')::numeric*2+days,days*2)::text,
    'small',jsonb_build_object('count',(SELECT count(*)::text FROM matched WHERE cents<=p_small*100),
      'total_cents',(SELECT coalesce(sum(cents),0)::text FROM matched WHERE cents<=p_small*100),
      'share_basis_points',CASE WHEN (stats->>'total_cents')::numeric=0 THEN '0' ELSE (SELECT div(coalesce(sum(cents),0)*20000+(stats->>'total_cents')::numeric,(stats->>'total_cents')::numeric*2)::text FROM matched WHERE cents<=p_small*100) END),
    'largest',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'version',updated_at::text,'note',left(note,160),'amount_cents',cents::text,'category',category,'date',expense_date::text) ORDER BY cents DESC,expense_date DESC,id)
      FROM (SELECT * FROM matched ORDER BY cents DESC,expense_date DESC,id LIMIT 5) top_rows),'[]'::jsonb)) INTO extra;
  RETURN (stats||extra)||jsonb_build_object('trend',buckets);
END;
$$;
CREATE OR REPLACE FUNCTION public.get_expense_range_insights(
  p_from date DEFAULT NULL,p_to date DEFAULT NULL,p_comparison text DEFAULT 'none',p_compare_from date DEFAULT NULL,p_compare_to date DEFAULT NULL,
  p_granularity text DEFAULT 'auto',p_small numeric DEFAULT 20,p_category text DEFAULT NULL,p_payment text DEFAULT NULL,p_search text DEFAULT NULL,
  p_min numeric DEFAULT NULL,p_max numeric DEFAULT NULL,p_as_of date DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE as_of date:=coalesce(p_as_of,(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date); first_day date; last_day date; old_first date; old_last date;
  current_stats jsonb; old_stats jsonb:=NULL; changes jsonb:=NULL; version text; months integer; delta numeric; base numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF as_of>(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date OR as_of<date '1900-01-01' OR p_comparison IS NULL OR p_comparison NOT IN ('none','previous','custom')
    OR p_from<date '1900-01-01' OR p_from>as_of OR p_from>p_to OR p_compare_from<date '1900-01-01' OR p_compare_from>as_of
    OR (p_comparison='custom' AND (p_compare_from IS NULL OR p_compare_to IS NULL OR p_compare_from>p_compare_to))
    OR (p_comparison<>'custom' AND (p_compare_from IS NOT NULL OR p_compare_to IS NOT NULL)) THEN RAISE EXCEPTION 'Invalid expense dates' USING ERRCODE='22023'; END IF;
  -- Validates all other filters using the existing exact-statistics function.
  PERFORM public.get_expense_statistics(as_of,as_of,p_category,p_payment,p_search,p_min,p_max,p_granularity);
  last_day:=least(coalesce(p_to,as_of),as_of);
  SELECT coalesce(p_from,min(expense_date),last_day) INTO first_day FROM public.expenses e
    WHERE e.user_id=auth.uid() AND expense_date BETWEEN date '1900-01-01' AND last_day
      AND (p_category IS NULL OR e.category=p_category) AND (p_payment IS NULL OR e.payment_method=p_payment OR (p_payment='unrecorded' AND e.payment_method IS NULL))
      AND (p_search IS NULL OR strpos(lower(e.note),lower(p_search))>0) AND (p_min IS NULL OR amount>=p_min) AND (p_max IS NULL OR amount<=p_max);
  IF first_day>last_day THEN RAISE EXCEPTION 'Invalid expense range' USING ERRCODE='22023'; END IF;
  IF p_comparison='custom' THEN old_first:=p_compare_from;old_last:=least(p_compare_to,as_of);
  ELSIF p_comparison='previous' THEN
    IF p_from IS NOT NULL AND p_to IS NOT NULL AND extract(day FROM p_from)=1 AND p_to=(date_trunc('month',p_to)+interval '1 month - 1 day')::date THEN
      months:=((extract(year FROM p_to)-extract(year FROM p_from))*12+extract(month FROM p_to)-extract(month FROM p_from)+1)::integer;
      old_first:=(first_day-make_interval(months=>months))::date;
      old_last:=CASE WHEN last_day=p_to THEN first_day-1 ELSE least(first_day-1,(last_day-make_interval(months=>months))::date) END;
    ELSE old_last:=first_day-1;old_first:=old_last-(last_day-first_day); END IF;
  END IF;
  IF old_first<date '1900-01-01' OR old_first>old_last THEN RAISE EXCEPTION 'Invalid comparison range' USING ERRCODE='22023'; END IF;
  current_stats:=public.get_expense_range_period(first_day,last_day,p_granularity,p_small,p_category,p_payment,p_search,p_min,p_max);
  IF p_comparison<>'none' THEN
    old_stats:=public.get_expense_range_period(old_first,old_last,p_granularity,p_small,p_category,p_payment,p_search,p_min,p_max);
    delta:=(current_stats->>'total_cents')::numeric-(old_stats->>'total_cents')::numeric;base:=(old_stats->>'total_cents')::numeric;
    SELECT jsonb_build_object('delta_cents',delta::text,'count_delta',((current_stats->>'count')::numeric-(old_stats->>'count')::numeric)::text,
      'change_basis_points',CASE WHEN base=0 THEN NULL ELSE (sign(delta)*div(abs(delta)*20000+base,base*2))::text END,
      'categories',coalesce((SELECT jsonb_agg(jsonb_build_object('key',key,'current_cents',a::text,'previous_cents',b::text,'delta_cents',(a-b)::text) ORDER BY abs(a-b) DESC,key)
        FROM (SELECT coalesce(c.item->>'key',p.item->>'key') AS key,coalesce((c.item->>'total_cents')::numeric,0) AS a,coalesce((p.item->>'total_cents')::numeric,0) AS b
          FROM jsonb_array_elements(current_stats->'categories') c(item) FULL JOIN jsonb_array_elements(old_stats->'categories') p(item) ON c.item->>'key'=p.item->>'key') groups),'[]'::jsonb)) INTO changes;
  END IF;
  SELECT md5(coalesce(string_agg(e.id::text||':'||e.updated_at::text,',' ORDER BY e.id),'')) INTO version FROM public.expenses e WHERE e.user_id=auth.uid()
    AND (e.expense_date BETWEEN first_day AND last_day OR (p_comparison<>'none' AND e.expense_date BETWEEN old_first AND old_last))
    AND (p_category IS NULL OR e.category=p_category) AND (p_payment IS NULL OR e.payment_method=p_payment OR (p_payment='unrecorded' AND e.payment_method IS NULL))
    AND (p_search IS NULL OR strpos(lower(e.note),lower(p_search))>0) AND (p_min IS NULL OR amount>=p_min) AND (p_max IS NULL OR amount<=p_max);
  RETURN jsonb_build_object('schema','expenses-range-v1','owner_id',auth.uid(),'currency','MYR','timezone','Asia/Kuala_Lumpur','data_version',version,
    'scope',jsonb_build_object('requested_from',p_from,'requested_to',p_to,'date_from',first_day,'date_to',last_day,'as_of',as_of,'partial',coalesce(p_to>as_of,false),
      'comparison',p_comparison,'previous_from',old_first,'previous_to',old_last,'previous_partial',coalesce(p_comparison='custom' AND p_compare_to>as_of,false),'granularity',p_granularity,
      'small_amount_cents',trunc(p_small*100)::text,'category',coalesce(p_category,''),'paymentMethod',coalesce(p_payment,''),'search',coalesce(p_search,''),
      'minAmount',CASE WHEN p_min IS NULL THEN '' ELSE to_char(p_min,'FM999999999999990.00') END,'maxAmount',CASE WHEN p_max IS NULL THEN '' ELSE to_char(p_max,'FM999999999999990.00') END),
    'current',current_stats,'previous',old_stats,'comparison',changes);
END;
$$;
REVOKE ALL ON FUNCTION public.get_expense_range_period(date,date,text,numeric,text,text,text,numeric,numeric),public.get_expense_range_insights(date,date,text,date,date,text,numeric,text,text,text,numeric,numeric,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_expense_range_period(date,date,text,numeric,text,text,text,numeric,numeric),public.get_expense_range_insights(date,date,text,date,date,text,numeric,text,text,text,numeric,numeric,date) TO authenticated;
COMMIT;
NOTIFY pgrst,'reload schema';
