const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {PGlite}=require("@electric-sql/pglite"),{USER:A}=require("./fixtures/task-insight.cjs");
const B="00000000-0000-4000-8000-000000000002",C="00000000-0000-4000-8000-000000000003",id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const db=new PGlite(),read=name=>fs.readFileSync(path.join(__dirname,"../database/",name),"utf8");let api;
async function asUser(user,sql,args=[]){await db.exec("BEGIN; SET LOCAL ROLE authenticated;");try{await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user]);const result=await db.query(sql,args);await db.exec("COMMIT;");return result.rows;}catch(error){await db.exec("ROLLBACK;");throw error;}}
async function report(user=A,taskId=null,asOf="2026-11-07"){return(await asUser(user,"SELECT get_task_insights($1::uuid,$2::date) AS report",[taskId,asOf]))[0].report;}
test.before(async()=>{
  api=await import("../supabase/functions/ask-planwise/task-report.mjs");
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    GRANT USAGE ON SCHEMA public,auth TO anon,authenticated;
    CREATE TABLE tasks(id uuid PRIMARY KEY,user_id uuid NOT NULL,title text NOT NULL,description text,priority text,is_completed boolean NOT NULL DEFAULT false,
      reminder_date date,reminder_time time,repeat_option text,created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE subtasks(id uuid PRIMARY KEY,task_id uuid NOT NULL REFERENCES tasks ON DELETE CASCADE,title text NOT NULL,is_completed boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now());`);
  const setup=read("fresh_setup.sql");await db.exec(setup.slice(setup.indexOf("ALTER TABLE public.tasks ENABLE"),setup.indexOf("ALTER TABLE public.expenses ENABLE")));
  await db.exec(read("migrations/20261108_tasks_assistant.sql"));
  const tasks=[
    [1,A,"Today's presentation","High",false,"2026-11-07"],[2,A,"Today's shopping","Low",false,"2026-11-07"],
    [3,A,"Earlier reminder","High",false,"2026-11-06"],[4,A,"Unscheduled important task","High",false,null],
    [5,A,"Already done","High",true,"2026-11-07"],[6,B,"Other account's private task","High",false,"2026-11-07"],
  ];
  for(const [n,user,title,priority,completed,reminder]of tasks)await db.query("INSERT INTO tasks(id,user_id,title,priority,is_completed,reminder_date,description,reminder_time,created_at) VALUES($1,$2,$3,$4,$5,$6,'Prepare a report','09:00','2026-11-01')",[id(n),user,title,priority,completed,reminder]);
  await db.query("INSERT INTO subtasks(id,task_id,title,is_completed) VALUES($1,$2,'Requirements collected',true),($3,$2,'Build the slides',false)",[id(10),id(1),id(11)]);
});
test.after(()=>db.close());
test("today's focus considers every unfinished task, ranks reminders without inventing deadlines and returns exact parent/child counts",async()=>{
  const data=await report();assert.deepEqual(data.tasks.map(row=>row.id),[id(1),id(2),id(3)]);
  assert.deepEqual(data.summary,{total:5,completed:1,incomplete:4,high_priority:3,reminders_today:2,past_reminders:1,subtasks_total:2,subtasks_completed:1});
  assert.equal(data.tasks[0].subtasks[0].is_completed,true);assert.equal(data.tasks[0].is_completed,false);
  const checked=api.validateTaskReport(data,{type:"tasks",action:"focus",taskId:null},A);assert.equal(checked.owner_id,undefined);
  assert.equal(data.tasks.some(row=>row.title.includes("Other account")),false);
});
test("selected tasks preserve existing and completed subtasks, completed parents remain completed, and foreign/empty scopes cannot fabricate work",async()=>{
  const selected=await report(A,id(1));api.validateTaskReport(selected,{type:"tasks",action:"breakdown",taskId:id(1)},A);assert.equal(selected.tasks[0].subtasks.length,2);
  const done=await report(A,id(5));assert.equal(done.tasks[0].is_completed,true);assert.equal(done.summary.incomplete,0);
  const foreign=await report(A,id(6));assert.throws(()=>api.validateTaskReport(foreign,{type:"tasks",action:"breakdown",taskId:id(6)},A),error=>error.code==="AI_TASK_UNAVAILABLE");
  const empty=await report(C);assert.equal(empty.tasks.length,0);assert.equal(empty.summary.total,0);api.validateTaskReport(empty,{type:"tasks",action:"focus",taskId:null},C);
});
test("a child edit or a non-recommended task edit/delete changes the cache fingerprint despite no updated_at column",async()=>{
  const first=await report();await asUser(A,"UPDATE subtasks SET is_completed=true WHERE id=$1",[id(11)]);const childChanged=await report();
  assert.notEqual(childChanged.data_version,first.data_version);assert.notEqual(childChanged.tasks[0].version,first.tasks[0].version);
  await asUser(A,"UPDATE tasks SET description='Changed outside the recommendation list' WHERE id=$1",[id(4)]);const changed=await report();assert.notEqual(changed.data_version,childChanged.data_version);
  await asUser(A,"DELETE FROM tasks WHERE id=$1",[id(4)]);const deleted=await report();assert.notEqual(deleted.data_version,changed.data_version);assert.equal(deleted.summary.incomplete,3);
});
test("oversized selected tasks fail before generation; focus explicitly marks omitted child/text data",async()=>{
  await db.query("INSERT INTO tasks(id,user_id,title,description,priority) VALUES($1,$2,'Large task',$3,'High')",[id(90),B,"x".repeat(8001)]);
  const selected=await report(B,id(90));assert.equal(selected.tasks[0].text_truncated,true);assert.throws(()=>api.validateTaskReport(selected,{type:"tasks",action:"breakdown",taskId:id(90)},B),error=>error.code==="AI_TASK_TOO_LONG");
  for(let n=100;n<151;n++)await db.query("INSERT INTO subtasks(id,task_id,title) VALUES($1,$2,$3)",[id(n),id(90),"Step "+n]);
  const focus=await report(B);assert.equal(focus.tasks.find(row=>row.id===id(90)).omitted_subtasks,41);api.validateTaskReport(focus,{type:"tasks",action:"focus",taskId:null},B);
  await db.query("UPDATE tasks SET description='' WHERE id=$1",[id(90)]);const tooMany=await report(B,id(90));assert.throws(()=>api.validateTaskReport(tooMany,{type:"tasks",action:"breakdown",taskId:id(90)},B),error=>error.code==="AI_TASK_TOO_LONG");
});
test("invoker RLS/ACL checks are enforced, migration reruns preserve data and the SQL is read-only",async()=>{
  const before=(await db.query("SELECT * FROM tasks ORDER BY id")).rows;await db.exec(read("migrations/20261108_tasks_assistant.sql"));assert.deepEqual((await db.query("SELECT * FROM tasks ORDER BY id")).rows,before);
  const checks=await db.exec(read("migrations/20261108_tasks_assistant_verify.sql"));assert.deepEqual(Object.values(checks[0].rows[0]),[false,true,false,true,true,true]);
  await assert.rejects(asUser("","SELECT get_task_insights()"),/Authentication required/);
  await db.exec("BEGIN; SET LOCAL ROLE anon;");await assert.rejects(db.query("SELECT get_task_insights()"),/permission denied/);await db.exec("ROLLBACK;");
  const own=await report(B);assert.equal(own.summary.total,2);
  await db.exec("BEGIN; SET LOCAL ROLE authenticated; SET TRANSACTION READ ONLY;");await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[A]);await db.query("SELECT get_task_insights()");await db.exec("COMMIT;");
});
