const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),babel=require("@babel/core");
const quota={dailyLimit:20,dailyRemaining:19},input={userId:"u1",requestId:"r1",messages:[{role:"user",content:"Hello"}]};

test("hybrid client validates candidate sources, versions, parent relation and selected scope",async()=>{
  const context={type:"workspace",version:1,references:[{type:"notes"}]},id="00000000-0000-4000-8000-000000000010";
  const row={id,title:"TAI",version:"a".repeat(32),snippet:"Real passage",metadata:{},chunk_no:1,subtask_id:null,start_offset:880,end_offset:1200,similarity:0.8,lexical:1};
  const card={type:"retrieval",module:"notes",kind:"note",query:"Find TAI",snapshot:"a".repeat(32),method:"hybrid",reason:null,filter:{},candidateCount:10,indexedCount:12,eligibleCount:20,exhaustive:false,rows:[row]};
  const source={type:"note",id,title:row.title,version:row.version,snippet:row.snippet,chunk_no:1,subtask_id:null,start_offset:880,end_offset:1200};
  const response={requestId:"r1",reply:"Found a passage",quota,workspace:{schema:"pw-workspace-v1",scope:context,checked:["notes"],cards:[card]},sources:[source]};
  const ok=await client(async()=>Response.json(response)).sendChat({...input,context});assert.equal(ok.sources[0].chunk_no,1);
  for(const mutate of [r=>r.sources[0].version="b".repeat(32),r=>r.sources[0].snippet="Invented",r=>r.workspace.cards[0].kind="expense",r=>r.workspace.cards[0].candidateCount=21]){const copy=structuredClone(response);mutate(copy);await assert.rejects(client(async()=>Response.json(copy)).sendChat({...input,context}),e=>e.code==="AI_WORKSPACE_DATA_INVALID");}
});

test("unified client verifies current scope, real snippets and sources, and detects legacy deployment",async()=>{
  const context={type:"workspace",version:1,references:[{type:"notes"}]},id="00000000-0000-4000-8000-000000000010",version="2026-11-07T00:00:00Z";
  const workspace={schema:"pw-workspace-v1",scope:context,checked:["notes"],cards:[{type:"notes",method:"keyword",terms:["TAI"],total:1,libraryTotal:12,matches:[{id,title:"Meeting",version,snippet:"TAI course requirements"}]}]};
  const sources=[{type:"note",id,title:"Meeting",version,snippet:"TAI course requirements"}];let sent;
  const service=client(async(_url,options)=>{sent=JSON.parse(options.body);return Response.json({requestId:"r1",reply:"Found a note",quota,workspace,sources});});
  const result=await service.sendChat({...input,context});assert.equal(result.workspace.cards[0].matches[0].snippet,"TAI course requirements");assert.equal(sent.context.type,"workspace");assert.equal(sent.sources,undefined);
  const old=client(async()=>Response.json({requestId:"r1",reply:"Legacy general answer",quota,sources:[]}));await assert.rejects(old.sendChat({...input,context}),error=>error.code==="AI_WORKSPACE_SETUP_REQUIRED");
  const forged=client(async()=>Response.json({requestId:"r1",reply:"Wrong reference",quota,workspace,sources:[{...sources[0],id:"foreign"}]}));await assert.rejects(forged.sendChat({...input,context}),error=>error.code==="AI_WORKSPACE_DATA_INVALID");
  const excluded=client(async()=>Response.json({requestId:"r1",reply:"Wrong scope",quota,workspace:{...workspace,checked:["expenses"]},sources}));await assert.rejects(excluded.sendChat({...input,context}),error=>error.code==="AI_WORKSPACE_DATA_INVALID");
});
test("note overview contracts retain global counts and snapshot-bound page coverage, rejecting inconsistent totals or cursors",async()=>{
  const id="00000000-0000-4000-8000-000000000010",version="2026-11-07T00:00:00Z",hash="e".repeat(32),context={type:"workspace",version:1,references:[{type:"notes",offset:10,version:hash}]};
  const row={id,title:"Last note",version,snippet:"Saved content"},card={type:"notes",method:"overview",terms:[],total:11,libraryTotal:11,offset:10,limit:10,nextOffset:null,version:hash,matches:[row]};
  const response=changes=>({requestId:"r1",reply:"You have 11 saved notes.",quota,workspace:{schema:"pw-workspace-v1",scope:context,checked:["notes"],cards:[{...card,...changes}]},sources:[{type:"note",...row}]});
  const result=await client(async()=>Response.json(response({}))).sendChat({...input,context});assert.equal(result.workspace.cards[0].libraryTotal,11);assert.equal(result.workspace.cards[0].matches.length,1);
  for(const changes of [{libraryTotal:1},{nextOffset:0},{offset:0},{version:"f".repeat(32)}])await assert.rejects(client(async()=>Response.json(response(changes))).sendChat({...input,context}),error=>error.code==="AI_WORKSPACE_DATA_INVALID");
  await assert.rejects(client(async()=>Response.json(response({libraryTotal:undefined}))).sendChat({...input,context}),error=>error.code==="AI_WORKSPACE_SETUP_REQUIRED");
});
test("expense range results bind exact dates and source membership to selected date bounds",async()=>{
  const range=require("./fixtures/expense-range.cjs"),ctx=range.context(),{owner_id,...report}=range.report(ctx),reference={...ctx,type:"expenses"};delete reference.action;
  const context={type:"workspace",version:1,references:[reference]},card={type:"expense_range",context:ctx,action:ctx.action,report};
  const sources=report.current.largest.map(row=>({type:"expense",id:row.id,version:row.version,title:row.note,date:row.date,amount_cents:row.amount_cents}));
  const response=change=>({requestId:"r1",reply:"Exact range",quota,workspace:{schema:"pw-workspace-v1",scope:context,checked:["expenses"],cards:[{...card,...change}]},sources});
  const valid=await client(async()=>Response.json(response({}))).sendChat({...input,context});assert.equal(valid.workspace.cards[0].report.current.total_cents,"6000");
  await assert.rejects(client(async()=>Response.json(response({report:{...report,scope:{...report.scope,date_from:"2026-11-01"}}}))).sendChat({...input,context}),error=>error.code==="AI_EXPENSE_DATA_INVALID");
  const wrong=structuredClone(response({}));wrong.sources[0].date="2026-01-01";await assert.rejects(client(async()=>Response.json(wrong)).sendChat({...input,context}),error=>error.code==="AI_WORKSPACE_DATA_INVALID");
});

