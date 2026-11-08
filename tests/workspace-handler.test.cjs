const test=require("node:test"),assert=require("node:assert/strict"),{randomUUID,webcrypto}=require("node:crypto");
const task=require("./fixtures/task-insight.cjs"),expense=require("./fixtures/expense-insight.cjs");let api,shared;
const range=require("./fixtures/expense-range.cjs");
const context=references=>({type:"workspace",version:1,references}),NOTE="00000000-0000-4000-8000-000000000040",VERSION="2026-11-07T03:00:00.123456+00:00",quota={dailyLimit:20,dailyRemaining:19};
test.before(async()=>{api=await import("../supabase/functions/ask-planwise/handler.mjs");shared=await import("../supabase/functions/ask-planwise/workspace-report.mjs");});
function fixture(options={}){
  const calls=[],env={SUPABASE_URL:"https://test.supabase.co",SUPABASE_ANON_KEY:"public-key",SUPABASE_SERVICE_ROLE_KEY:"service-private",CLOUDFLARE_ACCOUNT_ID:"a".repeat(32),CLOUDFLARE_API_TOKEN:"cf-private"};
  const handler=api.createChatHandler({env:key=>env[key],now:()=>Date.parse("2026-11-07T04:00:00Z"),cryptoImpl:webcrypto,logger:{warn(){},error(){}},fetchImpl:async(url,init={})=>{
    calls.push({url,init,body:init.body?JSON.parse(init.body):null});
    if(url.endsWith("/auth/v1/user"))return Response.json({id:task.USER});
    if(url.endsWith("/search_workspace_notes"))return Response.json(options.notes||{owner_id:task.USER,total:1,library_total:1,version:"e".repeat(32),rows:[{id:NOTE,title:"Class notes",version:VERSION,text:"TAI discusses retrieval."}]},{status:options.notesStatus||200});
    if(url.endsWith("/get_workspace_note_overview"))return Response.json(options.overview||{owner_id:task.USER,total:1,library_total:1,version:"e".repeat(32),offset:0,limit:10,next_offset:null,rows:[{id:NOTE,title:"Class notes",version:VERSION,text:"TAI discusses retrieval."}]},{status:options.overviewStatus||200});
    if(url.endsWith("/query_workspace_tasks"))return Response.json({owner_id:task.USER,total:1,version:"f".repeat(32),rows:[{id:task.TASK,version:"b".repeat(32),title:"Prepare presentation",priority:"High",is_completed:false,reminder_date:"2026-11-07"}]});
    if(url.endsWith("/get_task_insights"))return Response.json(task.report(false));
    if(url.endsWith("/get_expense_insights"))return Response.json(expense.report());
    if(url.endsWith("/get_expense_range_insights")){
      const p=JSON.parse(init.body),ctx=range.context({from:p.p_from||"",to:p.p_to||"",comparison:p.p_comparison,compareFrom:p.p_compare_from||"",compareTo:p.p_compare_to||"",granularity:p.p_granularity,smallAmount:p.p_small,category:p.p_category||"",paymentMethod:p.p_payment||"",search:p.p_search||"",minAmount:p.p_min||"",maxAmount:p.p_max||""});
      return Response.json(options.rangeReport||range.report(ctx,p.p_as_of),{status:options.rangeStatus||200});
    }
    if(new URL(url).pathname==="/rest/v1/notes")return Response.json([{id:NOTE,user_id:task.USER,title:"Selected note",updated_at:VERSION,content:"Known reference material",checklist:[]}]);
    if(url.endsWith("/reserve_ai_chat"))return Response.json(options.reservation||{state:"new",quota});
    if(url.endsWith("/finish_ai_chat"))return new Response(null,{status:204});
    if(url.startsWith("https://api.cloudflare.com"))return Response.json({result:{response:options.reply||"Verified answer."}});
    throw Error("Unexpected tool "+url);
  }});
  return{calls,async run(question,refs=[],requestId=randomUUID()){const response=await handler(new Request("https://test.supabase.co/functions/v1/ask-planwise",{method:"POST",headers:{Authorization:"Bearer user-jwt","Content-Type":"application/json"},body:JSON.stringify({requestId,messages:[{role:"user",content:question}],context:context(refs)})}));return{status:response.status,data:await response.json()};}};
}
test("unified general conversation reads no records and returns a verifiable empty lookup envelope",async()=>{
  const f=fixture(),{data,status}=await f.run("Hello");assert.equal(status,200);assert.deepEqual(data.workspace.checked,[]);assert.deepEqual(data.sources,[]);assert.equal(f.calls.some(call=>/get_task|workspace_notes|workspace_tasks|get_expense/.test(call.url)),false);
  shared.validateWorkspaceResult(data.workspace,context([]));
});
test("automatic TAI note retrieval uses caller JWT, real snippets and a truthful keyword search scope",async()=>{
  const f=fixture(),{data,status}=await f.run("我以前写过关于 TAI 的笔记，帮我找一下");assert.equal(status,200);assert.deepEqual(data.workspace.checked,["notes"]);assert.equal(data.sources[0].snippet,"TAI discusses retrieval.");
  const read=f.calls.find(call=>call.url.endsWith("/search_workspace_notes"));assert.equal(read.init.headers.Authorization,"Bearer user-jwt");assert.equal(read.init.headers.apikey,"public-key");assert.deepEqual(read.body.p_terms,["TAI"]);
  assert.equal(JSON.stringify(data).includes("owner_id"),false);assert.deepEqual(data.sources,shared.workspaceSources(data.workspace.cards));
});
test("mixed references query notes/tasks without touching excluded expenses, and changing scope cannot smuggle business data",async()=>{
  const f=fixture(),refs=[{type:"notes"},shared.defaultTasks()],{data,status}=await f.run("结合笔记和任务分析本月消费",refs);assert.equal(status,200);assert.deepEqual(data.workspace.checked,["notes","tasks"]);
  assert.equal(f.calls.some(call=>/get_expense_(?:range_)?insights$/.test(call.url)),false);assert.deepEqual(data.sources.map(row=>row.type),["note","task"]);
  const model=f.calls.find(call=>call.url.startsWith("https://api.cloudflare.com")),facts=JSON.parse(model.body.messages.at(-1).content);assert.deepEqual(facts.reference_scope.selected_references,refs);assert.match(model.body.messages[0].content,/reference selection restricts/i);assert.equal(model.body.tools,undefined);
});
test("the reported note inventory question uses an authorized count/overview RPC in both automatic and My notes scopes",async()=>{
  for(const refs of [[],[{type:"notes"}]]){
    const f=fixture(),{data,status}=await f.run("how many notes do I have and what is each of them about?",refs);assert.equal(status,200);
    const read=f.calls.find(call=>call.url.endsWith("/get_workspace_note_overview"));assert.deepEqual(read.body,{p_offset:0,p_limit:10});assert.equal(read.init.headers.Authorization,"Bearer user-jwt");
    assert.equal(f.calls.some(call=>call.url.endsWith("/search_workspace_notes")),false);assert.equal(data.workspace.cards[0].libraryTotal,1);assert.equal(data.workspace.cards[0].method,"overview");
    const model=f.calls.find(call=>call.url.startsWith("https://api.cloudflare.com")),facts=JSON.parse(model.body.messages.at(-1).content);
    assert.deepEqual(facts.reference_scope.authorized_sources,["notes"]);assert.equal(facts.reference_scope.mode,refs.length?"selected":"automatic");assert.equal(facts.lookup_status,"success");
    assert.equal(facts.verified_workspace_data[0].access,"authorized");assert.match(model.body.messages[0].content,/zero search matches as missing permissions/);
  }
});
test("invented note permission claims and unsupported zero totals are replaced with verified facts before caching",async()=>{
  for(const reply of ["You currently do not have any authorization to view your notes. Apply read:notes.","**Total Notes:** 0","You have 0 saved notes."]){
    const f=fixture({reply}),{data,status}=await f.run("how many notes do I have and what is each of them about?");assert.equal(status,200);assert.match(data.reply,/You have 1 saved note/);assert.match(data.reply,/Class notes/);assert.doesNotMatch(data.reply,/read:notes|not have.*authorization|Total Notes: 0/);
    assert.equal(f.calls.find(call=>call.url.endsWith("/finish_ai_chat")).body.p_reply,data.reply);
  }
  const notes={owner_id:task.USER,total:0,library_total:12,version:"e".repeat(32),rows:[]};
  const f=fixture({notes,reply:"You have no access to your notes."}),result=await f.run("Find notes about TAI");assert.match(result.data.reply,/12 saved notes/);assert.match(result.data.reply,/match 0 notes/);
});
test("overview pages have snapshot-bound cursors and changed libraries restart safely before model quota",async()=>{
  const row={id:NOTE,title:"Last note",version:VERSION,text:"Saved text"},overview={owner_id:task.USER,total:11,library_total:11,version:"e".repeat(32),offset:10,limit:10,next_offset:null,rows:[row]};
  const ref={type:"notes",offset:10,version:"e".repeat(32)},f=fixture({overview}),result=await f.run("Continue the overview of my notes",[ref]);assert.equal(result.status,200);assert.equal(result.data.workspace.cards[0].offset,10);
  const stale=fixture({overview:{...overview,version:"f".repeat(32)}}),changed=await stale.run("Continue the overview of my notes",[ref]);assert.equal(changed.data.code,"AI_NOTES_CHANGED");assert.equal(changed.data.retryWithNewId,true);assert.equal(stale.calls.some(call=>call.url.endsWith("/reserve_ai_chat")),false);
  const missing=await fixture({overviewStatus:404}).run("How many notes do I have?");assert.equal(missing.data.code,"AI_WORKSPACE_SETUP_REQUIRED");
});
test("existing expense SQL and task focus are reused with exact report cards and protected source identities",async()=>{
  const exp=fixture(),{data,status}=await exp.run("Explain period changes",[{type:"expenses",month:"2026-10",category:"",search:"",smallAmount:"20.00"}]);assert.equal(status,200);assert.equal(data.workspace.cards[0].type,"expense_range");assert.equal(data.workspace.cards[0].report.current.total_cents,"6000");
  const model=exp.calls.find(call=>call.url.startsWith("https://api.cloudflare.com")),facts=JSON.parse(model.body.messages.at(-1).content).verified_workspace_data[0];assert.equal(facts.verified_expense_report.current.total_myr,"60.00");
  const tasks=fixture(),result=await tasks.run("今天应该先做什么？");assert.equal(result.status,200);assert.equal(result.data.workspace.cards[0].type,"tasks");assert.equal(tasks.calls.some(call=>call.url.endsWith("/get_task_insights")),true);
});
test("the January 2026 count question queries the requested dates and returns exact SQL facts without calling the model",async()=>{
  const f=fixture({reply:"Based on your quarterly comparison of November and October, January has no expenses."}),{data,status}=await f.run("how many expenses in January 2026");assert.equal(status,200);
  const read=f.calls.find(call=>call.url.endsWith("/get_expense_range_insights"));assert.equal(read.body.p_from,"2026-01-01");assert.equal(read.body.p_to,"2026-01-31");assert.equal(read.body.p_comparison,"none");assert.equal(read.init.headers.Authorization,"Bearer user-jwt");assert.equal(read.init.headers.apikey,"public-key");
  assert.equal(data.workspace.cards[0].report.scope.date_from,"2026-01-01");assert.equal(data.workspace.cards[0].report.current.count,"0");assert.equal(data.workspace.cards[0].report.previous,null);assert.deepEqual(data.sources,[]);
  assert.match(data.reply,/2026-01-01 → 2026-01-31/);assert.doesNotMatch(data.reply,/November|October|quarterly/);assert.equal(f.calls.some(call=>call.url.startsWith("https://api.cloudflare.com")),false);
  const stored=f.calls.find(call=>call.url.endsWith("/finish_ai_chat"));assert.equal(stored.body.p_reply,data.reply);assert.equal(stored.body.p_prompt_tokens,0);
});
test("nonzero January counts cannot be replaced by a model's invented zero",async()=>{
  const ctx=range.context({from:"2026-01-01",to:"2026-01-31",action:"count"}),report=range.report(ctx,"2026-11-07",[{id:NOTE,version:VERSION,note:"January purchase",category:"Food",payment_method:"cash",date:"2026-01-15",amount_cents:"1234"}]);
  const f=fixture({rangeReport:report,reply:"No recorded expenses for January."}),{data,status}=await f.run("how many expenses in January 2026");assert.equal(status,200);assert.match(data.reply,/1 recorded expenses/);assert.match(data.reply,/RM 12.34/);assert.equal(data.sources.length,1);assert.equal(data.sources[0].date,"2026-01-15");assert.equal(f.calls.some(call=>call.url.startsWith("https://api.cloudflare.com")),false);
});
test("manual date ceilings cannot silently substitute another month; missing range SQL fails before model reservation",async()=>{
  const f=fixture(),ref={type:"expenses",from:"2026-11-01",to:"2026-11-30"};const result=await f.run("how many expenses in January 2026",[ref]);assert.equal(result.data.code,"AI_EXPENSE_SCOPE_MISMATCH");assert.equal(f.calls.some(call=>call.url.endsWith("/get_expense_range_insights")||call.url.endsWith("/reserve_ai_chat")),false);
  const missing=fixture({rangeStatus:404}),unready=await missing.run("how many expenses in January 2026");assert.equal(unready.data.code,"AI_EXPENSE_RANGE_SETUP_REQUIRED");assert.equal(missing.calls.some(call=>call.url.endsWith("/reserve_ai_chat")),false);
});
test("multi-month expense trend replies cannot invent another period or an unrequested comparison",async()=>{
  const f=fixture({reply:"Based on your quarterly comparison of November 2026 with October 2026, there are no expenses in January 2026."}),{status,data}=await f.run("Analyze the expense trend from January to March 2026");assert.equal(status,200);
  const card=data.workspace.cards[0];assert.equal(card.type,"expense_range");assert.equal(card.report.scope.date_from,"2026-01-01");assert.equal(card.report.scope.date_to,"2026-03-31");assert.equal(card.report.previous,null);assert.match(data.reply,/2026-01-01 → 2026-03-31/);assert.doesNotMatch(data.reply,/November|quarterly comparison/);
});
test("specified notes keep ownership/version checks and do not trigger library-wide searches",async()=>{
  const f=fixture(),ref={type:"note",id:NOTE,version:VERSION},result=await f.run("Summarize this note",[ref]);assert.equal(result.status,200);assert.equal(result.data.sources[0].id,NOTE);assert.equal(f.calls.some(call=>call.url.endsWith("/search_workspace_notes")),false);
  const changed=await fixture().run("Summarize",[{...ref,version:"2026-11-08T00:00:00Z"}]);assert.equal(changed.data.code,"AI_NOTE_CHANGED");
});
test("missing setup, foreign owners and changed cache fingerprints fail safely without falling back to general chat",async()=>{
  for(const [options,code] of [[{notesStatus:404},"AI_WORKSPACE_SETUP_REQUIRED"],[{notes:{owner_id:NOTE,rows:[],total:0}},"AI_WORKSPACE_DATA_INVALID"]]){
    const f=fixture(options),result=await f.run("Find TAI notes");assert.equal(result.data.code,code);assert.equal(f.calls.some(call=>call.url.endsWith("/reserve_ai_chat")),false);
  }
  const changed=await fixture({reservation:{state:"AI_REQUEST_CONFLICT",quota}}).run("Find TAI notes");assert.equal(changed.data.code,"AI_WORKSPACE_CHANGED");assert.equal(changed.data.retryWithNewId,true);
  const cached=fixture({reservation:{state:"cached",reply:"Prior answer",quota}}),result=await cached.run("Find TAI notes");assert.equal(result.data.cached,true);assert.equal(result.data.sources[0].id,NOTE);assert.equal(cached.calls.some(call=>call.url.startsWith("https://api.cloudflare.com")),false);
});
