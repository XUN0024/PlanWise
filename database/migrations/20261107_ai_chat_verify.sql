SELECT enabled,user_daily,user_minute,global_daily,global_minute,global_concurrent FROM public.ai_chat_settings WHERE id=1;
-- Expected: false / false / false / true / true.
SELECT has_table_privilege('anon','public.ai_chat_requests','SELECT') AS anon_can_read,
  has_table_privilege('authenticated','public.ai_chat_requests','SELECT') AS user_can_read_ledger,
  has_function_privilege('authenticated','public.reserve_ai_chat(uuid,uuid,text)','EXECUTE') AS user_can_reserve,
  has_function_privilege('service_role','public.reserve_ai_chat(uuid,uuid,text)','EXECUTE') AS server_can_reserve,
  has_function_privilege('service_role','public.finish_ai_chat(uuid,uuid,text,text,integer,integer,integer,text)','EXECUTE') AS server_can_finish;
