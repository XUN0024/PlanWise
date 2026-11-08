const test=require('node:test'),assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
let api;
test.before(async()=>{api=await import('../supabase/functions/index-workspace/worker.mjs');});
const BASE={PW_INDEX_WORKER_SECRET:'private-worker-password',PW_EMBEDDINGS_ENABLED:'true',CLOUDFLARE_ACCOUNT_ID:'private-account-id',CLOUDFLARE_EMBEDDING_API_TOKEN:'private-embedding-token',SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'private-server-key'};
const req=(authorization='Bearer '+BASE.PW_INDEX_WORKER_SECRET,action='diagnose',method='POST')=>new Request('https://test.supabase.co/functions/v1/index-workspace'+(action?'?action='+action:''),{method,headers:{Authorization:authorization}});
test('runtime diagnostics require worker authentication before inspecting configuration',async()=>{
 const read=[],handler=api.createIndexHandler({env:name=>{read.push(name);return BASE[name];},fetchImpl:()=>{throw Error('No network allowed');}});
 for(const token of ['Bearer user-jwt','Bearer wrong','']){const response=await handler(req(token));assert.equal(response.status,401);assert.deepEqual(await response.json(),{code:'UNAUTHORIZED'});}
 assert.ok(read.every(name=>name==='PW_INDEX_WORKER_SECRET'));
 assert.equal((await handler(req(undefined,'diagnose','GET'))).status,405);
});
test('diagnostics expose only version and booleans, without claiming jobs, calling a model or reserving budget',async()=>{
 const handler=api.createIndexHandler({env:name=>BASE[name],fetchImpl:()=>{throw Error('Diagnostic must not make network calls');}});
 const response=await handler(req()),body=await response.json();
 assert.deepEqual(body,{workerVersion:api.INDEX_WORKER_VERSION,projectRef:null,embedding:{enabled:true,accountIdPresent:true,tokenPresent:true,configured:true},database:{urlPresent:true,serverKeyPresent:true}});
 for(const secret of [BASE.PW_INDEX_WORKER_SECRET,BASE.CLOUDFLARE_ACCOUNT_ID,BASE.CLOUDFLARE_EMBEDDING_API_TOKEN,BASE.SUPABASE_SERVICE_ROLE_KEY,BASE.SUPABASE_URL])assert.equal(JSON.stringify(body).includes(secret),false);
});
test('diagnostics identify each runtime gate without silently enabling a false or malformed switch',async()=>{
 for(const [override,field] of [[{PW_EMBEDDINGS_ENABLED:'false'},'enabled'],[{PW_EMBEDDINGS_ENABLED:'"true"'},'enabled'],[{PW_EMBEDDINGS_ENABLED:' true '},'enabled'],[{CLOUDFLARE_ACCOUNT_ID:undefined},'accountIdPresent'],[{CLOUDFLARE_EMBEDDING_API_TOKEN:undefined},'tokenPresent'],[{CLOUDFLARE_EMBEDDING_API_TOKEN:'   '},'tokenPresent']]){
  const values={...BASE,...override},handler=api.createIndexHandler({env:name=>values[name],fetchImpl:()=>{throw Error('No network allowed');}});
  const body=await(await handler(req())).json();assert.equal(body.embedding[field],false);assert.equal(body.embedding.configured,false);
 }
 const handler=api.createIndexHandler({env:name=>({...BASE,SUPABASE_SERVICE_ROLE_KEY:undefined}[name])});
 assert.equal((await(await handler(req())).json()).database.serverKeyPresent,false);
 assert.equal((await handler(req(undefined,'unknown'))).status,400);
 const deployed=api.createIndexHandler({env:name=>({...BASE,SUPABASE_URL:'https://lfvlxzjspvfxbnkdunay.supabase.co'}[name])});
 assert.equal((await(await deployed(req())).json()).projectRef,'lfvlxzjspvfxbnkdunay');
});
test('normal cron processing retains safe retries and adds redacted configuration when embedding is not configured',async()=>{
 const calls=[],id='10000000-0000-4000-8000-000000000001',values={...BASE,PW_EMBEDDINGS_ENABLED:'false'};
 const handler=api.createIndexHandler({env:name=>values[name],cryptoImpl:webcrypto,fetchImpl:async(url,init)=>{
  calls.push({url,body:JSON.parse(init.body)});
  if(url.endsWith('/pw_search_claim'))return Response.json([{source_type:'note',source_id:id,user_id:id,generation:1,lease:id,version:'a'.repeat(32),sections:[{text:'Note text'}],existing:[]}]);
  if(url.endsWith('/pw_search_retry'))return Response.json(null);
  throw Error('Unexpected request '+url);
 }});
 const response=await handler(req(undefined,'')),body=await response.json();assert.equal(response.status,200);assert.equal(body.workerVersion,api.INDEX_WORKER_VERSION);
 assert.equal(body.results[0].code,'embedding_not_configured');assert.equal(body.results[0].configuration.enabled,false);assert.equal(body.results[0].configuration.accountIdPresent,true);
 assert.equal(calls.length,2);assert.equal(calls[1].body.p_error,'embedding_not_configured');
 for(const secret of [BASE.CLOUDFLARE_ACCOUNT_ID,BASE.CLOUDFLARE_EMBEDDING_API_TOKEN,BASE.PW_INDEX_WORKER_SECRET,BASE.SUPABASE_SERVICE_ROLE_KEY])assert.equal(JSON.stringify(body).includes(secret),false);
});
