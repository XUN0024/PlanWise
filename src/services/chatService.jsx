//取得当前用户的登录状态，再发送请求， 请求地址”/functions/v1/ask-planwise“ [Edge Function 入口]
import { supabase } from "../lib/supabase";
import { validateExpenseContext, validateExpenseReport } from "../../supabase/functions/ask-planwise/expense-report.mjs";
import { validateTaskContext, validateTaskReport, taskSources } from "../../supabase/functions/ask-planwise/task-report.mjs";
import { validateWorkspaceContext, validateWorkspaceResult, workspaceSources } from "../../supabase/functions/ask-planwise/workspace-report.mjs";
const failure=(code,extra={})=>Object.assign(new Error(code),{code,...extra});
const validQuota=quota=>quota&&Number.isInteger(quota.dailyLimit)&&quota.dailyLimit>=1&&quota.dailyLimit<=1000&&Number.isInteger(quota.dailyRemaining)&&quota.dailyRemaining>=0&&quota.dailyRemaining<=quota.dailyLimit;
export async function sendChat({userId,requestId,messages,signal,context}) {
  if(signal?.aborted) throw failure("AI_ABORTED");
  const {data,error}=await supabase.auth.getSession();
  if(error || !data?.session || data.session.user.id!==userId) throw failure("AI_AUTH_REQUIRED");
  const expenseContext=context?.type==="expenses"?validateExpenseContext(context):null;
  const taskContext=context?.type==="tasks"?validateTaskContext(context):null;
  const workspaceContext=context?.type==="workspace"?validateWorkspaceContext(context):null;
  const noteContext = context && !expenseContext && !taskContext && !workspaceContext ? { type: "note", noteId: context.noteId, version: context.version, action: context.action } : null;
  if(noteContext && (context.type !== "note" || !noteContext.noteId || !noteContext.version || !["ask","summarize"].includes(noteContext.action))) throw failure("AI_INPUT_INVALID");
  const controller=new AbortController(),cancel=()=>controller.abort();
  signal?.addEventListener("abort",cancel,{once:true});if(signal?.aborted)cancel();
  const timer=setTimeout(cancel,context?100000:80000);
  try {
    const response=await fetch(process.env.REACT_APP_SUPABASE_URL.replace(/\/$/,"")+"/functions/v1/ask-planwise",{
      method:"POST",headers:{Authorization:"Bearer "+data.session.access_token,apikey:process.env.REACT_APP_SUPABASE_ANON_KEY,"Content-Type":"application/json"},
      body:JSON.stringify({requestId,messages,...(context ? {context:workspaceContext||taskContext||expenseContext||noteContext} : {})}),signal:controller.signal,
    });
    let payload;try{payload=await response.json();}catch{throw failure(response.status===404?"AI_DEPLOY_REQUIRED":"AI_INVALID_RESPONSE");}
    if(!response.ok) throw failure((workspaceContext||expenseContext||taskContext) && payload?.code==="AI_INPUT_INVALID"?(workspaceContext?"AI_WORKSPACE_SETUP_REQUIRED":taskContext?"AI_TASK_SETUP_REQUIRED":"AI_EXPENSE_SETUP_REQUIRED"):/^AI_[A-Z_]+$/.test(payload?.code)?payload.code:response.status===401?"AI_AUTH_REQUIRED":response.status===404?"AI_DEPLOY_REQUIRED":"AI_NETWORK",
      {retryWithNewId:payload?.retryWithNewId===true,quota:validQuota(payload?.quota)?payload.quota:undefined});
    if(payload?.requestId!==requestId || typeof payload.reply!=="string" || !payload.reply.trim() || Array.from(payload.reply).length>12000) throw failure("AI_INVALID_RESPONSE");
    const quota=payload.quota;
    if(!validQuota(quota)) throw failure("AI_INVALID_RESPONSE");
    const sources = payload.sources || [];
    if(workspaceContext){
      if(!payload.workspace)throw failure("AI_WORKSPACE_SETUP_REQUIRED",{quota,retryWithNewId:true});
      const workspace=validateWorkspaceResult(payload.workspace,workspaceContext),expected=workspaceSources(workspace.cards);
      if(JSON.stringify(sources)!==JSON.stringify(expected))throw failure("AI_WORKSPACE_DATA_INVALID");
      return{reply:payload.reply,quota,workspace,sources,cached:payload.cached===true};
    }
    if(taskContext){
      if(!payload.taskReport)throw failure("AI_TASK_SETUP_REQUIRED",{quota,retryWithNewId:true});
      const taskReport=validateTaskReport(payload.taskReport,taskContext),expected=taskSources(taskReport);
      if(!Array.isArray(sources)||sources.length!==expected.length||sources.some((source,index)=>!source||["type","id","title","version"].some(key=>source[key]!==expected[index][key])))throw failure("AI_TASK_DATA_INVALID");
      return{reply:payload.reply,quota,sources,taskReport,cached:payload.cached===true,elapsedMs:Number.isFinite(payload.elapsedMs)?payload.elapsedMs:null};
    }
    if(expenseContext){
      if(!payload.report)throw failure("AI_EXPENSE_SETUP_REQUIRED",{quota,retryWithNewId:true});
      const report=validateExpenseReport(payload.report,expenseContext);
      const allowed=new Map([...report.current.largest,...report.previous.largest].map(row=>[row.id,row]));
      if(!Array.isArray(sources)||sources.length!==allowed.size||new Set(sources.map(source=>source.id)).size!==sources.length
        || sources.some(source=>source.type!=="expense"||!allowed.has(source.id)||source.version!==allowed.get(source.id).version
          || source.title!==allowed.get(source.id).note||source.date!==allowed.get(source.id).date||source.amount_cents!==allowed.get(source.id).amount_cents))throw failure("AI_EXPENSE_DATA_INVALID");
      return{reply:payload.reply,quota,sources,report,cached:payload.cached===true,elapsedMs:Number.isFinite(payload.elapsedMs)?payload.elapsedMs:null};
    }
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
