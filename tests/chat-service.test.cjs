const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),babel=require("@babel/core");
const quota={dailyLimit:20,dailyRemaining:19},input={userId:"u1",requestId:"r1",messages:[{role:"user",content:"Hello"}]};
function load(file,globals={},imports={}){
  const filename=path.join(__dirname,"..",file),{code}=babel.transformSync(fs.readFileSync(filename,"utf8"),{filename,babelrc:false,configFile:false,presets:[["@babel/preset-env",{targets:{node:"current"}}]]}),module={exports:{}};
  vm.runInNewContext(code,{module,exports:module.exports,AbortController,setTimeout,clearTimeout,process:{env:{REACT_APP_SUPABASE_URL:"https://test.supabase.co",REACT_APP_SUPABASE_ANON_KEY:"public-key"}},require:name=>imports[name],...globals});return module.exports;
}
function client(fetchImpl,user="u1"){
  const supabase={auth:{getSession:async()=>({data:{session:{user:{id:user},access_token:"user-token"}}})}};
  return load("src/services/chatService.jsx",{fetch:fetchImpl},{"../lib/supabase":{supabase}});
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
