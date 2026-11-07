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
