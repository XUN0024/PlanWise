const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {PGlite}=require("@electric-sql/pglite");
const configureDemoSql=require("./fixtures/expense-demo-config.cjs");
const A="00000000-0000-4000-8000-000000000001",B="00000000-0000-4000-8000-000000000002";
const db=new PGlite(),read=name=>fs.readFileSync(path.join(__dirname,"../database/",name),"utf8");
const manifest=require("../database/seeds/20261107_expenses_demo_expected.json");
let helpers;
async function asUser(user,sql,args=[]){await db.exec("BEGIN; SET LOCAL ROLE authenticated;");try{await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user]);const result=await db.query(sql,args);await db.exec("COMMIT;");return result.rows;}catch(error){await db.exec("ROLLBACK;");throw error;}}
async function report(month="2026-10",extra={},user=A){const [row]=await asUser(user,"SELECT get_expense_insights($1::date,$2::numeric,$3,$4,$5::date) AS report",[month+"-01",extra.small||"20.00",extra.search??manifest.marker,extra.category||null,extra.asOf||"2026-11-07"]);return row.report;}
test.before(async()=>{
  helpers=await import("../supabase/functions/ask-planwise/expense-report.mjs");
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY); INSERT INTO auth.users VALUES('${A}'),('${B}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    GRANT USAGE ON SCHEMA public,auth TO anon,authenticated;
    CREATE TABLE expenses(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES auth.users(id),amount numeric NOT NULL,note text,category text,expense_date date,created_at timestamptz NOT NULL DEFAULT now());`);
  for(const name of ["20261106_expenses_crud.sql","20261107_expenses_payment_time.sql","20261107_expenses_assistant.sql"])await db.exec(read("migrations/"+name));
  await db.exec(configureDemoSql(read("seeds/20261107_expenses_demo_seed.sql"),A));
  await db.query("INSERT INTO expenses(user_id,amount,note,category,expense_date) VALUES($1,999999999999.99,$2,'Other','2026-10-02')",[B,manifest.marker+" Other account"]);
});
test.after(()=>db.close());
test("closed months match the independent demo oracle, exact net/category deltas and full-period averages",async()=>{
  const data=await report(),oct=manifest.cases.find(row=>row.id==="october").expected,sep=manifest.cases.find(row=>row.id==="september").expected;
  assert.equal(data.current.count,oct.count);assert.equal(data.current.total_cents,oct.total_cents);assert.equal(data.current.average_cents,oct.average_cents);
  assert.equal(data.previous.total_cents,sep.total_cents);assert.equal(data.comparison.delta_cents,"193532");assert.equal(data.comparison.change_basis_points,"8441");
  assert.equal(data.current.largest[0].amount_cents,"249900");assert.equal(data.current.largest.length,5);
  assert.equal(data.current.days,"31");assert.ok(Number(data.current.count)>25);
  const normalized=helpers.validateExpenseReport(data,{type:"expenses",action:"compare",month:"2026-10",smallAmount:"20.00",search:manifest.marker,category:""},A);
  assert.equal(normalized.owner_id,undefined);assert.equal(normalized.comparison.delta_cents,"193532");
});
test("small payments, frequent descriptions and literal/category filters use every matching record",async()=>{
  const data=await report(),small=manifest.records.filter(row=>row.expense_date.startsWith("2026-10")&&Number(row.amount)<=20);
  const cents=small.reduce((sum,row)=>sum+BigInt(row.amount.replace(".","")),0n);
  assert.equal(data.current.small.count,String(small.length));assert.equal(data.current.small.total_cents,String(cents));assert.ok(data.current.frequent.every(row=>Number(row.count)>=2));
  const filtered=await report("2026-10",{category:"Food"});assert.equal(filtered.current.total_cents,"42550");assert.equal(filtered.current.categories.length,1);
  const literal=await report("2026-10",{search:"%.*[x]"});assert.equal(literal.current.count,"0");
});
test("month-to-date, month-end clamping, leap days and zero previous totals have explicit date scopes",async()=>{
  const current=await report("2026-11");assert.equal(current.scope.date_to,"2026-11-07");assert.equal(current.scope.previous_to,"2026-10-07");assert.equal(current.scope.partial,true);
  const monthEnd=await report("2026-03",{asOf:"2026-03-31"});assert.equal(monthEnd.scope.previous_to,"2026-02-28");assert.equal(monthEnd.previous.days,"28");assert.equal(monthEnd.current.days,"31");
  const leap=await report("2024-03",{asOf:"2024-03-31"});assert.equal(leap.scope.previous_to,"2024-02-29");
  const empty=await report("2026-02");assert.equal(empty.current.total_cents,"0");assert.equal(empty.comparison.change_basis_points,null);
  helpers.validateExpenseReport(empty,{type:"expenses",action:"review",month:"2026-02",smallAmount:"20.00",search:manifest.marker,category:""},A);
});
test("user JWT/RLS scope excludes foreign records and invoker-only migration/permissions are rerunnable",async()=>{
  const first=await report(),second=await report("2026-10",{},B);assert.equal(first.current.total_cents,"422815");assert.equal(second.current.count,"1");assert.equal(second.current.total_cents,"99999999999999");
  const before=(await db.query("SELECT id,updated_at FROM expenses ORDER BY id")).rows;await db.exec(read("migrations/20261107_expenses_assistant.sql"));
  assert.deepEqual((await db.query("SELECT id,updated_at FROM expenses ORDER BY id")).rows,before);
  const checks=await db.exec(read("migrations/20261107_expenses_assistant_verify.sql"));assert.deepEqual(Object.values(checks[0].rows[0]),[false,true,false,true,true]);
  await assert.rejects(asUser("","SELECT get_expense_insights('2026-10-01')"),/Authentication required/);
  await db.exec("BEGIN; SET LOCAL ROLE anon;");await assert.rejects(db.query("SELECT get_expense_insights('2026-10-01')"),/permission denied/);await db.exec("ROLLBACK;");
});
test("updates and deletes of non-largest records change data_version and totals, so cached explanations cannot stay stale",async()=>{
  const before=await report(),[row]=await asUser(A,"SELECT id FROM expenses WHERE expense_date='2026-10-01' AND category='Food' LIMIT 1");
  await asUser(A,"UPDATE expenses SET amount=amount+0.01 WHERE id=$1",[row.id]);const changed=await report();assert.notEqual(changed.data_version,before.data_version);
  assert.equal(BigInt(changed.current.total_cents),BigInt(before.current.total_cents)+1n);
  await asUser(A,"DELETE FROM expenses WHERE id=$1",[row.id]);const deleted=await report();assert.notEqual(deleted.data_version,changed.data_version);assert.equal(BigInt(deleted.current.count),BigInt(before.current.count)-1n);
});
