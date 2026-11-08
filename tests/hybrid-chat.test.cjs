const test=require('node:test'),assert=require('node:assert/strict'),{webcrypto,randomUUID}=require('node:crypto');
const A='00000000-0000-4000-8000-000000000001',ID='10000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002',HASH='a'.repeat(32),NOW=Date.parse('2026-11-08T00:00:00Z');
let api,planner,embedding,retrieval,worker,protocol,filters;
test.before(async()=>{[api,planner,embedding,retrieval,worker,protocol,filters]=await Promise.all(['ask-planwise/handler.mjs','ask-planwise/workspace-context.mjs','_shared/embeddings.mjs','ask-planwise/retrieval.mjs','index-workspace/worker.mjs','ask-planwise/workspace-report.mjs','ask-planwise/retrieval-filters.mjs'].map(p=>import('../supabase/functions/'+p)));});
const vec=()=>Array.from({length:1024},(_,i)=>i?0:1),context=references=>({type:'workspace',version:1,references});
function fixture(options={}){
 const calls=[],env={PW_RETRIEVAL_ENABLED:'true',PW_EMBEDDINGS_ENABLED:'true',CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_API_TOKEN:'chat-secret',CLOUDFLARE_EMBEDDING_API_TOKEN:'embedding-secret',SUPABASE_URL:'https://test.supabase.co',SUPABASE_ANON_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'server',...options.env};let reads=0;
 const handler=api.createChatHandler({env:k=>env[k],now:()=>NOW,cryptoImpl:webcrypto,logger:{warn(){},error(){}},fetchImpl:async(url,init={})=>{
  const body=init.body&&JSON.parse(init.body);calls.push({url,init,body});
  if(url.endsWith('/auth/v1/user'))return Response.json({id:A});
  if(url.endsWith('/pw_embedding_reserve'))return Response.json(options.budget!==false);
  if(url.includes('/@cf/baai/bge-m3'))return options.embeddingStatus?Response.json({},{status:options.embeddingStatus}):Response.json({success:true,result:{data:[vec()]}});
  if(url.endsWith('/pw_hybrid_search')){
   reads++;if(options.rpcStatus)return Response.json({},{status:options.rpcStatus});
   const kind=body.p_kind,metadata=kind==='expense'?{date:'2026-01-03',amount:'12.50',category:'Transport',payment_method:'cash'}:kind==='task'?{status:'unfinished',priority:'High',reminder_date:'2026-11-08'}:{updated_at:'2026-11-08T00:00:00+00:00'};
   const rows=options.empty||options.changed&&reads>1?[]:options.rows||[{id:ID,title:kind==='expense'?'Grab ride':'TAI preparation',version:HASH,snippet:'真实的课程资料',metadata,chunk_no:0,subtask_id:null,start_offset:0,end_offset:12,similarity:body.p_vector?0.8:null,lexical:1}];
   return Response.json({owner_id:options.foreign?B:A,kind,snapshot:options.changed&&reads>1?'b'.repeat(32):HASH,eligible_count:options.eligibleCount??10,indexed_count:options.indexedCount??(options.progress&&reads===1?3:options.pending?3:10),candidate_count:options.candidateCount??rows.length,rows});
  }
  if(new URL(url).pathname==='/rest/v1/notes')return Response.json([{id:ID,user_id:A,title:'TAI preparation',updated_at:'2026-11-08T00:00:00+00:00',content:options.longNote?'x'.repeat(12001):'Complete TAI course preparation text.',checklist:[]}]);
  if(url.endsWith('/reserve_ai_chat'))return Response.json({state:options.cached?'cached':'new',reply:'Cached reply',quota:{dailyLimit:20,dailyRemaining:19}});
  if(url.endsWith('/finish_ai_chat'))return new Response(null,{status:204});
  if(url.startsWith('https://api.cloudflare.com'))return Response.json({result:{response:options.reply||'This is based on the retrieved excerpt.'}});
  throw Error('Unexpected request: '+url);
 }});
 return{calls,async run(q,refs=[]){const r=await handler(new Request('https://test.supabase.co/functions/v1/ask-planwise',{method:'POST',headers:{Authorization:'Bearer user','Content-Type':'application/json'},body:JSON.stringify({requestId:randomUUID(),messages:Array.isArray(q)?q:[{role:'user',content:q}],context:context(refs)})}));return{status:r.status,...await r.json()};}};
}
test('all three modules truly enter the chat chain with one query embedding, real citations, scope and post-answer revalidation',async()=>{
 for(const [q,kind] of [['Find my TAI notes','note'],['Find tasks related to TAI','task'],['Find expenses for getting around in January 2026','expense']]){
  const f=fixture(),r=await f.run(q);assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.workspace.cards[0].kind,kind);assert.equal(r.workspace.cards[0].method,'hybrid');assert.equal(r.sources[0].version,HASH);assert.equal(r.sources[0].snippet,'真实的课程资料');
  assert.equal(f.calls.filter(c=>c.url.includes('/@cf/baai/bge-m3')).length,1);assert.equal(f.calls.filter(c=>c.url.endsWith('/pw_hybrid_search')).length,2);
  const sourceRead=f.calls.find(c=>c.url.endsWith('/pw_hybrid_search'));assert.equal(sourceRead.init.headers.Authorization,'Bearer user');assert.equal(f.calls.find(c=>c.url.endsWith('/pw_embedding_reserve')).init.headers.apikey,'server');
  if(kind==='expense')assert.equal(sourceRead.body.p_filter.from,'2026-01-01');
  protocol.validateWorkspaceResult(r.workspace,context([]));
 }
 const f=fixture(),r=await f.run('Find my saved information related to TAI');assert.deepEqual(r.workspace.checked,['notes','tasks','expenses']);assert.equal(f.calls.filter(c=>c.url.includes('/@cf/baai/bge-m3')).length,1);
});
test('outages, invalid config and quotas explicitly degrade to live keyword; SQL failure and foreign owners never become empty results',async()=>{
 for(const [options,reason] of [[{embeddingStatus:429},'embedding_rate_limited'],[{embeddingStatus:403},'embedding_auth_failed'],[{budget:false},'embedding_budget_limit'],[{env:{PW_EMBEDDINGS_ENABLED:'false'}},'embedding_not_configured']]){
  const f=fixture(options),r=await f.run('Find my TAI notes');assert.equal(r.status,200);assert.equal(r.workspace.cards[0].method,'keyword');assert.equal(r.workspace.cards[0].reason,reason);assert.equal(f.calls.find(c=>c.url.endsWith('/pw_hybrid_search')).body.p_vector,null);
 }
 for(const [options,code] of [[{rpcStatus:404},'AI_RETRIEVAL_SETUP_REQUIRED'],[{rpcStatus:500},'AI_RETRIEVAL_LOAD_FAILED'],[{foreign:true},'AI_RETRIEVAL_DATA_INVALID']]){const r=await fixture(options).run('Find my TAI notes');assert.equal(r.code,code);assert.notEqual(r.status,200);}
 const changed=await fixture({changed:true}).run('Find my TAI notes');assert.equal(changed.code,'AI_WORKSPACE_CHANGED');assert.equal(changed.retryWithNewId,true);
 const progress=await fixture({progress:true}).run('Find my TAI notes');assert.equal(progress.status,200);assert.equal(progress.workspace.cards[0].indexedCount,3); // background catch-up alone cannot invalidate sources
 const empty=await fixture({empty:true,pending:true}).run('Find my TAI notes');assert.equal(empty.workspace.cards[0].eligibleCount,10);assert.equal(empty.workspace.cards[0].candidateCount,0);assert.equal(empty.workspace.cards[0].indexedCount,3);
 const inventedEmpty=await fixture({empty:true,reply:'You have no notes.'}).run('Find my TAI notes');assert.match(inventedEmpty.reply,/10 records/);assert.doesNotMatch(inventedEmpty.reply,/You have no notes/);
});
test('summaries read bounded full note originals after retrieval and explicitly retain excerpt-only limits for long notes',async()=>{
 for(const longNote of [false,true]){
  const f=fixture({longNote}),r=await f.run('Summarize notes about TAI');assert.equal(r.status,200);
  const model=f.calls.find(c=>c.url.includes('/@cf/zai-org/')),facts=JSON.parse(model.body.messages.at(-1).content).verified_workspace_data;
  const originals=facts.find(f=>f.type==='retrieved_note_originals');assert.equal(originals.records[0].coverage,longNote?'excerpt_only':'complete');
  if(!longNote)assert.match(originals.records[0].data.content,/Complete TAI/);
 }
});
test('scope ceilings, reminder filters, exact fields and ordinary chat are preserved',async()=>{
 const plan=(q,refs=[])=>planner.workspacePlan(context(refs),[{role:'user',content:q}],NOW,true);
 assert.equal(plan('What is vector search?').length,0);
 assert.equal(plan('今天应该先做什么？')[0].type,'tasks');
 assert.equal(plan('How many expenses in January 2026?')[0].type,'expense_range');
 assert.equal(plan('how many notes do I have?')[0].method,'count');
 assert.equal(plan('how many tasks do I have?')[0].type,'task_query');
 assert.equal(plan('List all tasks')[0].type,'task_query');
 assert.equal(plan('how many tasks do I have about TAI?')[0].kind,'task');
 assert.equal(plan('How much did I spend on Netflix?')[0].kind,'expense');
 assert.equal(plan('how many expenses in January 2026 category Transport')[0].type,'expense_range');
 assert.equal(plan('how many expenses in January 2026 category Transport')[0].context.category,'Transport');
 const selected={...protocol.defaultTasks(),status:'unfinished',priority:'High',from:'2026-11-01',to:'2026-11-30'};
 const task=plan('Find tasks about TAI on November 8 2026',[selected])[0];assert.equal(task.filter.from,'2026-11-08');assert.equal(task.filter.priority,'High');
 assert.throws(()=>plan('Find tasks about TAI in October 2026',[selected]),e=>e.code==='AI_SCOPE_INVALID');
 const filtered=filters.expenseRetrievalFilter({category:'Transport',from:'2026-01-01'},'Find similar expenses category Transport cash under RM 20');assert.equal(filtered.paymentMethod,'cash');assert.equal(filtered.maxAmount,'19.99');
 assert.equal(filters.expenseRetrievalFilter({},'不超过 RM 20').minAmount,undefined);assert.equal(filters.expenseRetrievalFilter({},'不超过 RM 20').maxAmount,'20.00');assert.equal(filters.expenseRetrievalFilter({},'over RM 20').minAmount,'20.01');
 assert.throws(()=>filters.expenseRetrievalFilter({},'under RM 20.001'),e=>e.code==='AI_SCOPE_INVALID');
 assert.throws(()=>filters.expenseRetrievalFilter({category:'Food'},'category Transport'),e=>e.code==='AI_SCOPE_INVALID');
 const f=fixture(),r=await f.run('Find my saved information related to TAI',[{type:'notes'}]);assert.deepEqual(r.workspace.checked,['notes']);
 const normal=await fixture().run('Hello');assert.deepEqual(normal.workspace.checked,[]);
});
test('Unicode terms and source validation preserve exact TAI IDs, CJK and mixed scripts; candidate totals cannot become exhaustive totals',async()=>{
 for(const q of ['Find TAI notes','查找关于知识管理的笔记','TAI 课程 research']){const terms=retrieval.retrievalTerms(q);assert.ok(terms.length);assert.ok(terms.some(t=>q.includes(t)));}
 assert.ok(retrieval.retrievalTerms('TAI 课程 research').includes('TAI'));
 const r=await fixture({reply:'The total spending was RM 12.50.'}).run('Find expenses for getting around');assert.match(r.reply,/not an exhaustive/);assert.equal(r.workspace.cards[0].exhaustive,false);
 const count=await fixture().run('how many tasks do I have about TAI?');assert.match(count.reply,/potentially related parent tasks/);
 const total=await fixture().run('How much did I spend on Netflix?');assert.match(total.reply,/not an exhaustive business scope/);
 const bad=structuredClone(r.workspace);bad.cards[0].rows[0].id='foreign';assert.throws(()=>protocol.validateWorkspaceResult(bad,context([])));
 const narrowed=structuredClone(r.workspace);narrowed.scope=context([{...protocol.defaultExpenses(),category:'Food'}]);assert.throws(()=>protocol.validateWorkspaceResult(narrowed,narrowed.scope));
});
test('chunking preserves original codepoint offsets, child identity, overlap and deterministic hashes',async()=>{
 const original='📝中文 TAI '+('长段落 notes\n'.repeat(260)),sections=[{text:original},{subtask_id:ID,text:'Prepare the presentation'}];
 const chunks=await embedding.chunkSections(sections,webcrypto);assert.ok(chunks.length>3);assert.equal(chunks.at(-1).subtask_id,ID);
 for(const c of chunks){assert.equal(c.text,embedding.normalizeText(Array.from(sections[c.section].text).slice(c.start_offset,c.end_offset).join('')));assert.ok(Array.from(c.text).length<=1000);assert.equal(c.text_hash,await embedding.hashText(c.text,webcrypto));}
 const invalid=async()=>embedding.embedTexts(['TAI'],{env:k=>({PW_EMBEDDINGS_ENABLED:'true',CLOUDFLARE_ACCOUNT_ID:'a',CLOUDFLARE_EMBEDDING_API_TOKEN:'secret'}[k]),reserve:async()=>true,fetchImpl:async()=>Response.json({result:{data:[[1,2]]}})});await assert.rejects(invalid(),e=>e.code==='embedding_invalid_dimensions');
});
test('worker requires server-only secret, reuses text hashes and checkpoints failures for safe retry',async()=>{
 const text='TAI project',hash=await embedding.hashText(text,webcrypto),calls=[];
 const env=k=>({PW_INDEX_WORKER_SECRET:'worker-secret',SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server'}[k]);
 const make=existing=>worker.createIndexHandler({env,cryptoImpl:webcrypto,fetchImpl:async(url,init)=>{const body=JSON.parse(init.body);calls.push({url,body});if(url.endsWith('/pw_search_claim'))return Response.json([{source_type:'task',source_id:ID,user_id:A,generation:1,lease:ID,version:HASH,sections:[{text}],existing}]);if(url.endsWith('/pw_search_complete'))return Response.json(true);if(url.endsWith('/pw_search_retry'))return Response.json(null);throw Error(url);}});
 assert.equal((await make([])(new Request('https://test',{method:'POST'}))).status,401);
 const req=()=>new Request('https://test',{method:'POST',headers:{Authorization:'Bearer worker-secret'}});
 const r=await make([{text_hash:hash,embedding:JSON.stringify(vec())}])(req());assert.equal((await r.json()).results[0].state,'ready');assert.equal(calls.some(c=>c.url.endsWith('/pw_embedding_reserve')),false);
 const failed=await make([])(req());assert.equal((await failed.json()).results[0].code,'embedding_not_configured');assert.ok(calls.some(c=>c.url.endsWith('/pw_search_retry')));
});
test('worker resumes a long source after provider failure without regenerating successfully checkpointed batches',async()=>{
 const stage=new Map(),seen=new Set();let providerCalls=0,completed=null;
 const env=k=>({PW_INDEX_WORKER_SECRET:'worker',PW_EMBEDDINGS_ENABLED:'true',CLOUDFLARE_ACCOUNT_ID:'a',CLOUDFLARE_EMBEDDING_API_TOKEN:'embed',SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server'}[k]);
 const handler=worker.createIndexHandler({env,cryptoImpl:webcrypto,fetchImpl:async(url,init)=>{
  const body=JSON.parse(init.body);
  if(url.endsWith('/pw_search_claim'))return Response.json([{source_type:'note',source_id:ID,user_id:A,generation:1,lease:ID,version:HASH,sections:[{text:Array.from({length:3000},(_,i)=>`line ${i} course material\n`).join('')}],existing:[...stage].map(([text_hash,embedding])=>({text_hash,embedding}))}]);
  if(url.endsWith('/pw_embedding_reserve'))return Response.json(true);
  if(url.includes('/@cf/baai/bge-m3')){providerCalls++;if(providerCalls===2)return Response.json({},{status:429});for(const text of body.text){assert.equal(seen.has(text),false);seen.add(text);}return Response.json({result:{data:body.text.map(vec)}});}
  if(url.endsWith('/pw_search_checkpoint')){for(const row of body.p_vectors)stage.set(row.text_hash,row.embedding);return Response.json(true);}
  if(url.endsWith('/pw_search_retry'))return Response.json(null);
  if(url.endsWith('/pw_search_complete')){completed=body.p_chunks;return Response.json(true);}
  throw Error(url);
 }});
 const invoke=async()=>{const r=await handler(new Request('https://test',{method:'POST',headers:{Authorization:'Bearer worker'}}));return(await r.json()).results[0].state;};
 assert.equal(await invoke(),'retry');assert.equal(stage.size,8);
 for(let attempt=0;attempt<12&&!completed;attempt++)await invoke();
 assert.ok(completed&&completed.length>16);assert.equal(completed.length,seen.size);assert.ok(completed.every(c=>embedding.validVector(JSON.parse(c.embedding))));
});

test('topic follow-ups inherit queried modules through multiple turns, replace topics and respect explicit references',async()=>{
 const messages=[{role:'user',content:'帮我找一下关于 Artificial Intelligence 的 note'},{role:'assistant',content:'Old answer: no matches'},{role:'user',content:'machine learning 的话呢？'}];
 const f=fixture(),r=await f.run(messages);assert.equal(r.status,200);assert.deepEqual(r.workspace.checked,['notes']);
 const read=f.calls.find(c=>c.url.endsWith('/pw_hybrid_search'));assert.equal(read.body.p_kind,'note');assert.equal(read.body.p_query,'machine learning');assert.deepEqual(read.body.p_terms,['machine','learning']);assert.ok(!read.body.p_terms.includes('Artificial'));
 const next=[...messages,{role:'assistant',content:'New note match'},{role:'user',content:'What about deep learning?'}];assert.equal(planner.workspacePlan(context([]),next,NOW,true)[0].kind,'note');
 const task=[{role:'user',content:'Find tasks about a presentation'},{role:'assistant',content:'Prior tasks'},{role:'user',content:'research的话呢？'}];assert.equal(planner.workspacePlan(context([]),task,NOW,true)[0].kind,'task');
 const both=[{role:'user',content:'Find notes and tasks about TAI'},{role:'assistant',content:'Prior sources'},{role:'user',content:'machine learning 的话呢？'}];assert.deepEqual(planner.workspacePlan(context([]),both,NOW,true).map(p=>p.kind),['note','task']);
 const switched=await fixture().run(messages,[protocol.defaultTasks()]);assert.deepEqual(switched.workspace.checked,['tasks']);
 const general=[{role:'user',content:'What is Artificial Intelligence?'},{role:'assistant',content:'A general definition'},{role:'user',content:'machine learning 的话呢？'}];assert.equal(planner.workspacePlan(context([]),general,NOW,true).length,0);
});
test('zero indexed notes produce a factual coverage answer without asking for exact keywords or calling the chat model',async()=>{
 const f=fixture({empty:true,eligibleCount:3,indexedCount:0,reply:'关键词必须完全一致，检查拼写。'}),r=await f.run('帮我找一下关于 Artificial Intelligence 的 note');
 assert.equal(r.status,200);assert.match(r.reply,/0\/3/);assert.match(r.reply,/尚无有效语义索引/);assert.doesNotMatch(r.reply,/检查拼写|关键词必须完全一致/);assert.equal(f.calls.some(c=>c.url.includes('/@cf/zai-org/')),false);
 const noRead=await fixture({reply:'根据您提供的查询结果，您的笔记库目前共有3条笔记，没有匹配。'}).run('Hello');assert.match(noRead.reply,/No application records were checked/);assert.deepEqual(noRead.workspace.checked,[]);
});
test('expense candidate lists preserve all eight source records, exact amounts, actual range and date ordering',async()=>{
 const dates=['2026-09-12','2026-09-10','2026-09-16','2026-08-28','2026-08-16','2026-07-04','2026-06-04','2026-11-04'];
 const rows=dates.map((date,i)=>({id:`10000000-0000-4000-8000-${String(100+i).padStart(12,'0')}`,title:'Bill '+i,version:HASH,snippet:'Saved meal '+i,metadata:{date,amount:(12+i)+'.50',category:'Food',payment_method:i?'debit_card':null,expense_time:i?'19:20:00':null},chunk_no:0,subtask_id:null,start_offset:0,end_offset:12,similarity:.8,lexical:1}));
 const f=fixture({rows,candidateCount:94,eligibleCount:258,indexedCount:140,reply:'Only June to August, total RM 100.'}),r=await f.run('帮我列出我吃饭的开销');
 assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.sources.length,8);assert.match(r.reply,/94 条/);assert.match(r.reply,/140\/258/);assert.match(r.reply,/日期条件：未限定日期/);assert.match(r.reply,/分类条件：未指定分类/);assert.ok(r.reply.indexOf('2026-11-04')<r.reply.indexOf('2026-09-16'));
 for(let i=0;i<8;i++){assert.equal(r.reply.split('Bill '+i).length-1,1);assert.ok(r.reply.includes('RM '+rows[i].metadata.amount));}
 assert.match(r.reply,/付款方式未记录/);assert.equal(f.calls.some(c=>c.url.includes('/@cf/zai-org/')),false);
});