test("tasks client sends only a whitelisted scope and rejects old deployment or forged source facts",async()=>{
  const fixture=require("./fixtures/task-insight.cjs"),context=fixture.context(),{owner_id,...taskReport}=fixture.report();
  const sources=taskReport.tasks.map(row=>({type:"task",id:row.id,version:row.version,title:row.title}));let sent;
  const service=client(async(_url,options)=>{sent=JSON.parse(options.body);return Response.json({requestId:"r1",reply:"Task suggestion",quota,taskReport,sources,actions:[]});});
  const result=await service.sendChat({...input,context});assert.equal(result.taskReport.tasks[0].subtasks_completed,1);assert.deepEqual(sent.context,context);assert.equal(sent.taskReport,undefined);
  const old=client(async()=>Response.json({code:"AI_INPUT_INVALID"},{status:400}));await assert.rejects(old.sendChat({...input,context}),error=>error.code==="AI_TASK_SETUP_REQUIRED");
  const missing=client(async()=>Response.json({requestId:"r1",reply:"General answer",quota,sources:[]}));await assert.rejects(missing.sendChat({...input,context}),error=>error.code==="AI_TASK_SETUP_REQUIRED");
  const forged=client(async()=>Response.json({requestId:"r1",reply:"Untrusted",quota,taskReport,sources:[{...sources[0],id:fixture.SUB}]}));await assert.rejects(forged.sendChat({...input,context}),error=>error.code==="AI_TASK_DATA_INVALID");
  await assert.rejects(service.sendChat({...input,context:{...context,user_id:"someone else"}}),error=>error.code==="AI_TASK_INPUT_INVALID");
});
function load(file,globals={},imports={}){
  const filename=path.join(__dirname,"..",file),{code}=babel.transformSync(fs.readFileSync(filename,"utf8"),{filename,babelrc:false,configFile:false,presets:[["@babel/preset-env",{targets:{node:"current"}}]]}),module={exports:{}};
  vm.runInNewContext(code,{module,exports:module.exports,AbortController,setTimeout,clearTimeout,process:{env:{REACT_APP_SUPABASE_URL:"https://test.supabase.co",REACT_APP_SUPABASE_ANON_KEY:"public-key"}},require:name=>imports[name],...globals});return module.exports;
}
function client(fetchImpl,user="u1"){
  const supabase={auth:{getSession:async()=>({data:{session:{user:{id:user},access_token:"user-token"}}})}};
  const expense=load("supabase/functions/ask-planwise/expense-report.mjs"),tasks=load("supabase/functions/ask-planwise/task-report.mjs");
  const range=load("supabase/functions/ask-planwise/expense-range.mjs",{}, {"./expense-report.mjs":expense});
  const retrieval=load("supabase/functions/ask-planwise/retrieval-report.mjs");
  const workspace=load("supabase/functions/ask-planwise/workspace-report.mjs",{}, {"./expense-report.mjs":expense,"./task-report.mjs":tasks,"./expense-range.mjs":range,"./retrieval-report.mjs":retrieval});
  return load("src/services/chatService.jsx",{fetch:fetchImpl},{"../lib/supabase":{supabase},"../../supabase/functions/ask-planwise/expense-report.mjs":expense,"../../supabase/functions/ask-planwise/task-report.mjs":tasks,"../../supabase/functions/ask-planwise/workspace-report.mjs":workspace});
}
test("chat sends only session JWT, public key and selected conversation to the Edge Function",async()=>{
  let call;const service=client(async(url,options)=>{call={url,options};return Response.json({requestId:"r1",reply:"Hello",quota});});
  const result=await service.sendChat(input);assert.equal(result.reply,"Hello");assert.equal(call.url,"https://test.supabase.co/functions/v1/ask-planwise");assert.equal(call.options.headers.Authorization,"Bearer user-token");assert.equal(call.options.headers.apikey,"public-key");
  assert.deepEqual(JSON.parse(call.options.body),{requestId:"r1",messages:input.messages});assert.ok(call.options.signal);
});
test("auth mismatch and aborted requests cannot send data; network cancellation is propagated",async()=>{
  let count=0;const service=client(async()=>{count++;return Response.json({});},"u2");await assert.rejects(service.sendChat(input),error=>error.code==="AI_AUTH_REQUIRED");assert.equal(count,0);
  const controller=new AbortController();controller.abort();await assert.rejects(service.sendChat({...input,signal:controller.signal}),error=>error.code==="AI_ABORTED");
  const waiting=client((_url,options)=>new Promise((_resolve,reject)=>options.signal.addEventListener("abort",()=>reject(Error("Aborted"))))),abort=new AbortController();
  const pending=waiting.sendChat({...input,signal:abort.signal});await new Promise(setImmediate);abort.abort();await assert.rejects(pending,error=>error.code==="AI_ABORTED");
});
test("deployment/provider errors preserve safe retry metadata and malformed success cannot be displayed",async()=>{
  const service=client(async()=>Response.json({code:"AI_PROVIDER_LIMIT",retryWithNewId:true},{status:502}));await assert.rejects(service.sendChat(input),error=>error.code==="AI_PROVIDER_LIMIT"&&error.retryWithNewId===true);
  const missing=client(async()=>new Response("Not found",{status:404}));await assert.rejects(missing.sendChat(input),error=>error.code==="AI_DEPLOY_REQUIRED");
  const wrong=client(async()=>Response.json({requestId:"another",reply:"Wrong user reply",quota}));await assert.rejects(wrong.sendChat(input),error=>error.code==="AI_INVALID_RESPONSE");
});
test("context includes only completed recent chat turns, stays bounded and never adds system or business records",()=>{
  const model=load("src/lib/chatModel.jsx"),turns=Array.from({length:10},(_,n)=>({status:"completed",question:"q"+n,answer:"a"+n}));
  const messages=JSON.parse(JSON.stringify(model.buildChatMessages([...turns,{status:"failed",question:"private failed input"}]," Now ")));assert.equal(messages.length,13);assert.equal(messages[0].content,"q4");assert.deepEqual(messages.at(-1),{role:"user",content:"Now"});assert.equal(messages.some(item=>item.role==="system"),false);
  const limited=model.buildChatMessages([{status:"completed",question:"a".repeat(2000),answer:"b".repeat(12000)}],"c".repeat(2000));assert.ok(limited.reduce((sum,item)=>sum+item.content.length,0)<=6000);
  assert.throws(()=>model.buildChatMessages([]," "));assert.throws(()=>model.buildChatMessages([],"x".repeat(2001)));
});

