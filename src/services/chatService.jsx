//取得当前用户的登录状态，再发送请求， 请求地址”/functions/v1/ask-planwise“ [Edge Function 入口]
import { supabase } from "../lib/supabase";
const failure=(code,extra={})=>Object.assign(new Error(code),{code,...extra});
const validQuota=quota=>quota&&Number.isInteger(quota.dailyLimit)&&quota.dailyLimit>=1&&quota.dailyLimit<=1000&&Number.isInteger(quota.dailyRemaining)&&quota.dailyRemaining>=0&&quota.dailyRemaining<=quota.dailyLimit;
export async function sendChat({userId,requestId,messages,signal,context}) {
  if(signal?.aborted) throw failure("AI_ABORTED");
  const {data,error}=await supabase.auth.getSession();
  if(error || !data?.session || data.session.user.id!==userId) throw failure("AI_AUTH_REQUIRED");
  const noteContext = context ? { type: "note", noteId: context.noteId, version: context.version, action: context.action } : null;
  if(context && (context.type !== "note" || !noteContext.noteId || !noteContext.version || !["ask","summarize"].includes(noteContext.action))) throw failure("AI_INPUT_INVALID");
  const controller=new AbortController(),cancel=()=>controller.abort();
  signal?.addEventListener("abort",cancel,{once:true});if(signal?.aborted)cancel();
  const timer=setTimeout(cancel,noteContext?100000:80000);
  try {
    const response=await fetch(process.env.REACT_APP_SUPABASE_URL.replace(/\/$/,"")+"/functions/v1/ask-planwise",{
      method:"POST",headers:{Authorization:"Bearer "+data.session.access_token,apikey:process.env.REACT_APP_SUPABASE_ANON_KEY,"Content-Type":"application/json"},
      body:JSON.stringify({requestId,messages,...(noteContext ? {context:noteContext} : {})}),signal:controller.signal,
    });
    let payload;try{payload=await response.json();}catch{throw failure(response.status===404?"AI_DEPLOY_REQUIRED":"AI_INVALID_RESPONSE");}
    if(!response.ok) throw failure(/^AI_[A-Z_]+$/.test(payload?.code)?payload.code:response.status===401?"AI_AUTH_REQUIRED":response.status===404?"AI_DEPLOY_REQUIRED":"AI_NETWORK",
      {retryWithNewId:payload?.retryWithNewId===true,quota:validQuota(payload?.quota)?payload.quota:undefined});
    if(payload?.requestId!==requestId || typeof payload.reply!=="string" || !payload.reply.trim() || Array.from(payload.reply).length>12000) throw failure("AI_INVALID_RESPONSE");
    const quota=payload.quota;
    if(!validQuota(quota)) throw failure("AI_INVALID_RESPONSE");
    const sources = payload.sources || [];
    if(noteContext && Array.isArray(sources) && !sources.length) throw failure("AI_NOTE_SETUP_REQUIRED",{quota,retryWithNewId:true});
    if(!Array.isArray(sources) || sources.length !== (noteContext ? 1 : 0)) throw failure("AI_INVALID_RESPONSE");
    if(noteContext && (sources[0]?.type !== "note" || sources[0].id !== noteContext.noteId || sources[0].version !== noteContext.version
      || typeof sources[0].title !== "string" || sources[0].title.length > 24000)) throw failure("AI_INVALID_RESPONSE");
    return{reply:payload.reply,quota,sources,cached:payload.cached===true,elapsedMs:Number.isFinite(payload.elapsedMs)?payload.elapsedMs:null};
  } catch(error) {
    if(signal?.aborted)throw failure("AI_ABORTED");
    if(controller.signal.aborted)throw failure("AI_TIMEOUT");
    if(error?.code?.startsWith("AI_"))throw error;
    throw failure("AI_NETWORK");
  } finally {clearTimeout(timer);signal?.removeEventListener("abort",cancel);}
}
