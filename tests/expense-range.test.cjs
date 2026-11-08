const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),{PGlite}=require("@electric-sql/pglite");
const configure=require("./fixtures/expense-demo-config.cjs"),manifest=require("../database/seeds/20261107_expenses_demo_expected.json");
const A="00000000-0000-4000-8000-000000000001",B="00000000-0000-4000-8000-000000000002",db=new PGlite(),now=Date.parse("2026-11-08T04:00:00Z");let model,parser,guard;
const read=name=>fs.readFileSync(path.join(__dirname,"../database",name),"utf8");
async function own(user,sql,args=[]){await db.exec("BEGIN;SET LOCAL ROLE authenticated;");try{await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user]);const result=await db.query(sql,args);await db.exec("COMMIT;");return result.rows;}catch(error){await db.exec("ROLLBACK;");throw error;}}
async function report(ctx,user=A,asOf="2026-11-08"){return(await own(user,"SELECT get_expense_range_insights($1::date,$2::date,$3,$4::date,$5::date,$6,$7::numeric,$8,$9,$10,$11::numeric,$12::numeric,$13::date) AS data",[ctx.from||null,ctx.to||null,ctx.comparison,ctx.compareFrom||null,ctx.compareTo||null,ctx.granularity,ctx.smallAmount,ctx.category||null,ctx.paymentMethod||null,ctx.search||null,ctx.minAmount||null,ctx.maxAmount||null,asOf]))[0].data;}
const scope=extra=>model.validateExpenseRange({...model.defaultExpenseRange(),type:"expenses_range",action:"review",search:manifest.marker,...extra},true);
test.before(async()=>{
  model=await import("../supabase/functions/ask-planwise/expense-range.mjs");parser=await import("../supabase/functions/ask-planwise/expense-query.mjs");guard=await import("../supabase/functions/ask-planwise/expense-range-context.mjs");
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);INSERT INTO auth.users VALUES('${A}'),('${B}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA public,auth TO anon,authenticated;
    CREATE TABLE expenses(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES auth.users(id),amount numeric,note text,category text,expense_date date,created_at timestamptz DEFAULT now());`);
  for(const name of ["20261106_expenses_crud.sql","20261107_expenses_payment_time.sql","20261107_expenses_statistics.sql","20261108_expense_range.sql"])await db.exec(read("migrations/"+name));
  await db.exec(configure(read("seeds/20261107_expenses_demo_seed.sql"),A));
  await db.query("INSERT INTO expenses(user_id,amount,note,category,expense_date) VALUES($1,999.99,$2,'Food','2026-10-01')",[B,manifest.marker+" Private"]);
});test.after(()=>db.close());
test("English named months, dates, quarters, years and continuous multi-month ranges resolve before reading data",()=>{
  const cases=[
    ["how many expenses in January 2026","2026-01-01","2026-01-31","count"],
    ["May I know how many expenses in January 2026?","2026-01-01","2026-01-31","count"],
    ["expenses in Jan 2026","2026-01-01","2026-01-31","review"],
    ["2026年一月支出多少笔","2026-01-01","2026-01-31","count"],
    ["expenses in 15 January 2026","2026-01-15","2026-01-15","review"],
    ["expenses in January 15, 2026","2026-01-15","2026-01-15","review"],
    ["spending trend from January to March 2026","2026-01-01","2026-03-31","trend"],
    ["expenses in Q2 2026","2026-04-01","2026-06-30","review"],
    ["expenses in 2026","2026-01-01","2026-12-31","review"],
    ["expenses in last year","2025-01-01","2025-12-31","review"],
    ["expenses from 2025-12-01 to 2026-02-28","2025-12-01","2026-02-28","review"],
  ];
  for(const [q,from,to,action]of cases){const c=parser.resolveExpenseQuery(q,model.defaultExpenseRange(),now);assert.deepEqual([c.from,c.to,c.action],[from,to,action],q);}
  const comparison=parser.resolveExpenseQuery("compare January 2026 with March 2026",model.defaultExpenseRange(),now);assert.equal(comparison.comparison,"custom");assert.equal(comparison.compareFrom,"2026-03-01");
  assert.equal(parser.resolveExpenseQuery("本月比上月多花在哪里",model.defaultExpenseRange(),now).comparison,"previous");
  assert.throws(()=>parser.resolveExpenseQuery("expenses on 01/02/2026",model.defaultExpenseRange(),now),error=>error.code==="AI_EXPENSE_DATE_AMBIGUOUS");
  assert.throws(()=>parser.resolveExpenseQuery("expenses in February 30, 2026",model.defaultExpenseRange(),now));
  assert.throws(()=>parser.resolveExpenseQuery("expenses in January 2027",model.defaultExpenseRange(),now),error=>error.code==="AI_EXPENSE_INPUT_INVALID");
  assert.throws(()=>parser.resolveExpenseQuery("expenses in January 2026",{...model.defaultExpenseRange(),from:"2026-11-01",to:"2026-11-30"},now,true),error=>error.code==="AI_EXPENSE_SCOPE_MISMATCH");
});
test("January count queries return January zero, no substitute month, comparison or unrelated examples",async()=>{
  const ctx=parser.resolveExpenseQuery("how many expenses in January 2026",{...model.defaultExpenseRange(),search:manifest.marker},now),data=await report(ctx);
  model.validateExpenseRangeReport(data,ctx,A);assert.equal(data.current.count,"0");assert.equal(data.current.total_cents,"0");assert.equal(data.scope.date_from,"2026-01-01");assert.equal(data.scope.date_to,"2026-01-31");assert.equal(data.previous,null);assert.deepEqual(model.rangeSources(data),[]);
  assert.equal(data.current.trend.length,31);assert.ok(data.current.trend.every(row=>row.total_cents==="0"));
  const answer=guard.expenseRangeAnswer(data,"how many expenses in January 2026");assert.match(answer,/2026-01-01 → 2026-01-31/);assert.doesNotMatch(answer,/November|2026-11-01|quarterly/);
});
test("multi-month and all-date trends match the independent demo oracle across every matching record",async()=>{
  const ctx=scope({from:"2026-05-01",to:"2026-11-30",granularity:"month",action:"trend"}),data=await report(ctx);model.validateExpenseRangeReport(data,ctx,A);
  assert.equal(data.current.total_cents,manifest.totals.total_cents);assert.equal(data.current.count,String(manifest.rowCount));assert.equal(data.current.trend.length,7);assert.equal(data.scope.date_to,"2026-11-08");assert.equal(data.scope.partial,true);
  for(const bucket of data.current.trend){const records=manifest.records.filter(row=>row.expense_date.slice(0,7)===bucket.date.slice(0,7));const total=records.reduce((sum,row)=>sum+BigInt(row.amount.replace(".","")),0n);assert.equal(bucket.total_cents,String(total));assert.equal(bucket.count,String(records.length));}
  const all=await report(scope({granularity:"month"}));assert.equal(all.current.count,"256");assert.equal(all.scope.date_from,manifest.dateFrom);assert.equal(all.previous,null);
});
test("comparison periods preserve exact deltas and partial calendar alignment including leap-year and zero baselines",async()=>{
  const oct=scope({from:"2026-10-01",to:"2026-10-31",comparison:"previous",action:"compare"}),data=await report(oct);model.validateExpenseRangeReport(data,oct,A);assert.equal(data.comparison.delta_cents,"193532");assert.equal(data.comparison.change_basis_points,"8441");assert.equal(data.scope.previous_from,"2026-09-01");
  const nov=scope({from:"2026-11-01",to:"2026-11-30",comparison:"previous"}),partial=await report(nov);model.validateExpenseRangeReport(partial,nov,A);assert.equal(partial.scope.previous_to,"2026-10-08");
  const leap=scope({from:"2024-03-01",to:"2024-03-31",comparison:"previous"}),ld=await report(leap,A,"2024-03-31");model.validateExpenseRangeReport(ld,leap,A);assert.equal(ld.scope.previous_to,"2024-02-29");assert.equal(ld.comparison.change_basis_points,null);
  const custom=scope({from:"2026-09-01",to:"2026-09-30",comparison:"custom",compareFrom:"2026-10-01",compareTo:"2026-10-31"}),cd=await report(custom);model.validateExpenseRangeReport(cd,custom,A);assert.equal(cd.comparison.delta_cents,"-193532");
});
test("date/category/payment/amount filters and literal search remain exact; tampered totals and out-of-period sources fail",async()=>{
  const ctx=scope({from:"2026-09-01",to:"2026-10-31",category:"Food",paymentMethod:"cash",minAmount:"1.00",maxAmount:"20.00"}),data=await report(ctx);model.validateExpenseRangeReport(data,ctx,A);
  const rows=manifest.records.filter(row=>row.expense_date>="2026-09-01"&&row.expense_date<="2026-10-31"&&row.category==="Food"&&row.payment_method==="cash"&&Number(row.amount)>=1&&Number(row.amount)<=20);assert.equal(data.current.count,String(rows.length));assert.equal(data.current.total_cents,String(rows.reduce((sum,row)=>sum+BigInt(row.amount.replace(".","")),0n)));
  const empty=await report(scope({search:"%.*[x]"}));assert.equal(empty.current.count,"0");
  assert.throws(()=>model.validateExpenseRangeReport({...data,current:{...data.current,total_cents:"1"}},ctx,A));
  const bad=structuredClone(data);bad.scope.date_from="2026-11-01";assert.throws(()=>model.validateExpenseRangeReport(bad,ctx,A));
});
test("RLS, invoker-only ACLs, read-only execution and migration reruns preserve existing expenses",async()=>{
  const a=await report(scope({})),b=await report(scope({}),B);assert.equal(a.current.count,"256");assert.equal(b.current.count,"1");assert.equal(b.current.total_cents,"99999");
  const before=(await db.query("SELECT id,updated_at FROM expenses ORDER BY id")).rows;await db.exec(read("migrations/20261108_expense_range.sql"));assert.deepEqual((await db.query("SELECT id,updated_at FROM expenses ORDER BY id")).rows,before);
  const checks=await db.exec(read("migrations/20261108_expense_range_verify.sql"));for(const row of checks[0].rows)assert.deepEqual([row.anon_can_call,row.user_can_call,row.uses_definer_privileges,row.is_read_only],[false,true,false,true]);assert.equal(checks[1].rows[0].expenses_rls_enabled,true);
  await db.exec("BEGIN;SET LOCAL ROLE anon;");await assert.rejects(db.query("SELECT get_expense_range_insights()"),/permission denied/);await db.exec("ROLLBACK;");
});
