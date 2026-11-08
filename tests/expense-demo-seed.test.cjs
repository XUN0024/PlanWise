const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { PGlite } = require("@electric-sql/pglite");
const { BATCH, MARKER, manifest, artifacts } = require("../scripts/generate-expense-demo.cjs");
const configureDemoSql=require("./fixtures/expense-demo-config.cjs");
const db = new PGlite();
const A="00000000-0000-4000-8000-000000000001", B="00000000-0000-4000-8000-000000000002", MISSING="00000000-0000-4000-8000-000000000003";
const REAL="10000000-0000-4000-8000-000000000001";
const read=(name)=>fs.readFileSync(path.join(__dirname,"../database/",name),"utf8");
const script=(name,user=A)=>configureDemoSql(read(`seeds/20261107_expenses_demo_${name}.sql`),user);
const rollback=()=>db.exec("ROLLBACK;");
async function asUser(user,sql,args=[]){
  await db.exec("BEGIN; SET LOCAL ROLE authenticated;");
  try{await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user]);const result=await db.query(sql,args);await db.exec("COMMIT;");return result.rows;}
  catch(error){await rollback();throw error;}
}
test.before(async()=>{
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA public,auth TO anon,authenticated;
    INSERT INTO auth.users VALUES('${A}'),('${B}');
    CREATE TABLE public.expenses(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES auth.users(id),
      amount numeric NOT NULL,category text,note text,expense_date date,created_at timestamptz NOT NULL DEFAULT now());`);
  for(const name of ["20261106_expenses_crud.sql","20261107_expenses_payment_time.sql","20261107_expenses_statistics.sql"])
    await db.exec(read("migrations/"+name));
  await db.query("INSERT INTO expenses(id,user_id,amount,note,category,expense_date) VALUES($1,$2,42.30,'Actual lunch','Food','2026-10-01')",[REAL,A]);
});
test.after(()=>db.close());

test("generated artifacts are reproducible and the frozen historical fixture satisfies the test coverage contract",()=>{
  for(const [file,content] of Object.entries(artifacts)){
    const actual=fs.readFileSync(file,"utf8").replace(/\r\n/g,"\n");
    assert.equal(file.endsWith(".sql")?configureDemoSql(actual):actual,content);
  }
  assert.equal(manifest.rowCount,256);assert.equal(manifest.totals.total_cents,"1448064");
  assert.equal(manifest.largest.amount,"2499.00");assert.equal(manifest.comparison.octoberVsSeptember.delta_cents,"193532");
  assert.equal(new Set(manifest.records.map(row=>row.category)).size,7);
  assert.equal(new Set(manifest.records.map(row=>row.payment_method).filter(Boolean)).size,6);
  assert.ok(manifest.records.some(row=>row.payment_method===null&&row.expense_time===null));
  assert.ok(manifest.monthly.filter(row=>row.date<"2026-11-01").every(row=>Number(row.count)>25));
  assert.ok(manifest.records.every(row=>row.expense_date<manifest.asOf&&row.created_at.startsWith(manifest.asOf)));
});
test("missing or wrong-project user UID fails before inserting anything",async()=>{
  await assert.rejects(db.exec(script("seed","PASTE_USER_UID_HERE")),/DEMO_TARGET_UID_REQUIRED/);await rollback();
  await assert.rejects(db.exec(script("seed",MISSING)),/DEMO_TARGET_USER_NOT_FOUND/);await rollback();
  assert.equal((await db.query("SELECT count(*)::integer AS n FROM expenses")).rows[0].n,1);
});
test("seed imports only the chosen owner, keeps real records, and is exactly idempotent",async()=>{
  const initial=await db.exec(script("seed"));assert.equal(Number(initial.flatMap(result=>result.rows||[]).find(row=>row.newly_inserted!==undefined).newly_inserted),256);
  const before=(await db.query("SELECT * FROM expenses ORDER BY id")).rows;
  const again=await db.exec(script("seed"));assert.equal(Number(again.flatMap(result=>result.rows||[]).find(row=>row.newly_inserted!==undefined).newly_inserted),0);
  assert.deepEqual((await db.query("SELECT * FROM expenses ORDER BY id")).rows,before);
  assert.equal((await db.query("SELECT amount FROM expenses WHERE id=$1",[REAL])).rows[0].amount,"42.30");
  assert.equal((await asUser(B,"SELECT id FROM expenses")).length,0);
});
test("all 19 complete golden RPC responses match PostgreSQL numeric under the authenticated owner",async()=>{
  for(const item of manifest.cases){
    const f=item.filters;
    const [row]=await asUser(A,"SELECT public.get_expense_statistics($1::date,$2::date,$3,$4,$5,$6::numeric,NULL,$7) AS actual",
      [f.from||null,f.to||null,f.category||null,f.method||null,f.search,f.min?String(f.min/100):null,item.expected.granularity]);
    assert.deepEqual(row.actual,item.expected,item.id);
  }
  const precision=manifest.cases.find(item=>item.id==="precision");assert.equal(precision.expected.total_cents,"59");
  assert.equal(manifest.cases.find(item=>item.id==="same_looking_rows").expected.count,"2");
  const [comparison]=(await db.query("SELECT round(193532::numeric/229283*100,2)::text AS percentage")).rows;
  assert.equal(comparison.percentage,"84.41");
});
test("verify script exercises existing RLS/RPC and returns 19 passing cases without leaving role or data changes",async()=>{
  const before=(await db.query("SELECT id,updated_at FROM expenses ORDER BY id")).rows;
  const results=await db.exec(script("verify")),cases=results.flatMap(result=>result.rows||[]).filter(row=>row.case_id);
  assert.equal(cases.length,19);assert.ok(cases.every(row=>row.passed===true));
  const integrity=results.flatMap(result=>result.rows||[]).find(row=>row.expected_rows!==undefined);
  assert.equal(Number(integrity.missing_rows),0);assert.equal(Number(integrity.edited_rows),0);
  assert.deepEqual((await db.query("SELECT id,updated_at FROM expenses ORDER BY id")).rows,before);
  assert.notEqual((await db.query("SELECT current_user AS role")).rows[0].role,"authenticated");
});
test("edited demo data is never silently overwritten and a second owner's fixture stays isolated",async()=>{
  const [row]=await asUser(A,"SELECT id FROM expenses WHERE position($1 in note)>0 ORDER BY id LIMIT 1",[MARKER]);
  await asUser(A,"UPDATE expenses SET amount=amount+0.01 WHERE id=$1",[row.id]);
  await assert.rejects(db.exec(script("seed")),/DEMO_ROW_CONFLICT/);await rollback();
  await asUser(A,"UPDATE expenses SET amount=amount-0.01 WHERE id=$1",[row.id]);
  await db.exec(script("seed",B));
  const [summary]=await asUser(A,"SELECT public.get_expense_statistics(p_search=>$1) AS data",[MARKER]);assert.equal(summary.data.count,"256");
  const [other]=await asUser(B,"SELECT public.get_expense_statistics(p_search=>$1) AS data",[MARKER]);assert.equal(other.data.total_cents,"1448064");
  assert.equal((await db.query("SELECT count(*)::integer AS n FROM expenses")).rows[0].n,513);
});
test("cleanup blocks receipt orphans and deletes only the chosen owner's marked deterministic rows",async()=>{
  await db.exec("CREATE TABLE expense_attachments(id uuid PRIMARY KEY,expense_id uuid REFERENCES expenses(id) ON DELETE CASCADE)");
  const [target]=await asUser(A,"SELECT id FROM expenses WHERE position($1 in note)>0 ORDER BY id LIMIT 1",[MARKER]);
  await db.query("INSERT INTO expense_attachments VALUES(gen_random_uuid(),$1)",[target.id]);
  await assert.rejects(db.exec(script("cleanup")),/DEMO_RECEIPTS_EXIST/);await rollback();
  assert.equal((await asUser(A,"SELECT id FROM expenses")).length,257);
  await db.exec("DELETE FROM expense_attachments");
  // A real row merely sharing the text marker is never a cleanup target.
  await db.query("INSERT INTO expenses(user_id,amount,note,category,expense_date) VALUES($1,1.00,$2,'Other','2026-10-01')",[A,MARKER+" User-created record"]);
  await asUser(A,"UPDATE expenses SET note='Marker removed intentionally' WHERE id=$1",[target.id]);
  const results=await db.exec(script("cleanup"));
  assert.equal(Number(results.flatMap(result=>result.rows||[]).find(row=>row.deleted_demo_expenses!==undefined).deleted_demo_expenses),255);
  assert.equal((await asUser(A,"SELECT id FROM expenses")).length,3);
  assert.equal((await asUser(B,"SELECT id FROM expenses")).length,256);
  assert.equal((await db.query("SELECT note FROM expenses WHERE id=$1",[REAL])).rows[0].note,"Actual lunch");
});
