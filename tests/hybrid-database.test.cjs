const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite'),{vector}=require('@electric-sql/pglite-pgvector');
const db=new PGlite({extensions:{vector}}),A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002';
const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`,v=axis=>JSON.stringify(Array.from({length:1024},(_,i)=>i===axis?1:0));
const read=n=>fs.readFileSync('database/migrations/'+n,'utf8');
async function user(owner,sql,args=[]){await db.exec('BEGIN; SET LOCAL ROLE authenticated');try{await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[owner]);const r=await db.query(sql,args);await db.exec('COMMIT');return r.rows[0]?.data;}catch(e){await db.exec('ROLLBACK');throw e;}}
async function search(kind,query,terms,vec=null,filter={},owner=A,limit=8){return user(owner,'SELECT pw_hybrid_search($1,$2,$3,$4::extensions.vector,$5,$6) AS data',[kind,query,terms,vec,JSON.stringify(filter),limit]);}
async function claim(){await db.exec("UPDATE pw_search_jobs SET due_at=now()-interval '1 second'");return (await db.query('SELECT pw_search_claim(4) AS data')).rows[0].data;}
async function complete(job,axis=0){return (await db.query('SELECT pw_search_complete($1,$2,$3,$4,$5,$6) AS data',[job.source_type,job.source_id,job.generation,job.lease,job.version,JSON.stringify([{chunk_no:0,subtask_id:job.sections[1]?.subtask_id||null,start_offset:0,end_offset:40,text:job.sections.map(s=>s.text).join('\n').slice(0,1400),text_hash:'test-hash',embedding:v(axis)}])])).rows[0].data;}
test.before(async()=>{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;
 CREATE TABLE auth.users(id uuid PRIMARY KEY);INSERT INTO auth.users VALUES('${A}'),('${B}');
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 GRANT USAGE ON SCHEMA public,auth TO authenticated,anon,service_role;
 CREATE TABLE notes(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id),title text,content text,checklist jsonb DEFAULT '[]',updated_at timestamptz DEFAULT now(),created_at timestamptz DEFAULT now());
 CREATE TABLE tasks(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id),title text,description text,priority text,is_completed boolean DEFAULT false,reminder_date date,created_at timestamptz DEFAULT now());
 CREATE TABLE subtasks(id uuid PRIMARY KEY,task_id uuid REFERENCES tasks(id) ON DELETE CASCADE,title text,is_completed boolean DEFAULT false);
 CREATE TABLE tags(id uuid PRIMARY KEY,user_id uuid,name text);CREATE TABLE note_tags(user_id uuid,note_id uuid REFERENCES notes(id) ON DELETE CASCADE,tag_id uuid REFERENCES tags(id) ON DELETE CASCADE);
 CREATE TABLE expenses(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id),note text,category text,amount numeric(14,2),expense_date date,payment_method text,expense_time time,updated_at timestamptz DEFAULT now());
 ALTER TABLE notes ENABLE ROW LEVEL SECURITY;ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
 CREATE POLICY n ON notes USING(user_id=auth.uid());CREATE POLICY t ON tasks USING(user_id=auth.uid());CREATE POLICY e ON expenses USING(user_id=auth.uid());
 GRANT SELECT,UPDATE,DELETE,INSERT ON notes,tasks,expenses TO authenticated;`);
 await db.exec(read('20261108_workspace_assistant.sql'));
 await db.exec(read('20261109_hybrid_retrieval.sql'));
 await db.exec('GRANT USAGE ON SCHEMA extensions TO authenticated');
});
test.after(()=>db.close());
test('Unicode literal search covers real tags, rendered bodies/checklists and child-only task matches with root counts',async()=>{
 const rich='planwise-richtext:v1:'+JSON.stringify({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'TAI 中文课程 research'}]}]});
 await db.query("INSERT INTO notes(id,user_id,title,content,checklist) VALUES($1,$2,'Unrelated title',$3,'[{\"text\":\"准备答辩\"}]'),($4,$5,'Foreign TAI','private','[]')",[id(1),A,rich,id(2),B]);
 await db.query("INSERT INTO tags VALUES($1,$2,'知识管理')",[id(3),A]);await db.query('INSERT INTO note_tags VALUES($1,$2,$3)',[A,id(1),id(3)]);
 for(const term of ['TAI','中文课程','research','准备答辩','知识管理'])assert.equal((await search('note',term,[term])).rows[0].id,id(1));
 await db.query("INSERT INTO tasks(id,user_id,title,description,priority,reminder_date) VALUES($1,$2,'Report','', 'High','2026-11-08')",[id(4),A]);
 await db.query("INSERT INTO subtasks VALUES($1,$2,'TAI 文献 review',false)",[id(5),id(4)]);
 const child=await search('task','TAI 文献',['TAI','文献']);assert.equal(child.candidate_count,1);assert.equal(child.rows[0].id,id(4));
 assert.equal((await search('task','TAI',['TAI'],null,{status:'completed'})).candidate_count,0);
 assert.equal((await search('task','TAI',['TAI'],null,{priority:'Low'})).candidate_count,0);
 assert.equal((await search('task','TAI',['TAI'],null,{from:'2026-11-09'})).candidate_count,0);
 assert.equal((await search('task','TAI',['TAI'],null,{ids:[id(99)]})).candidate_count,0);
});
test('real pgvector cosine + keyword fusion preserves exact identifiers and returns semantic-only candidate bills',async()=>{
 await db.query("INSERT INTO expenses VALUES($1,$2,'Grab ride','Transport',12.50,'2026-01-03','cash',NULL,now()),($3,$4,'Private ride','Transport',99,'2026-01-03','cash',NULL,now())",[id(6),A,id(7),B]);
 const jobs=await claim();for(const j of jobs)await complete(j);
 assert.equal((await search('expense','getting around',['getting','around'])).candidate_count,0);
 const semantic=await search('expense','getting around',['getting','around'],v(0));assert.equal(semantic.candidate_count,1);assert.equal(semantic.rows[0].id,id(6));
 assert.equal((await search('expense','getting around',[],v(0),{from:'2026-02-01'})).candidate_count,0);
 assert.equal((await search('expense','getting around',[],v(0),{maxAmount:'10.00'})).candidate_count,0);
 assert.equal((await search('expense','getting around',[],v(0),{category:'Food'})).candidate_count,0);
 assert.equal((await search('expense','getting around',[],v(0),{paymentMethod:'credit_card'})).candidate_count,0);
 assert.equal((await search('expense','ride',['ride'],v(0),{},B)).rows[0].id,id(7));
 assert.equal(semantic.rows.some(r=>r.id===id(7)),false);
 await db.query("INSERT INTO notes(id,user_id,title,content) VALUES($1,$2,'Other semantic match','unrelated')",[id(8),A]);
 for(const j of await claim())await complete(j);
 assert.equal((await search('note','TAI',['TAI'],v(0))).rows[0].id,id(1));
});
test('autosave coalesces, unchanged content is skipped, stale jobs cannot overwrite; updates immediately invalidate vectors',async()=>{
 const before=(await db.query("SELECT generation FROM pw_search_jobs WHERE source_id=$1",[id(1)])).rows[0].generation;
 await db.query('UPDATE notes SET title=title WHERE id=$1',[id(1)]);assert.equal((await db.query('SELECT generation FROM pw_search_jobs WHERE source_id=$1',[id(1)])).rows[0].generation,before);
 await db.query("UPDATE notes SET content='new content' WHERE id=$1",[id(1)]);const old=(await claim()).find(j=>j.source_id===id(1));
 assert.equal((await search('note','synonym',[],v(0))).rows.some(r=>r.id===id(1)),false);
 await db.query("UPDATE notes SET content='newest content' WHERE id=$1",[id(1)]);assert.equal(await complete(old),false);
 const current=(await claim()).find(j=>j.source_id===id(1));assert.equal(await complete(current),true);
 await db.query('DELETE FROM notes WHERE id=$1',[id(1)]);assert.equal((await search('note','newest',['newest'],v(0))).rows.some(r=>r.id===id(1)),false);
 assert.equal((await db.query('SELECT count(*) n FROM pw_search_chunks WHERE source_id=$1',[id(1)])).rows[0].n,0);
});
test('candidate totals span more than display pages, never expose fabricated expense SUM; owner and index write rights are isolated',async()=>{
 for(let n=100;n<135;n++)await db.query("INSERT INTO expenses VALUES($1,$2,'Train ticket','Transport',3.10,'2026-01-10','cash',NULL,now())",[id(n),A]);
 const found=await search('expense','Train',['Train']);assert.equal(found.candidate_count,35);assert.equal(found.rows.length,8);assert.equal(found.total,undefined);
 const exact=(await db.query("SELECT count(*)::int n,sum(amount)::text amount FROM expenses WHERE user_id=$1 AND note='Train ticket'",[A])).rows[0];assert.deepEqual(exact,{n:35,amount:'108.50'});
 assert.equal((await search('expense','Train',['Train'],null,{},B)).candidate_count,0);
 await assert.rejects(user(A,"SELECT pw_search_claim() AS data"),/permission denied/);
 await assert.rejects(user(A,"INSERT INTO pw_search_chunks(user_id) VALUES('"+B+"')"),/permission denied/);
 await db.exec('BEGIN;SET LOCAL ROLE anon');await assert.rejects(db.query("SELECT pw_hybrid_search('note','TAI')"),/permission denied/);await db.exec('ROLLBACK');
});
test('backfill resumes safely, retry persists bounded backoff, lease recovery and daily quotas are atomic',async()=>{
 const page=(await db.query("SELECT pw_search_backfill('',2) data")).rows[0].data;assert.equal(page.processed,2);assert.equal(page.done,false);
 const next=(await db.query('SELECT pw_search_backfill($1,2) data',[page.cursor])).rows[0].data;assert.notEqual(page.cursor,next.cursor);
 const job=(await claim())[0];await db.query("SELECT pw_search_retry($1,$2,$3,$4,'embedding_rate_limited')",[job.source_type,job.source_id,job.generation,job.lease]);
 const state=(await db.query('SELECT state,last_error,due_at>now() later FROM pw_search_jobs WHERE source_id=$1',[job.source_id])).rows[0];assert.deepEqual(state,{state:'pending',last_error:'embedding_rate_limited',later:true});
 assert.equal((await db.query('SELECT pw_embedding_reserve($1,12000,false) ok',[A])).rows[0].ok,true);
 assert.equal((await db.query('SELECT pw_embedding_reserve($1,12000,false) ok',[A])).rows[0].ok,false);
 assert.equal((await db.query('SELECT pw_embedding_reserve($1,100,false) ok',[B])).rows[0].ok,true);
 await db.exec(read('20261109_hybrid_retrieval.sql')); // safe repeat without erasing projections/jobs
});
test('checkpoints resume long records, expired leases recover, and child/tag updates invalidate sources immediately',async()=>{
 await db.exec("UPDATE pw_search_jobs SET due_at=now()+interval '1 day'");
 await db.query("UPDATE tasks SET description='Long project' WHERE id=$1",[id(4)]);
 await db.query("UPDATE pw_search_jobs SET due_at=now()-interval '1 second' WHERE source_id=$1",[id(4)]);
 const job=(await db.query('SELECT pw_search_claim(1) data')).rows[0].data[0];
 const checkpoint=async(j,yieldJob)=>(await db.query('SELECT pw_search_checkpoint($1,$2,$3,$4,$5,$6,$7) ok',[j.source_type,j.source_id,j.generation,j.lease,j.version,JSON.stringify([{text_hash:'stage-hash',embedding:v(0)}]),yieldJob])).rows[0].ok;
 assert.equal(await checkpoint(job,true),true);
 const resumed=(await db.query('SELECT pw_search_claim(1) data')).rows[0].data[0];assert.equal(resumed.existing.some(r=>r.text_hash==='stage-hash'),true);
 assert.equal(await checkpoint(job,false),false); // previous lease is no longer valid
 await db.query("UPDATE pw_search_jobs SET lease_until=now()-interval '1 second' WHERE source_id=$1",[id(4)]);
 const recovered=(await db.query('SELECT pw_search_claim(1) data')).rows[0].data[0];assert.notEqual(recovered.lease,resumed.lease);assert.equal(await complete(resumed),false);assert.equal(await complete(recovered),true);
 const before=(await search('task','TAI',['TAI'],v(0))).rows.find(r=>r.id===id(4));assert.equal(before.subtask_id,id(5));
 await db.query("UPDATE subtasks SET title='Neural networks research' WHERE id=$1",[id(5)]);
 assert.equal((await search('task','TAI',['TAI'])).rows.some(r=>r.id===id(4)),false);
 assert.equal((await search('task','Neural',['Neural'])).rows[0].id,id(4));
 await db.query('DELETE FROM subtasks WHERE id=$1',[id(5)]);assert.equal((await search('task','Neural',['Neural'])).candidate_count,0);
 await db.query("INSERT INTO notes(id,user_id,title,content) VALUES($1,$2,'Tag test','body')",[id(20),A]);
 await db.query("INSERT INTO tags VALUES($1,$2,'old-tag')",[id(21),A]);await db.query('INSERT INTO note_tags VALUES($1,$2,$3)',[A,id(20),id(21)]);
 assert.equal((await search('note','old-tag',['old-tag'])).candidate_count,1);
 await db.query("UPDATE tags SET name='new-tag' WHERE id=$1",[id(21)]);assert.equal((await search('note','old-tag',['old-tag'])).candidate_count,0);assert.equal((await search('note','new-tag',['new-tag'])).candidate_count,1);
 const checks=await db.exec(read('20261109_hybrid_retrieval_verify.sql'));assert.ok(checks[0].rows.every(r=>!r.anon_can_call&&r.user_can_call===(r.proname==='pw_hybrid_search')));assert.ok(checks[1].rows.every(r=>r.rls_enabled&&!r.user_can_write&&!r.user_can_read));
 const examples=await db.exec(read('20261109_hybrid_retrieval_queries.sql').replaceAll('REPLACE_WITH_TEST_USER_UUID',A));
 const reports=examples.flatMap(r=>r.rows).filter(r=>r.pw_hybrid_search).map(r=>r.pw_hybrid_search);assert.equal(reports.length,4);assert.ok(reports.every(r=>r.owner_id===A));
});