test("note requests whitelist context fields and require a matching backend-provided source",async()=>{
  const context={type:"note",noteId:"n1",version:"v1",action:"summarize",content:"DO NOT SEND BODY"};
  let sent;
  const service=client(async(_url,options)=>{sent=JSON.parse(options.body);return Response.json({requestId:"r1",reply:"Summary",quota,sources:[{type:"note",id:"n1",version:"v1",title:"Note"}]});});
  const result=await service.sendChat({...input,context});assert.equal(result.sources[0].title,"Note");assert.equal(sent.context.content,undefined);assert.equal(sent.context.action,"summarize");
  const legacy=client(async()=>Response.json({requestId:"r1",reply:"General answer",quota,sources:[]}));
  await assert.rejects(legacy.sendChat({...input,context}),error=>error.code==="AI_NOTE_SETUP_REQUIRED");
  const mismatch=client(async()=>Response.json({requestId:"r1",reply:"Wrong source",quota,sources:[{type:"note",id:"other",version:"v1",title:"Private"}]}));
  await assert.rejects(mismatch.sendChat({...input,context}),error=>error.code==="AI_INVALID_RESPONSE");
});

test("real chat client and Edge handler complete the selected-note contract without new SQL",async()=>{
  const {createChatHandler}=await import("../supabase/functions/ask-planwise/handler.mjs"),{webcrypto}=require("node:crypto");
  const userId="00000000-0000-4000-8000-000000000001",noteId="00000000-0000-4000-8000-000000000002",version="2026-11-07T03:00:00.123456+00:00";
  const env={SUPABASE_URL:"https://test.supabase.co",SUPABASE_ANON_KEY:"public-key",SUPABASE_SERVICE_ROLE_KEY:"server-key",CLOUDFLARE_ACCOUNT_ID:"a".repeat(32),CLOUDFLARE_API_TOKEN:"cf-key"};
  let modelBody,removed=false,reservations=0;
  const handler=createChatHandler({env:key=>env[key],cryptoImpl:webcrypto,logger:{warn(){},error(){}},fetchImpl:async(url,options)=>{
    if(url.endsWith("/auth/v1/user"))return Response.json({id:userId});
    if(new URL(url).pathname==="/rest/v1/notes")return Response.json(removed?[]:[{id:noteId,user_id:userId,title:"Meeting",content:"Prepare the slides.",checklist:[],updated_at:version}]);
    if(url.endsWith("/reserve_ai_chat")){reservations++;return Response.json({state:"new",quota});}
    if(url.endsWith("/finish_ai_chat"))return new Response(null,{status:204});
    modelBody=JSON.parse(options.body);return Response.json({result:{response:"Prepare the slides."}});
  }});
  const service=client((url,options)=>handler(new Request(url,options)),userId);
  const options={userId,requestId:require("node:crypto").randomUUID(),messages:[{role:"user",content:"What should I prepare?"}],context:{type:"note",noteId,version,action:"ask"}};
  const result=await service.sendChat(options);assert.equal(result.reply,"Prepare the slides.");assert.equal(result.sources[0].version,version);
  assert.equal(JSON.parse(modelBody.messages.at(-1).content).reference_note_data.content,"Prepare the slides.");
  removed=true;await assert.rejects(service.sendChat({...options,requestId:require("node:crypto").randomUUID()}),error=>error.code==="AI_NOTE_UNAVAILABLE");assert.equal(reservations,1);
});

