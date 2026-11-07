-- Ask PlanWise phase 1. Private quota ledger, callable by the Edge Function only.
BEGIN;
CREATE TABLE IF NOT EXISTS public.ai_chat_settings (
  id integer PRIMARY KEY CHECK(id=1), enabled boolean NOT NULL DEFAULT true,
  user_daily integer NOT NULL DEFAULT 20 CHECK(user_daily BETWEEN 1 AND 1000),
  user_minute integer NOT NULL DEFAULT 3 CHECK(user_minute BETWEEN 1 AND 60),
  global_daily integer NOT NULL DEFAULT 50 CHECK(global_daily BETWEEN 1 AND 10000),
  global_minute integer NOT NULL DEFAULT 10 CHECK(global_minute BETWEEN 1 AND 300),
  global_concurrent integer NOT NULL DEFAULT 3 CHECK(global_concurrent BETWEEN 1 AND 30)
);
INSERT INTO public.ai_chat_settings(id) VALUES(1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS public.ai_chat_requests (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, request_id uuid NOT NULL,
  request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'running' CHECK(status IN ('running','completed','failed')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), finished_at timestamptz,
  reply text CHECK(char_length(reply) BETWEEN 1 AND 12000),
  prompt_tokens integer CHECK(prompt_tokens BETWEEN 0 AND 200000), completion_tokens integer CHECK(completion_tokens BETWEEN 0 AND 200000),
  elapsed_ms integer CHECK(elapsed_ms BETWEEN 0 AND 120000), error_code text CHECK(char_length(error_code)<=80),
  PRIMARY KEY(user_id,request_id)
);
CREATE INDEX IF NOT EXISTS ai_chat_requests_created_idx ON public.ai_chat_requests(created_at);
CREATE INDEX IF NOT EXISTS ai_chat_requests_user_created_idx ON public.ai_chat_requests(user_id,created_at);
ALTER TABLE public.ai_chat_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_chat_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_chat_settings,public.ai_chat_requests FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.ai_chat_settings,public.ai_chat_requests TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_ai_chat(p_user_id uuid,p_request_id uuid,p_request_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
  cfg public.ai_chat_settings; previous public.ai_chat_requests; v_now timestamptz:=clock_timestamp();
  day_start timestamptz; resets timestamptz; ud integer; um integer; gd integer; gm integer; running integer; quota jsonb;
BEGIN
  IF p_user_id IS NULL OR p_request_id IS NULL OR p_request_hash IS NULL OR p_request_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Invalid AI request' USING ERRCODE='22023';
  END IF;
  -- This lock serializes reservations across users and Edge Function instances.
  SELECT * INTO STRICT cfg FROM public.ai_chat_settings WHERE id=1 FOR UPDATE;
  v_now:=clock_timestamp();
  day_start:=date_trunc('day',v_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'; resets:=day_start+interval '1 day';
  DELETE FROM public.ai_chat_requests WHERE created_at<v_now-interval '7 days';
  UPDATE public.ai_chat_requests SET reply=NULL WHERE created_at<v_now-interval '1 day' AND reply IS NOT NULL;
  UPDATE public.ai_chat_requests SET status='failed',error_code='AI_EXPIRED',finished_at=v_now
    WHERE status='running' AND created_at<v_now-interval '2 minutes';
  SELECT count(*) FILTER(WHERE user_id=p_user_id AND created_at>=day_start),
    count(*) FILTER(WHERE user_id=p_user_id AND created_at>v_now-interval '1 minute'),
    count(*) FILTER(WHERE created_at>=day_start),count(*) FILTER(WHERE created_at>v_now-interval '1 minute'),
    count(*) FILTER(WHERE status='running') INTO ud,um,gd,gm,running FROM public.ai_chat_requests;
  quota:=jsonb_build_object('dailyLimit',cfg.user_daily,'dailyRemaining',greatest(0,cfg.user_daily-ud),'resetAt',resets);
  SELECT * INTO previous FROM public.ai_chat_requests WHERE user_id=p_user_id AND request_id=p_request_id;
  IF FOUND THEN
    IF previous.request_hash<>p_request_hash THEN RETURN jsonb_build_object('state','AI_REQUEST_CONFLICT','quota',quota); END IF;
    IF previous.status='completed' AND previous.reply IS NOT NULL THEN
      RETURN jsonb_build_object('state','cached','reply',previous.reply,'promptTokens',previous.prompt_tokens,
        'completionTokens',previous.completion_tokens,'elapsedMs',previous.elapsed_ms,'quota',quota);
    END IF;
    RETURN jsonb_build_object('state',CASE WHEN previous.status='running' THEN 'AI_IN_PROGRESS' ELSE 'AI_RETRY_NEW_REQUEST' END,'quota',quota);
  END IF;
  IF NOT cfg.enabled THEN RETURN jsonb_build_object('state','AI_DISABLED'); END IF;
  IF ud>=cfg.user_daily THEN RETURN jsonb_build_object('state','AI_USER_DAILY_LIMIT','quota',quota); END IF;
  IF gd>=cfg.global_daily THEN RETURN jsonb_build_object('state','AI_GLOBAL_DAILY_LIMIT','quota',quota); END IF;
  IF um>=cfg.user_minute OR gm>=cfg.global_minute THEN RETURN jsonb_build_object('state','AI_RATE_LIMIT','quota',quota); END IF;
  IF running>=cfg.global_concurrent OR EXISTS(SELECT 1 FROM public.ai_chat_requests WHERE user_id=p_user_id AND status='running') THEN
    RETURN jsonb_build_object('state','AI_BUSY','quota',quota);
  END IF;
  INSERT INTO public.ai_chat_requests(user_id,request_id,request_hash,created_at) VALUES(p_user_id,p_request_id,p_request_hash,v_now);
  RETURN jsonb_build_object('state','new','quota',jsonb_set(quota,'{dailyRemaining}',to_jsonb(greatest(0,cfg.user_daily-ud-1))));
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_ai_chat(p_user_id uuid,p_request_id uuid,p_status text,p_reply text DEFAULT NULL,
  p_prompt_tokens integer DEFAULT NULL,p_completion_tokens integer DEFAULT NULL,p_elapsed_ms integer DEFAULT NULL,p_error_code text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('completed','failed') OR (p_status='completed' AND (p_reply IS NULL OR char_length(btrim(p_reply)) NOT BETWEEN 1 AND 12000)) THEN
    RAISE EXCEPTION 'Invalid AI completion' USING ERRCODE='22023';
  END IF;
  UPDATE public.ai_chat_requests SET status=p_status,reply=CASE WHEN p_status='completed' THEN p_reply ELSE NULL END,
    prompt_tokens=p_prompt_tokens,completion_tokens=p_completion_tokens,elapsed_ms=p_elapsed_ms,error_code=p_error_code,finished_at=clock_timestamp()
    WHERE user_id=p_user_id AND request_id=p_request_id AND status='running';
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_ai_chat(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.finish_ai_chat(uuid,uuid,text,text,integer,integer,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_chat(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_ai_chat(uuid,uuid,text,text,integer,integer,integer,text) TO service_role;
COMMIT;
NOTIFY pgrst,'reload schema';