test('SQL identifier protection agrees with JS and keeps campus transport below the more relevant lunch bill',async()=>{
 const before=(await db.query('SELECT count(*)::integer count FROM pw_search_chunks')).rows[0].count;
 await db.exec(read('20261109_hybrid_retrieval_ranking_fix.sql'));
 assert.equal((await db.query('SELECT count(*)::integer count FROM pw_search_chunks')).rows[0].count,before);
 const {isProtectedIdentifier}=await import('../supabase/functions/ask-planwise/retrieval-ranking.mjs');
 for(const [term,text] of [['TAI','TAI课程'],['tai','TAI notes'],['CS401','CS401 class'],['cs401','cs401 class'],['campus','Grab ride to campus'],['2026','Expenses in 2026'],['TAI','detail'],['TAI','preTAI'],['TAI','TAI2'],['[','[regex]'],[null,'anything']]){
  const actual=(await db.query('SELECT public.pw_search_identifier($1,$2) value',[term,text])).rows[0].value;assert.equal(actual,isProtectedIdentifier(term,text));
 }
 await db.exec("UPDATE pw_search_jobs SET due_at=now()+interval '1 day'");
 await db.query("INSERT INTO expenses VALUES($1,$2,'Grab ride to campus','Transport',12.50,'2026-01-10','cash',NULL,now()),($3,$2,'校园食堂午餐','Food',9.00,'2026-01-10','cash',NULL,now())",[id(300),A,id(301)]);
 await db.query("UPDATE pw_search_jobs SET due_at=now()-interval '1 second' WHERE source_id IN ($1,$2)",[id(300),id(301)]);
 for(const job of (await db.query('SELECT pw_search_claim(2) data')).rows[0].data){
  assert.equal(await complete(job),true);
  // Controlled vectors reproduce the two measured cosine values; this tests SQL ranking,
  // not a new provider call. Full recorded provider scores are in the JS fixture.
  const cosine=job.source_id===id(300)?.4956181147498445:.7349395740633602;
  const vector=Array.from({length:1024},(_,i)=>i===0?cosine:i===1?Math.sqrt(1-cosine*cosine):0);
  await db.query('UPDATE pw_search_chunks SET embedding=$1::extensions.vector WHERE source_id=$2',[JSON.stringify(vector),job.source_id]);
 }
 const found=await search('expense','campus 食堂 lunch expenses',['campus','食堂','lunch'],v(0),{ids:[id(300),id(301)]});
 assert.equal(found.rows[0].id,id(301));assert.equal(found.candidate_count,2);
});