test("expense client validates exact reports and source ownership links, and detects old Edge deployments",async()=>{
  const fixture=require("./fixtures/expense-insight.cjs"),context=fixture.context(),{owner_id,...report}=fixture.report();
  const sources=[...report.current.largest,...report.previous.largest].map(row=>({type:"expense",id:row.id,version:row.version,title:row.note,date:row.date,amount_cents:row.amount_cents}));
  let sent;
  const service=client(async(_url,options)=>{sent=JSON.parse(options.body);return Response.json({requestId:"r1",reply:"Review",quota,sources,report});});
  const data=await service.sendChat({...input,context});assert.equal(data.report.current.total_cents,"6000");assert.equal(sent.context.type,"expenses");assert.equal(sent.context.month,"2026-10");assert.equal(sent.messages[0].content,"Hello");
  const old=client(async()=>Response.json({code:"AI_INPUT_INVALID"},{status:400}));await assert.rejects(old.sendChat({...input,context}),error=>error.code==="AI_EXPENSE_SETUP_REQUIRED");
  const mismatch=client(async()=>Response.json({requestId:"r1",reply:"Wrong",quota,report,sources:[{...sources[0],id:"foreign"},...sources.slice(1)]}));
  await assert.rejects(mismatch.sendChat({...input,context}),error=>error.code==="AI_EXPENSE_DATA_INVALID");
  const bad={...report,current:{...report.current,total_cents:"10"}},invalid=client(async()=>Response.json({requestId:"r1",reply:"Wrong",quota,report:bad,sources}));
  await assert.rejects(invalid.sendChat({...input,context}),error=>error.code==="AI_EXPENSE_DATA_INVALID");
});
