const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),{PGlite}=require("@electric-sql/pglite");
const {USER:A,TASK}=require("./fixtures/task-insight.cjs"),B="00000000-0000-4000-8000-000000000002",id=n=>`20000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const db=new PGlite(),read=name=>fs.readFileSync(path.join(__dirname,"../database/migrations",name),"utf8");let api,planner;
const ctx=references=>({type:"workspace",version:1,references});
async function own(user,sql,args=[]){await db.exec("BEGIN;SET LOCAL ROLE authenticated;");try{await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user]);const data=await db.query(sql,args);await db.exec("COMMIT;");return data.rows;}catch(error){await db.exec("ROLLBACK;");throw error;}}
test.before(async()=>{
  api=await import("../supabase/functions/ask-planwise/workspace-report.mjs");planner=await import("../supabase/functions/ask-planwise/workspace-context.mjs");
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    GRANT USAGE ON SCHEMA public,auth TO anon,authenticated;
    CREATE TABLE notes(id uuid PRIMARY KEY,user_id uuid,title text,content text,checklist jsonb DEFAULT '[]',updated_at timestamptz DEFAULT now(),created_at timestamptz DEFAULT now());
    CREATE TABLE tasks(id uuid PRIMARY KEY,user_id uuid,title text,description text,priority text,is_completed boolean,reminder_date date,created_at timestamptz DEFAULT now());
    CREATE TABLE subtasks(id uuid PRIMARY KEY,task_id uuid REFERENCES tasks(id),title text,is_completed boolean);
    ALTER TABLE notes ENABLE ROW LEVEL SECURITY;ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;ALTER TABLE subtasks ENABLE ROW LEVEL SECURITY;
    GRANT SELECT ON notes,tasks,subtasks TO authenticated;
    CREATE POLICY note_own ON notes USING(user_id=auth.uid());CREATE POLICY task_own ON tasks USING(user_id=auth.uid());
    CREATE POLICY sub_own ON subtasks USING(EXISTS(SELECT 1 FROM tasks t WHERE t.id=task_id AND t.user_id=auth.uid()));`);
  await db.exec(read("20261108_workspace_assistant.sql"));
  await db.exec(read("20261108_notes_overview.sql"));
});
test.after(()=>db.close());
test("reference protocol is bounded, rejects IDs/SQL/local paths and keeps multi-reference scope deterministic",()=>{
  const notes={type:"notes"},tasks=api.defaultTasks();assert.equal(api.workspaceKey(ctx([notes,tasks])),api.workspaceKey(ctx([tasks,notes])));
  for(const refs of [[null],[{type:"folder",path:"C:/secret"}],[{...tasks,user_id:B}],[notes,notes],[notes,{type:"note",id:TASK,version:"2026-11-08T00:00:00Z"}],[{...tasks,from:"2026-11-02",to:"2026-11-01"}]])assert.throws(()=>api.validateWorkspaceContext(ctx(refs)),error=>error.code==="AI_SCOPE_INVALID");
});
test("auto intent routes only relevant sources, follows same-scope questions and respects explicit exclusions",()=>{
  const now=Date.parse("2026-11-08T12:00:00Z"),messages=question=>[{role:"user",content:question}],plan=q=>planner.workspacePlan(ctx([]),messages(q),now);
  assert.deepEqual(plan("我以前写过关于 TAI 的笔记，帮我找一下").map(row=>row.type),["notes"]);assert.deepEqual(planner.noteTerms("我以前写过关于 TAI 的笔记，帮我找一下"),["TAI"]);
  assert.equal(plan("今天应该先做什么？")[0].type,"tasks");assert.equal(plan("What should I focus on today?")[0].type,"tasks");
  assert.equal(plan("分析本月消费")[0].context.from,"2026-11-01");assert.equal(plan("看看上个月支出")[0].context.from,"2026-10-01");assert.equal(plan("2026年9月支出比上月多在哪里")[0].context.from,"2026-09-01");
  assert.equal(plan("你好").length,0);assert.equal(plan("什么是笔记").length,0);
  const restricted=planner.workspacePlan(ctx([{type:"notes"}]),messages("分析本月消费"),now);assert.deepEqual(restricted.map(row=>row.type),["notes"]);
  const follow=planner.workspacePlan(ctx([]),[{role:"user",content:"分析本月消费"},{role:"assistant",content:"Earlier answer"},{role:"user",content:"那上个月呢"}],now);assert.equal(follow[0].type,"expense_range");
});
test("note counts and overviews are database intents rather than question-word keyword searches in automatic and explicit scopes",()=>{
  const now=Date.parse("2026-11-08T12:00:00Z");
  for(const refs of [[],[{type:"notes"}]])for(const question of ["how many notes do I have and what is each of them about?","How many notes do I have and what is each one about?","我有多少篇笔记，每篇主要讲什么？","List all of my notes","What is each of my notes about?"]){
    const [step]=planner.workspacePlan(ctx(refs),[{role:"user",content:question}],now);assert.equal(step.type,"notes");assert.equal(step.method,"overview",question);assert.deepEqual(step.terms,[]);
  }
  for(const q of ["How many notes do I have?","我的笔记一共有多少篇？"])assert.equal(planner.noteQuery(q).method,"count",q);
  for(const q of ["How many notes do I have about TAI?","What is my TAI note about?","Summarize all notes about TAI","关于 TAI 的笔记有几篇？"]){assert.equal(planner.noteQuery(q).method,"keyword",q);assert.deepEqual(planner.noteQuery(q).terms,["TAI"],q);}
});
test("keyword retrieval searches rendered rich text and checklist, finds old notes beyond recent pages and returns real snippets",async()=>{
  const content="planwise-richtext:v1:"+JSON.stringify({type:"doc",content:[{type:"paragraph",content:[{type:"text",text:"T"},{type:"text",text:"AI",marks:[{type:"bold"}]}]},{type:"paragraph",content:[{type:"text",text:"课程需要准备汇报"}]}]});
  await db.query("INSERT INTO notes(id,user_id,title,content,updated_at) VALUES($1,$2,'Old class notes',$3,'2020-01-01'),($4,$5,'Other account',$6,now())",[id(1),A,content,id(2),B,"TAI private"]);
  for(let n=3;n<15;n++)await db.query("INSERT INTO notes(id,user_id,title,content) VALUES($1,$2,'Recent unrelated','No matching material')",[id(n),A]);
  const [{data}]=await own(A,"SELECT search_workspace_notes(ARRAY['TAI']) AS data");assert.equal(data.total,1);assert.equal(data.rows[0].id,id(1));assert.match(data.rows[0].text,/TAI/);assert.equal(data.rows.some(row=>row.id===id(2)),false);
  const [{data:recent}]=await own(A,"SELECT search_workspace_notes() AS data");assert.equal(recent.rows.length,5);assert.equal(recent.total,13);
  const [{text}]=(await db.query("SELECT pw_note_plain_text($1) AS text",[content])).rows;assert.equal(text.trim(),"TAI\n课程需要准备汇报");
  await db.query("INSERT INTO notes(id,user_id,title,content,checklist) VALUES($1,$2,'Checklist only','',$3)",[id(16),A,JSON.stringify([{text:"TAI exercise",done:false}])]);
  assert.equal((await own(A,"SELECT search_workspace_notes(ARRAY['TAI']) AS data"))[0].data.total,2);
});
test("filtered tasks count every match, honor reminder/status/priority conditions and bind child edits to versions",async()=>{
  for(let n=100;n<135;n++)await db.query("INSERT INTO tasks(id,user_id,title,description,priority,is_completed,reminder_date) VALUES($1,$2,$3,'Presentation','High',false,'2026-11-08')",[id(n),A,"Task "+n]);
  await db.query("INSERT INTO tasks(id,user_id,title,priority,is_completed) VALUES($1,$2,'Private task','High',false),($3,$4,'Done','Low',true)",[id(140),B,id(141),A]);
  const query="SELECT query_workspace_tasks('unfinished','High','','2026-11-08','2026-11-08') AS data";
  const before=(await own(A,query))[0].data;assert.equal(before.total,35);assert.equal(before.rows.length,30);assert.ok(before.rows.every(row=>!row.is_completed&&row.priority==="High"));
  await db.query("INSERT INTO subtasks VALUES($1,$2,'Child',false)",[id(150),id(100)]);const after=(await own(A,query))[0].data;assert.notEqual(before.version,after.version);
  assert.equal((await own(B,"SELECT query_workspace_tasks() AS data"))[0].data.total,1);
});
test("note library counts are exact across pages and zero keyword matches do not imply an empty or unauthorized library",async()=>{
  const fetchPage=async(user,offset,limit=10)=>(await own(user,"SELECT get_workspace_note_overview($1,$2) AS data",[offset,limit]))[0].data;
  const first=await fetchPage(A,0),second=await fetchPage(A,10),count=await fetchPage(A,0,0);
  assert.equal(first.library_total,14);assert.equal(first.total,14);assert.equal(first.rows.length,10);assert.equal(first.next_offset,10);
  assert.equal(second.rows.length,4);assert.equal(second.next_offset,null);assert.equal(second.version,first.version);
  assert.equal(new Set([...first.rows,...second.rows].map(row=>row.id)).size,14);assert.equal(count.rows.length,0);assert.equal(count.total,14);assert.equal(count.next_offset,null);
  const miss=(await own(A,"SELECT search_workspace_notes(ARRAY['there-is-no-such-topic']) AS data"))[0].data;assert.equal(miss.total,0);assert.equal(miss.library_total,14);
  assert.equal((await fetchPage(B,0)).total,1);const empty=await fetchPage("00000000-0000-4000-8000-000000000099",0);assert.equal(empty.total,0);assert.equal(empty.rows.length,0);
  const makeCard=data=>({type:"notes",method:"overview",terms:[],libraryTotal:data.library_total,total:data.total,offset:data.offset,limit:data.limit,nextOffset:data.next_offset,version:data.version,
    matches:data.rows.map(row=>({id:row.id,title:row.title,version:row.version,snippet:row.text}))});
  const scope=ctx([{type:"notes",offset:10,version:first.version}]);api.validateWorkspaceResult({schema:"pw-workspace-v1",scope,checked:["notes"],cards:[makeCard(second)]},scope);
  assert.throws(()=>api.validateWorkspaceResult({schema:"pw-workspace-v1",scope,checked:["notes"],cards:[{...makeCard(second),libraryTotal:4}]},scope),/AI_WORKSPACE_DATA_INVALID/);
  const before=first.version;await db.query("UPDATE notes SET content='Changed excerpt outside the first page' WHERE id=$1",[id(1)]);assert.notEqual((await fetchPage(A,0)).version,before);
  const checks=await db.exec(read("20261108_notes_overview_verify.sql"));for(const row of checks[0].rows)assert.deepEqual([row.anon_can_call,row.user_can_call,row.uses_definer_privileges,row.is_read_only],[false,true,false,true]);assert.equal(checks[1].rows[0].notes_rls_enabled,true);
  await db.exec(read("20261108_notes_overview.sql"));assert.equal((await fetchPage(A,0)).total,14);
  await db.exec("BEGIN;SET LOCAL ROLE anon;");await assert.rejects(db.query("SELECT get_workspace_note_overview()"),/permission denied/);await db.exec("ROLLBACK;");
});
test("workspace RPCs are invoker-only and repeat safely, while result envelopes cannot widen reference scope",async()=>{
  const checks=await db.exec(read("20261108_workspace_assistant_verify.sql"));for(const row of checks[0].rows)assert.deepEqual([row.anon_can_call,row.user_can_call,row.uses_definer_privileges,row.is_read_only],[false,true,false,true]);assert.ok(checks[1].rows.every(row=>row.rls_enabled));
  await db.exec(read("20261108_workspace_assistant.sql"));assert.equal((await own(A,"SELECT query_workspace_tasks() AS data"))[0].data.total,36);
  await db.exec("BEGIN;SET LOCAL ROLE anon;");await assert.rejects(db.query("SELECT search_workspace_notes()"),/permission denied/);await db.exec("ROLLBACK;");
  const scope=ctx([{type:"notes"}]);assert.throws(()=>api.validateWorkspaceResult({schema:"pw-workspace-v1",scope,checked:["expenses"],cards:[]},scope),/AI_WORKSPACE_DATA_INVALID/);
  const scoped=ctx([{...api.defaultTasks(),taskId:TASK}]),card={type:"tasks",context:{type:"tasks",action:"breakdown",taskId:id(900)},report:{}};
  assert.throws(()=>api.validateWorkspaceResult({schema:"pw-workspace-v1",scope:scoped,checked:["tasks"],cards:[card]},scoped),/AI_WORKSPACE_DATA_INVALID/);
});