test('configuration retry SQL resets only pending/failed configuration errors, preserving active leases and source versions',async()=>{
 for(const [n,state,error] of [[500,'pending','embedding_not_configured'],[501,'failed','embedding_not_configured'],[502,'working','embedding_not_configured'],[503,'pending','embedding_auth_failed']]){
  await db.query("INSERT INTO pw_search_jobs(source_type,source_id,user_id,content_hash,generation,state,due_at,lease,lease_until,attempts,last_error) VALUES('note',$1,$2,$3,7,$4,now()+interval '1 hour',$5,now()+interval '3 minutes',4,$6)",[id(n),A,'d'.repeat(32),state,state==='working'?id(999):null,error]);
 }
 const sql=fs.readFileSync('database/diagnostics/index_worker_retry_config.sql','utf8'),result=await db.exec(sql);
 assert.equal(result[0].rows[0].requeued,2);
 const rows=(await db.query('SELECT source_id,state,content_hash,generation,lease,attempts,last_error,due_at<=now() due FROM pw_search_jobs WHERE source_id IN ($1,$2,$3,$4) ORDER BY source_id',[id(500),id(501),id(502),id(503)])).rows;
 for(const row of rows){assert.equal(row.generation,7);assert.equal(row.content_hash,'d'.repeat(32));}
 for(const row of rows.slice(0,2)){assert.equal(row.state,'pending');assert.equal(row.attempts,0);assert.equal(row.due,true);assert.equal(row.last_error,'embedding_not_configured');}
 assert.equal(rows[2].state,'working');assert.equal(rows[2].lease,id(999));assert.equal(rows[2].attempts,4);assert.equal(rows[3].last_error,'embedding_auth_failed');assert.equal(rows[3].attempts,4);assert.equal(rows[3].due,false);
});
test('diagnostic request SQL uses Vault internally, trims URL and returns no credentials',async()=>{
 await db.exec(`CREATE SCHEMA vault;CREATE SCHEMA net;
 CREATE TABLE vault.decrypted_secrets(name text,decrypted_secret text);
 INSERT INTO vault.decrypted_secrets VALUES('pw_supabase_url','https://test.supabase.co/'),('pw_index_worker_secret','fixture-private-password');
 CREATE FUNCTION net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) RETURNS bigint LANGUAGE plpgsql AS $$BEGIN
 IF url<>'https://test.supabase.co/functions/v1/index-workspace?action=diagnose' OR headers->>'Authorization'<>'Bearer fixture-private-password' OR headers->>'Content-Type'<>'application/json' OR body<>'{}'::jsonb OR timeout_milliseconds<>15000 THEN RAISE EXCEPTION 'Unexpected diagnostic request'; END IF;
 RETURN 314;END $$;`);
 const result=await db.exec(fs.readFileSync('database/diagnostics/index_worker_request.sql','utf8'));assert.deepEqual(result[0].rows,[{diagnostic_request_id:314}]);assert.equal(JSON.stringify(result).includes('fixture-private-password'),false);
});

