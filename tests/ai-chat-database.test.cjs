const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),{randomUUID}=require("node:crypto"),{PGlite}=require("@electric-sql/pglite");
const db=new PGlite(),A="00000000-0000-4000-8000-000000000001",B="00000000-0000-4000-8000-000000000002",C="00000000-0000-4000-8000-000000000003",hash="a".repeat(64);
const read=name=>fs.readFileSync(path.join(__dirname,"../database/migrations",name),"utf8");
async function asRole(role,sql,args=[]){await db.exec(`BEGIN;SET LOCAL ROLE ${role};`);try{const result=await db.query(sql,args);await db.exec("COMMIT;");return result.rows;}catch(error){await db.exec("ROLLBACK;");throw error;}}
const reserve=async(user=A,id=randomUUID(),digest=hash)=>(await asRole("service_role","SELECT public.reserve_ai_chat($1,$2,$3) AS result",[user,id,digest]))[0].result;
const finish=(user,id,status="completed",reply="Hello")=>asRole("service_role","SELECT public.finish_ai_chat($1,$2,$3,$4,10,5,100,NULL)",[user,id,status,status==="completed"?reply:null]);
test.before(async()=>{await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);INSERT INTO auth.users VALUES('${A}'),('${B}'),('${C}');GRANT USAGE ON SCHEMA public TO service_role,anon,authenticated;`);await db.exec(read("20261107_ai_chat.sql"));});
test.beforeEach(()=>db.exec("DELETE FROM ai_chat_requests;UPDATE ai_chat_settings SET enabled=true,user_daily=20,user_minute=3,global_daily=50,global_minute=10,global_concurrent=3;"));
test.after(()=>db.close());
test("AI ledger migration is rerunnable, private, and only the server can reserve/finish",async()=>{
  await db.exec("UPDATE ai_chat_settings SET user_daily=7");await db.exec(read("20261107_ai_chat.sql"));
  const checks=await db.exec(read("20261107_ai_chat_verify.sql"));assert.equal(checks[0].rows[0].user_daily,7);assert.deepEqual(Object.values(checks[1].rows[0]),[false,false,false,true,true]);
  await assert.rejects(asRole("authenticated","SELECT * FROM ai_chat_requests"),/permission denied/);
  await assert.rejects(asRole("anon","SELECT public.reserve_ai_chat($1,$2,$3)",[A,randomUUID(),hash]),/permission denied/);
  await assert.rejects(asRole("authenticated","UPDATE ai_chat_settings SET user_daily=999"),/permission denied/);
});
test("same request is charged once, hashes protect edited retries, cached answers stay scoped to the verified user",async()=>{
  const id=randomUUID(),first=await reserve(A,id);assert.equal(first.state,"new");assert.equal(first.quota.dailyRemaining,19);
  assert.equal((await reserve(A,id)).state,"AI_IN_PROGRESS");assert.equal((await reserve(A,id,"b".repeat(64))).state,"AI_REQUEST_CONFLICT");
  await finish(A,id);const cached=await reserve(A,id);assert.equal(cached.state,"cached");assert.equal(cached.reply,"Hello");assert.equal(cached.quota.dailyRemaining,19);
  const other=await reserve(B,id);assert.equal(other.state,"new");assert.equal(other.reply,undefined);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM ai_chat_requests")).rows[0].n,2);
});
test("per-user and global daily budgets stop calls; failed attempts remain counted",async()=>{
  await db.exec("UPDATE ai_chat_settings SET user_daily=2,global_daily=3");
  for(let i=0;i<2;i++){const id=randomUUID();await reserve(A,id);await finish(A,id,"failed");}
  assert.equal((await reserve()).state,"AI_USER_DAILY_LIMIT");const id=randomUUID();await reserve(B,id);await finish(B,id);
  assert.equal((await reserve(C)).state,"AI_GLOBAL_DAILY_LIMIT");assert.equal((await db.query("SELECT count(*)::int AS n FROM ai_chat_requests")).rows[0].n,3);
});
test("minute and concurrency guards do not reserve rejected requests",async()=>{
  await db.exec("UPDATE ai_chat_settings SET global_concurrent=1");const id=randomUUID();await reserve(A,id);
  assert.equal((await reserve(A)).state,"AI_BUSY");assert.equal((await reserve(B)).state,"AI_BUSY");await finish(A,id);
  await db.exec("UPDATE ai_chat_settings SET user_minute=1");assert.equal((await reserve(A)).state,"AI_RATE_LIMIT");
  assert.equal((await db.query("SELECT count(*)::int AS n FROM ai_chat_requests")).rows[0].n,1);
});
test("UTC day resets and stale requests expire; retry cache is eligible for one day with lazy cleanup",async()=>{
  const id=randomUUID();await reserve(A,id);await db.query("UPDATE ai_chat_requests SET created_at=clock_timestamp()-interval '3 minutes' WHERE request_id=$1",[id]);
  assert.equal((await reserve(A,id)).state,"AI_RETRY_NEW_REQUEST");const next=randomUUID();await reserve(A,next);await finish(A,next);
  await db.query("UPDATE ai_chat_requests SET created_at=clock_timestamp()-interval '25 hours' WHERE request_id=$1",[next]);
  assert.equal((await reserve(A,next)).state,"AI_RETRY_NEW_REQUEST");assert.equal((await db.query("SELECT reply FROM ai_chat_requests WHERE request_id=$1",[next])).rows[0].reply,null);
  const result=await reserve(B);const reset=new Date(result.quota.resetAt);assert.equal(reset.getUTCHours(),0);assert.equal(reset.getUTCMinutes(),0);
});
test("disabled mode stops new calls, malformed reservations fail, and replies cannot exceed the response bound",async()=>{
  await db.exec("UPDATE ai_chat_settings SET enabled=false");assert.equal((await reserve()).state,"AI_DISABLED");
  await assert.rejects(reserve(A,randomUUID(),"bad"),/Invalid AI request/);await db.exec("UPDATE ai_chat_settings SET enabled=true");
  const id=randomUUID();await reserve(A,id);await assert.rejects(finish(A,id,"completed","x".repeat(12001)),/Invalid AI completion/);
});
