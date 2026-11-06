const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),Module=require("node:module"),babel=require("@babel/core");
const {PGlite}=require("@electric-sql/pglite"),{createClient}=require("@supabase/supabase-js");
const db=new PGlite(),cache=new Map(),requests=[];
const A="00000000-0000-4000-8000-000000000001",B="00000000-0000-4000-8000-000000000002";
let owner=A,missing=false,offline=false;
const migration=name=>fs.readFileSync(path.join(__dirname,"../database/migrations",name),"utf8");
async function asRole(role,user,sql,args=[]){
  await db.exec(`BEGIN; SET LOCAL ROLE ${role};`);
  try{await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user||""]);const result=await db.query(sql,args);await db.exec("COMMIT;");return result.rows;}
  catch(error){await db.exec("ROLLBACK;");throw error;}
}
const rpcSql="SELECT public.get_expense_statistics($1::date,$2::date,$3::text,$4::text,$5::text,$6::numeric,$7::numeric,$8::text) AS result";
const client=createClient("https://example.supabase.co","public-test-key",{auth:{persistSession:false},global:{fetch:async(input,init)=>{
  assert.match(input,/\/rpc\/get_expense_statistics$/);assert.equal(init.method,"POST");
  const params=JSON.parse(init.body);requests.push(params);
  if(missing)return new Response(JSON.stringify({code:"PGRST202",message:"Missing RPC"}),{status:404,headers:{"Content-Type":"application/json"}});
  if(offline)throw Error("Offline");
  const args=["p_date_from","p_date_to","p_category","p_payment_method","p_search","p_min_amount","p_max_amount","p_granularity"].map(key=>params[key]);
  const rows=await asRole("authenticated",owner,rpcSql,args);
  return new Response(JSON.stringify(rows[0].result),{headers:{"Content-Type":"application/json"}});
}}});
client.auth.getSession=async()=>({data:{session:{user:{id:owner}}}});
function load(file){
  const filename=path.resolve(__dirname,"..",file);if(cache.has(filename))return cache.get(filename);
  const {code}=babel.transformSync(fs.readFileSync(filename,"utf8"),{filename,babelrc:false,configFile:false,presets:[["@babel/preset-env",{targets:{node:"current"}}]]});
  const mod=new Module(filename);mod.require=name=>name==="./expenseReceiptService"?{deleteExpenseReceipts:async()=>{}}:name==="../lib/supabase"?{supabase:client}:load(path.relative(path.resolve(__dirname,".."),path.resolve(path.dirname(filename),name+".jsx")));
  mod._compile(code,filename);cache.set(filename,mod.exports);return mod.exports;
}
const service=load("src/services/expenseService.jsx"),stats=load("src/lib/expenseStatistics.jsx"),query=load("src/lib/expenseQuery.jsx");
test.before(async()=>{
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY); INSERT INTO auth.users VALUES('${A}'),('${B}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA public,auth TO anon,authenticated;
    CREATE TABLE expenses(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES auth.users(id),amount numeric NOT NULL,
      note text,category text,expense_date date,created_at timestamptz NOT NULL DEFAULT now());`);
  for(const name of ["20261106_expenses_crud.sql","20261107_expenses_payment_time.sql","20261107_expenses_statistics.sql"])await db.exec(migration(name));
  await db.query(`INSERT INTO expenses(user_id,amount,note,category,expense_date,payment_method)
    SELECT $1,CASE WHEN n<10 THEN 0.10 WHEN n<20 THEN 0.20 ELSE 1 END,'Lunch',CASE WHEN n<20 THEN 'Food' ELSE 'Bills' END,
      CASE WHEN n<15 THEN DATE '2026-10-31' ELSE DATE '2026-11-01' END,CASE WHEN n%2=0 THEN 'cash' ELSE NULL END FROM generate_series(0,29) n`,[A]);
  await db.query("INSERT INTO expenses(user_id,amount,note,category,expense_date,payment_method) VALUES($1,0.29,$2,'Other','2024-02-29','e_wallet')",[A,"午餐 10%_* .+? [x] \\ ^$"]);
  await db.query("INSERT INTO expenses(user_id,amount,note,category,expense_date) SELECT $1,999999999999.99,'Big','Other','2026-11-01' FROM generate_series(1,100)",[B]);
  await db.query("INSERT INTO expenses(user_id,amount,note,category,expense_date) VALUES($1,0.01,'Cent','Other','2026-11-01')",[B]);
});
test.after(()=>db.close());

test("RPC summarizes every matching record beyond 25, uses expense_date, and returns exact numeric totals",async()=>{
  const data=await service.getExpenseStatistics(A);
  assert.equal(data.count,"31");assert.equal(data.totalCents,"1329");assert.equal(data.averageCents,"43");assert.equal(data.granularity,"month");
  assert.deepEqual(data.trend.map(item=>[item.date,item.totalCents]),[["2024-02-01","29"],["2026-10-01","200"],["2026-11-01","1100"]]);
  assert.equal(data.categories.find(item=>item.key==="Food").totalCents,"300");assert.equal(data.methods.find(item=>item.key==="unrecorded").count,"15");
  assert.equal(Object.hasOwn(requests.at(-1),"user_id"),false);assert.equal(Object.hasOwn(requests.at(-1),"page"),false);
  owner=B;const large=await service.getExpenseStatistics(B);owner=A;
  assert.equal(large.count,"101");assert.equal(large.totalCents,"9999999999999901");assert.equal(stats.formatStatisticRM(large.totalCents),"RM 99,999,999,999,999.01");
  assert.equal(stats.statisticRatio("9999999999999901","9999999999999901"),100);
});

test("all list predicates agree with aggregation, including literal search, payment NULL, date and amount boundaries",async()=>{
  const filters={datePreset:"custom",dateFrom:"2026-11-01",dateTo:"2026-11-01",category:"Bills",paymentMethod:"unrecorded",search:"lUnCh",minAmount:"1",maxAmount:"1.00"};
  const data=await service.getExpenseStatistics(A,filters,"day");assert.equal(data.count,"5");assert.equal(data.totalCents,"500");assert.equal(data.averageCents,"100");
  assert.deepEqual(data.trend,[{date:"2026-11-01",count:"5",totalCents:"500"}]);
  const p=requests.at(-1);assert.equal(p.p_min_amount,"1.00");assert.equal(p.p_payment_method,"unrecorded");
  for(const search of ["10%_*",".+? [x]","\\ ^$","午餐"]){
    const match=await service.getExpenseStatistics(A,{search},"day");assert.equal(match.totalCents,"29");
    const rows=await asRole("authenticated",A,"SELECT count(*)::text AS count FROM expenses WHERE note ~* $1",[query.expenseSearchPattern(search)]);assert.equal(match.count,rows[0].count);
  }
  const empty=await service.getExpenseStatistics(A,{minAmount:"2"});assert.equal(empty.count,"0");assert.equal(empty.averageCents,"0");assert.deepEqual(empty.trend,[]);
});

test("average uses an exact quotient even when huge amounts average just below half a cent",async()=>{
  await asRole("authenticated",B,"UPDATE expenses SET amount=999999999999.48 WHERE note='Cent'");
  owner=B;const data=await service.getExpenseStatistics(B);owner=A;
  assert.equal(data.count,"101");assert.equal(data.averageCents,"99999999999998");
  await asRole("authenticated",B,"UPDATE expenses SET amount=0.01 WHERE note='Cent'");
});

test("statistics RPC is invoker-only, not executable by anon/PUBLIC, validates direct API inputs and preserves rows on rerun",async()=>{
  const checks=await db.exec(migration("20261107_expenses_statistics_verify.sql"));assert.deepEqual(Object.values(checks[0].rows[0]),[false,true,false,false,true]);
  await assert.rejects(asRole("anon",null,"SELECT public.get_expense_statistics()"),/permission denied/);
  await assert.rejects(asRole("authenticated",null,"SELECT public.get_expense_statistics()"),/Authentication required/);
  for(const expr of ["p_category=>'Unknown'","p_payment_method=>'crypto'","p_min_amount=>-1","p_min_amount=>1.001","p_min_amount=>2,p_max_amount=>1","p_granularity=>'year'","p_date_from=>'2026-12-01',p_date_to=>'2026-01-01'"])
    await assert.rejects(asRole("authenticated",A,`SELECT public.get_expense_statistics(${expr})`),/Invalid expense/);
  const before=(await db.query("SELECT count(*)::text AS count,sum(amount)::text AS total,max(updated_at)::text AS version FROM expenses")).rows;
  await db.exec(migration("20261107_expenses_statistics.sql"));
  assert.deepEqual((await db.query("SELECT count(*)::text AS count,sum(amount)::text AS total,max(updated_at)::text AS version FROM expenses")).rows,before);
});

test("updates/deletes change aggregate results and daily/monthly bins agree exactly",async()=>{
  await asRole("authenticated",A,"INSERT INTO expenses(user_id,amount,note,category,expense_date,payment_method) VALUES($1,0.01,'New','Food','2026-11-02','credit_card')",[A]);
  let data=await service.getExpenseStatistics(A,{},"day");assert.equal(data.count,"32");assert.equal(data.totalCents,"1330");
  await asRole("authenticated",A,"UPDATE expenses SET amount=0.02 WHERE note='New'");data=await service.getExpenseStatistics(A,{},"month");assert.equal(data.totalCents,"1331");
  await asRole("authenticated",A,"DELETE FROM expenses WHERE note='New'");data=await service.getExpenseStatistics(A);assert.equal(data.count,"31");assert.equal(data.totalCents,"1329");
});

test("missing RPC/offline failures are explicit and invalid/auth inputs do not make RPC requests",async()=>{
  missing=true;await assert.rejects(service.getExpenseStatistics(A),error=>error.code==="EXPENSE_STATS_SETUP_REQUIRED");missing=false;
  offline=true;await assert.rejects(service.getExpenseStatistics(A));offline=false;
  const initial=requests.length;await assert.rejects(service.getExpenseStatistics(B),error=>error.code==="EXPENSE_AUTH_REQUIRED");
  await assert.rejects(service.getExpenseStatistics(A,{minAmount:"-1"}));await assert.rejects(service.getExpenseStatistics(A,{},"year"));assert.equal(requests.length,initial);
});

test("aggregate mapping rejects rounded/incomplete data and rounds average half cents consistently",()=>{
  const valid={count:"2",total_cents:"3",average_cents:"2",granularity:"day",categories:[{key:"Food",count:"2",total_cents:"3"}],methods:[{key:"unrecorded",count:"2",total_cents:"3"}],trend:[{date:"2024-02-29",count:"2",total_cents:"3"}]};
  assert.equal(stats.expenseStatisticsFromRow(valid).averageCents,"2");
  for(const patch of [{total_cents:3},{average_cents:"1"},{categories:[]},{methods:[...valid.methods,...valid.methods]},{trend:[{...valid.trend[0],date:"2026-02-29"}]}])assert.throws(()=>stats.expenseStatisticsFromRow({...valid,...patch}),error=>error.code==="EXPENSE_STATS_INVALID");
  assert.equal(stats.formatStatisticRM("0"),"RM 0.00");assert.equal(stats.formatStatisticCount("10000"),"10,000");
});