test('fair claim scheduling reaches notes/tasks during a large expense backlog and respects backoff and active leases',async()=>{
 await db.exec("UPDATE pw_search_jobs SET due_at=now()+interval '1 day',lease_until=now()+interval '3 minutes'");
 for(let n=700;n<709;n++)await db.query("INSERT INTO expenses VALUES($1,$2,'Old bill','Food',12.50,'2026-01-10','cash',NULL,now())",[id(n),A]);
 await db.query("INSERT INTO notes(id,user_id,title,content) VALUES($1,$2,'New note','Supervised learning')",[id(720),A]);
 await db.query("INSERT INTO tasks(id,user_id,title,description,priority) VALUES($1,$2,'New task','Review course','High')",[id(730),A]);
 await db.exec("UPDATE pw_search_jobs SET due_at=now()-interval '1 hour' WHERE source_type='expense' AND source_id>='10000000-0000-4000-8000-000000000700'");
 await db.query("UPDATE pw_search_jobs SET due_at=now()-interval '2 seconds' WHERE source_id=$1",[id(720)]);await db.query("UPDATE pw_search_jobs SET due_at=now()-interval '1 second' WHERE source_id=$1",[id(730)]);
 await db.exec(read('20261110_retrieval_fair_queue.sql'));
 const first=(await db.query('SELECT pw_search_claim(2) data')).rows[0].data;assert.deepEqual(first.map(j=>j.source_type),['expense','note']);
 const second=(await db.query('SELECT pw_search_claim(2) data')).rows[0].data;assert.deepEqual(second.map(j=>j.source_type),['expense','task']);assert.ok(second.every(j=>!first.some(p=>p.lease===j.lease)));
 assert.equal((await db.query('SELECT state FROM pw_search_jobs WHERE source_id=$1',[id(720)])).rows[0].state,'working');
 assert.ok(first.every(j=>j.source_id!==id(503))); // a future/backoff job is not made eligible
});

test('module coverage SQL reports authoritative business counts and current vector coverage for all three source types',async()=>{
 const result=await db.exec(fs.readFileSync('database/diagnostics/retrieval_module_coverage.sql','utf8'));const rows=result[0].rows;assert.equal(rows.length,3);
 for(const [kind,table] of [['note','notes'],['task','tasks'],['expense','expenses']]){
  const row=rows.find(r=>r.source_type===kind),expected=(await db.query('SELECT count(*) n FROM '+table)).rows[0].n;
  assert.equal(row.business_records,expected);assert.ok(row.queued_records<=expected);assert.ok(row.records_with_current_vectors<=expected);assert.ok(row.ready_current<=row.queued_records);
 }
});
