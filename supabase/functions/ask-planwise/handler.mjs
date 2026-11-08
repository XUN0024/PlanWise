import { validateNoteContext, prepareNote, NOTE_SYSTEM, noteMessages } from "./note-context.mjs";
import { validateExpenseContext, readExpenseReport, EXPENSE_SYSTEM, expenseMessages, expenseSources } from "./expense-context.mjs";
import { validateTaskContext, taskSources } from "./task-report.mjs";
import { readTaskReport, TASK_SYSTEM, taskMessages } from "./task-context.mjs";
import { validateWorkspaceContext } from "./workspace-report.mjs";
import { prepareWorkspace, guardWorkspaceReply } from "./workspace-context.mjs";
export const MODEL = "@cf/zai-org/glm-4.7-flash";
// Global assistant identity. Keep personal user preferences out of this shared prompt.
// Editing this constant requires redeploying ask-planwise; no SQL or Secret changes.
export const SYSTEM = `
[Identity]
You are PW AI, the personal productivity assistant in the PlanWise application. You are an AI assistant; do not present yourself as a real person.
Your goal is to help users organize their thoughts, understand information, break down goals, and identify clear, actionable next steps.

[Communication Style]
Reply in the user's language. Be professional, friendly, and direct. Lead with the main point, then provide any necessary explanation.
Prefer short paragraphs and clear steps. Expand when the user needs more detail. Avoid empty encouragement and unnecessary repetition.
When information is missing, state what is uncertain and ask only the most essential questions when needed. Do not guess the user's personal circumstances.

[Current Capabilities]
In general chat, base your answers solely on the supplied conversation; you cannot read the user's records.
In selected-note mode, the server supplies one authorized note for summaries and questions. You can use only that provided note, not the rest of the user's library.
In expenses mode, the server supplies an authorized, exact database report for spending review and period comparison.
In tasks mode, the server supplies authorized task facts for today's focus suggestions and selected-task breakdown previews.
In unified workspace mode, the server supplies authorized results for the selected or automatically chosen reference sources. Use only those supplied results.
Attachments and internet search are not connected. You cannot create, modify, or delete application records.
Users may provide text in the chat for you to summarize, organize, or turn into a plan. This does not mean you have accessed the application's database.

[Response Boundaries]
Do not invent user records, sources, amounts, task statuses, or deadlines. Do not claim to have performed any application operation for the user.
If a request requires a capability that is not connected yet, briefly explain the limitation and suggest a feasible next step. You do not need to repeat these limitations in every reply.
When asked "Who are you?", introduce PW AI's identity and purpose within the product.
When explicitly asked about the underlying model or provider, explain truthfully that it is hosted by Cloudflare Workers AI and that the current model ID is ${MODEL}.
Use mainly plain text and short lists to keep replies easy to read.
`.trim();
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const fail=(code,status=500,extra={})=>Object.assign(new Error(code),{code,status,...extra});
export function validateChat(body) {
  if(!body || !UUID.test(body.requestId) || !Array.isArray(body.messages) || body.messages.length<1 || body.messages.length>13 || body.messages.length%2!==1) throw fail("AI_INPUT_INVALID",400);
  let size=0;
  const messages=body.messages.map((item,index)=>{
    if(!item || item.role!==(index%2===0?"user":"assistant") || typeof item.content!=="string") throw fail("AI_INPUT_INVALID",400);
    const content=item.content.trim(),length=Array.from(content).length;size+=length;
    if(!length || length>2000 || content.includes("\0")) throw fail("AI_INPUT_INVALID",400);
    return{role:item.role,content};
  });
  if(size>6000) throw fail("AI_INPUT_INVALID",400);
  return{requestId:body.requestId,messages,context:body.context?.type==="workspace"?validateWorkspaceContext(body.context):body.context?.type==="tasks"?validateTaskContext(body.context):body.context?.type==="expenses"?validateExpenseContext(body.context):validateNoteContext(body.context)};
}
async function readJson(response,limit) {
  const reader=response.body?.getReader();if(!reader) throw fail("AI_INVALID_RESPONSE",502);
  const chunks=[];let size=0;
  try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit)throw fail("AI_BODY_TOO_LARGE",413);chunks.push(value);}}
  catch(error){await reader.cancel().catch(()=>{});throw error;}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw fail("AI_INVALID_JSON",400);}
}
const keyFrom=(env,legacy,dictionary)=>{if(env(legacy))return env(legacy);try{return JSON.parse(env(dictionary)||"{}").default||"";}catch{return"";}};
const number=(value,max=200000)=>Number.isInteger(value)&&value>=0&&value<=max?value:null;
function providerFailure(status,payload) {
  const codes=(Array.isArray(payload?.errors)?payload.errors:[]).map(item=>Number(item.code));
  const code=codes.some(value=>[5007,5018,5016,3041,5035,3042,5028].includes(value))?"AI_MODEL_UNAVAILABLE"
    :codes.includes(3036)||status===429?"AI_PROVIDER_LIMIT":codes.some(value=>[3007,3008].includes(value))||status===408?"AI_TIMEOUT"
    :status===401||status===403?"AI_PROVIDER_AUTH":"AI_PROVIDER_UNAVAILABLE";
  return fail(code,502,{retryWithNewId:true});
}
export function modelReply(payload) {
  const result=payload?.result ?? payload;
  let reply=result?.choices?.[0]?.message?.content ?? result?.response;
  if(typeof reply!=="string") throw fail("AI_EMPTY_RESPONSE",502,{retryWithNewId:true});
  // Never surface reasoning text, including providers that place it inline.
  reply=reply.replace(/<think>[\s\S]*?<\/think>/gi,"").trim();
  if(!reply || /<think>/i.test(reply) || Array.from(reply).length>12000) throw fail("AI_EMPTY_RESPONSE",502,{retryWithNewId:true});
  return{reply,promptTokens:number(result?.usage?.prompt_tokens),completionTokens:number(result?.usage?.completion_tokens)};
}
export function createChatHandler({env,fetchImpl=fetch,cryptoImpl=crypto,now=()=>Date.now(),logger=console}) {
  return async request=>{
    const origin=request.headers.get("Origin"),allowed=(env("AI_ALLOWED_ORIGINS")||"http://localhost:3000,http://127.0.0.1:3000,null").split(",").map(value=>value.trim());
    const headers={"Content-Type":"application/json","Cache-Control":"no-store",Vary:"Origin","Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info"};
    if(origin && allowed.includes(origin))headers["Access-Control-Allow-Origin"]=origin;
    const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
    if(origin && !allowed.includes(origin))return json({code:"AI_ORIGIN_DENIED"},403);
    if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
    if(request.method!=="POST")return json({code:"AI_METHOD_INVALID"},405);
    let userId,requestId,reserved=false,generated=false,quota,started=now();
    const url=(env("SUPABASE_URL")||"").replace(/\/$/,""),publicKey=keyFrom(env,"SUPABASE_ANON_KEY","SUPABASE_PUBLISHABLE_KEYS"),serverKey=keyFrom(env,"SUPABASE_SERVICE_ROLE_KEY","SUPABASE_SECRET_KEYS");
    const rpc=async(name,body)=>{
      const authorization=serverKey.startsWith("sb_secret_")?{}:{Authorization:"Bearer "+serverKey};
      const response=await fetchImpl(`${url}/rest/v1/rpc/${name}`,{method:"POST",headers:{apikey:serverKey,...authorization,"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw fail(response.status===404?"AI_SETUP_REQUIRED":"AI_DATABASE_ERROR",503);
      return response.status===204?null:readJson(response,65536);
    };
    const finish=async(status,data={})=>rpc("finish_ai_chat",{p_user_id:userId,p_request_id:requestId,p_status:status,p_reply:data.reply??null,
      p_prompt_tokens:data.promptTokens??null,p_completion_tokens:data.completionTokens??null,p_elapsed_ms:Math.min(120000,Math.max(0,now()-started)),p_error_code:data.code??null});
    try {
      const authorization=request.headers.get("Authorization");if(!/^Bearer\s+\S+$/i.test(authorization||""))throw fail("AI_AUTH_REQUIRED",401);
      if(!url || !publicKey || !serverKey)throw fail("AI_SERVER_CONFIG",503);
      const auth=await fetchImpl(`${url}/auth/v1/user`,{headers:{Authorization:authorization,apikey:publicKey},signal:AbortSignal.timeout(8000)});
      if(!auth.ok)throw fail(auth.status>=500?"AI_AUTH_UNAVAILABLE":"AI_AUTH_REQUIRED",auth.status>=500?503:401);
      const user=await readJson(auth,32768);if(!UUID.test(user.id)||user.is_anonymous===true)throw fail("AI_AUTH_REQUIRED",401);userId=user.id;
      if(!(request.headers.get("Content-Type")||"").toLowerCase().startsWith("application/json"))throw fail("AI_INPUT_INVALID",400);
      let body;try{body=await readJson(request,32768);}catch(error){throw fail("AI_INPUT_INVALID",error.status===413?413:400);}
      const input=validateChat(body);requestId=input.requestId;
      let selectedNote = null;
      if (input.context?.type === "note") {
        const noteUrl = new URL(`${url}/rest/v1/notes`);
        noteUrl.searchParams.set("select", "id,user_id,title,content,checklist,updated_at");
        noteUrl.searchParams.set("id", "eq." + input.context.noteId);
        noteUrl.searchParams.set("user_id", "eq." + userId);
        // User JWT + public key intentionally enforce the caller's notes RLS.
        let response;
        try { response = await fetchImpl(noteUrl.toString(), { headers: { Authorization: authorization, apikey: publicKey }, signal: AbortSignal.timeout(10000) }); }
        catch { throw fail("AI_NOTE_LOAD_FAILED", 503); }
        if (!response.ok) throw fail(response.status === 401 ? "AI_AUTH_REQUIRED" : "AI_NOTE_LOAD_FAILED", response.status === 401 ? 401 : 503);
        let rows;
        try { rows = await readJson(response, 1048576); }
        catch (error) { throw fail(error.code === "AI_BODY_TOO_LARGE" ? "AI_NOTE_TOO_LONG" : "AI_NOTE_CONTENT_INVALID", error.code === "AI_BODY_TOO_LARGE" ? 413 : 502); }
        if (!Array.isArray(rows) || rows.length !== 1) throw fail("AI_NOTE_UNAVAILABLE", 404);
        selectedNote = prepareNote(rows[0], input.context, userId);
      }
      const expenseReport=input.context?.type==="expenses"?await readExpenseReport({context:input.context,userId,url,authorization,publicKey,serverKey,env,fetchImpl,readJson,now}):null;
      const taskReport=input.context?.type==="tasks"?await readTaskReport({context:input.context,userId,url,authorization,publicKey,serverKey,env,fetchImpl,readJson,now}):null;
      const unified=input.context?.type==="workspace"?await prepareWorkspace({context:input.context,messages:input.messages,userId,url,authorization,publicKey,serverKey,env,fetchImpl,readJson,now}):null;
      const reportPayload=unified?{workspace:unified.workspace}:expenseReport?{report:expenseReport}:taskReport?{taskReport}:{};
      const sources = unified?unified.sources:selectedNote ? [selectedNote.source] : expenseReport ? expenseSources(expenseReport) : taskReport?taskSources(taskReport):[];
      const system = SYSTEM + (unified?"\n\n"+unified.system:selectedNote ? "\n\n" + NOTE_SYSTEM : expenseReport ? "\n\n" + EXPENSE_SYSTEM : taskReport?"\n\n"+TASK_SYSTEM:"");
      const messages = selectedNote ? noteMessages(input.messages, selectedNote, input.context.action)
        : unified?unified.messages:expenseReport ? expenseMessages(input.messages,expenseReport,input.context.action) : taskReport?taskMessages(input.messages,taskReport,input.context.action):input.messages;
      const account=(env("CLOUDFLARE_ACCOUNT_ID")||"").trim(),token=(env("CLOUDFLARE_API_TOKEN")||"").trim();
      if(!/^[a-f0-9]{32}$/i.test(account)||!token||!/^[\x21-\x7E]{1,1024}$/.test(token))throw fail("AI_SERVER_CONFIG",503);
      const hash=Array.from(new Uint8Array(await cryptoImpl.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify({model:MODEL,system,messages,context:input.context}))))).map(value=>value.toString(16).padStart(2,"0")).join("");
      const reservation=await rpc("reserve_ai_chat",{p_user_id:userId,p_request_id:requestId,p_request_hash:hash});quota=reservation?.quota;
      if(reservation?.state==="cached")return json({requestId,reply:reservation.reply,model:MODEL,quota,cached:true,elapsedMs:reservation.elapsedMs,sources,actions:[],...reportPayload});
      if(reservation?.state!=="new"){
        const code=typeof reservation?.state==="string"&&reservation.state.startsWith("AI_")?reservation.state:"AI_DATABASE_ERROR";
        if(expenseReport && code==="AI_REQUEST_CONFLICT")throw fail("AI_EXPENSE_CHANGED",409,{retryWithNewId:true});
        if(taskReport && code==="AI_REQUEST_CONFLICT")throw fail("AI_TASK_CHANGED",409,{retryWithNewId:true});
        if(unified && code==="AI_REQUEST_CONFLICT")throw fail("AI_WORKSPACE_CHANGED",409,{retryWithNewId:true});
        throw fail(code,["AI_IN_PROGRESS","AI_REQUEST_CONFLICT","AI_RETRY_NEW_REQUEST"].includes(code)?409:429,{retryWithNewId:code==="AI_RETRY_NEW_REQUEST"});
      }
      reserved=true;
      if(unified?.directReply){
        if(unified.verify)await unified.verify();
        const direct={reply:unified.directReply,promptTokens:0,completionTokens:0};generated=true;
        await finish("completed",direct);reserved=false;
        return json({requestId,reply:direct.reply,model:MODEL,quota,cached:false,elapsedMs:Math.max(0,now()-started),sources,actions:[],...reportPayload});
      }
      const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),45000),abort=()=>controller.abort();
      request.signal.addEventListener("abort",abort,{once:true});if(request.signal.aborted)abort();
      let result;
      try {
        const response=await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${MODEL}`,{method:"POST",
          headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
          body:JSON.stringify({messages:[{role:"system",content:system},...messages],max_completion_tokens:taskReport||unified?.workspace.checked.length?1536:selectedNote||expenseReport ? 1024 : 512,stream:false,store:false,chat_template_kwargs:{enable_thinking:false},tool_choice:"none"}),signal:controller.signal});
        if(!response.ok){let payload;try{payload=await readJson(response,32768);}catch{}throw providerFailure(response.status,payload);}
        let payload;try{payload=await readJson(response,131072);}catch{throw fail("AI_INVALID_RESPONSE",502,{retryWithNewId:true});}
        if(payload?.success===false)throw providerFailure(response.status,payload);
        result=modelReply(payload);
        if(unified)result.reply=guardWorkspaceReply(result.reply,unified.workspace,input.messages.at(-1).content);
        // Do not return references that changed/disappeared while the model was replying.
        if(unified?.verify)await unified.verify();
        generated=true;
      } catch(error) {
        if(controller.signal.aborted)throw fail("AI_TIMEOUT",504,{retryWithNewId:true});throw error;
      } finally {clearTimeout(timeout);request.signal.removeEventListener("abort",abort);}
      // Persist the short retry cache before acknowledging success. No second model call on retry.
      await finish("completed",result);reserved=false;
      return json({requestId,reply:result.reply,model:MODEL,quota,cached:false,elapsedMs:Math.max(0,now()-started),sources,actions:[],...reportPayload});
    } catch(error) {
      const code=generated?"AI_RESULT_PENDING":typeof error?.code==="string"&&error.code.startsWith("AI_")?error.code:"AI_UNAVAILABLE";
      if(reserved && !generated) {try{await finish("failed",{code});}catch{logger.error("PW AI completion ledger unavailable",{requestId,code:"AI_DATABASE_ERROR"});}}
      logger.warn("PW AI request failed",{requestId,code});
      return json({code,requestId,quota,retryWithNewId:!generated&&(reserved||error?.retryWithNewId===true)},generated?503:error?.status||503);
    }
  };
}
