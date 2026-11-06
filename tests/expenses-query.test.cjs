const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), Module = require("node:module"), babel = require("@babel/core");
const { PGlite } = require("@electric-sql/pglite"), { createClient } = require("@supabase/supabase-js");
const db = new PGlite(), cache = new Map(), requests = [];
const A = "00000000-0000-4000-8000-000000000001", B = "00000000-0000-4000-8000-000000000002";
const id = n => "10000000-0000-4000-8000-" + String(n).padStart(12,"0");
let owner = A;
// Use the installed Supabase builder and execute its encoded read predicates in PostgreSQL.
const client = createClient("https://example.supabase.co", "public-test-key", { auth: {persistSession:false}, global: {fetch: async input => {
  const url = new URL(input), params = url.searchParams, args = [], where = [];
  const allowed = ["user_id","expense_date","category","payment_method","amount","note"];
  for (const [column,expression] of params) {
    if (!allowed.includes(column)) continue;
    const dot = expression.indexOf("."), op = expression.slice(0,dot), value = expression.slice(dot+1);
    if (op === "is") { assert.equal(value,"null"); where.push(`${column} IS NULL`); }
    else { const operator = {eq:"=",gte:">=",lte:"<=",imatch:"~*"}[op]; assert.ok(operator); args.push(value); where.push(`${column} ${operator} $${args.length}`); }
  }
  const order = params.get("order").split(",").map(value => {
    const [column,direction,nulls] = value.split(".");
    assert.ok(["amount","expense_date","expense_time","created_at","id"].includes(column));
    assert.ok(["asc","desc"].includes(direction)); assert.ok(!nulls || ["nullslast","nullsfirst"].includes(nulls));
    return column + " " + direction + (nulls ? " NULLS " + (nulls === "nullslast" ? "LAST" : "FIRST") : "");
  }).join(",");
  const offset = Number(params.get("offset")), limit = Number(params.get("limit"));
  assert.ok(Number.isSafeInteger(offset) && offset >= 0 && limit === 26);
  requests.push(url);
  await db.exec("BEGIN; SET LOCAL ROLE authenticated;");
  try {
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[owner]);
    const result = await db.query(`SELECT id,note,amount,currency,category,expense_date::text,expense_time::text,payment_method,created_at::text,updated_at::text FROM expenses WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`,args);
    await db.exec("COMMIT;");
    return new Response(JSON.stringify(result.rows),{headers:{"Content-Type":"application/json"}});
  } catch(error) { await db.exec("ROLLBACK;"); throw error; }
}}});
client.auth.getSession = async () => ({data:{session:{user:{id:owner}}}});
function load(file) {
  const filename=path.resolve(__dirname,"..",file);if(cache.has(filename))return cache.get(filename);
  const {code}=babel.transformSync(fs.readFileSync(filename,"utf8"),{filename,babelrc:false,configFile:false,presets:[["@babel/preset-env",{targets:{node:"current"}}]]});
  const mod=new Module(filename);mod.require=name=>name==="../lib/supabase"?{supabase:client}:load(path.relative(path.resolve(__dirname,".."),path.resolve(path.dirname(filename),name+".jsx")));
  mod._compile(code,filename);cache.set(filename,mod.exports);return mod.exports;
}
const query = load("src/lib/expenseQuery.jsx"), model = load("src/lib/expenseModel.jsx"), service = load("src/services/expenseService.jsx");
const plain = value => JSON.parse(JSON.stringify(value));
test.before(async()=>{
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY); INSERT INTO auth.users VALUES('${A}'),('${B}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA public,auth TO anon,authenticated;
    CREATE TABLE expenses(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES auth.users(id),amount numeric NOT NULL,
      note text,category text,expense_date date,created_at timestamptz NOT NULL DEFAULT now());`);
  for (const name of ["20261106_expenses_crud.sql","20261107_expenses_payment_time.sql"]) await db.exec(fs.readFileSync(path.join(__dirname,"../database/migrations",name),"utf8"));
  for(let n=1;n<=70;n++) await db.query("INSERT INTO expenses(id,user_id,note,amount,category,expense_date,payment_method,expense_time) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
    [id(n),A,n%2?"Coffee":"Lunch",n+".10",n<=35?"Food":"Bills",n<=35?"2026-11-01":"2026-11-07",n%2?"cash":null,n%2?"12:00":null]);
  for(const [n,user,note,amount,time] of [[90,A,"午餐 Lunch 10%_* (x).+? [a] \\ ^$ | {z}","0.29","00:00"],[91,A,"Lunch 10ABCDE","12.50","00:01"],[92,A,"Other","2.50",null],[93,B,"Lunch 10%_*","0.29","00:00"]])
    await db.query("INSERT INTO expenses(id,user_id,note,amount,category,expense_date,payment_method,expense_time) VALUES($1,$2,$3,$4,'Food','2026-11-07','cash',$5)",[id(n),user,note,amount,time]);
});
test.after(()=>db.close());

test("calendar presets include today, handle leap/month/year boundaries and allow open custom bounds",()=>{
  const now = new Date(2024,2,1,0,15);
  const dates = preset => { const n=query.normalizeExpenseFilters({datePreset:preset},now);return[n.dateFrom,n.dateTo]; };
  assert.deepEqual(dates("all"),["",""]);assert.deepEqual(dates("today"),["2024-03-01","2024-03-01"]);
  assert.deepEqual(dates("last7"),["2024-02-24","2024-03-01"]);assert.deepEqual(dates("month"),["2024-03-01","2024-03-31"]);
  const feb=query.normalizeExpenseFilters({datePreset:"month"},new Date(2024,1,29));assert.equal(feb.dateTo,"2024-02-29");
  const year=query.normalizeExpenseFilters({datePreset:"last7"},new Date(2026,0,2));assert.equal(year.dateFrom,"2025-12-27");
  assert.equal(query.normalizeExpenseFilters({datePreset:"custom",dateFrom:"2024-02-29"}).dateTo,"");
  assert.equal(query.normalizeExpenseFilters({minAmount:"0",maxAmount:"0.29"}).minAmount,"0.00");
});

test("filter validation rejects invalid bounds/options without issuing a database request",async()=>{
  const initial=requests.length;
  for(const [filters,code] of [
    [{datePreset:"custom",dateFrom:"2026-02-29"},"EXPENSE_FILTER_DATE_INVALID"],
    [{datePreset:"custom",dateFrom:"2026-12-01",dateTo:"2026-01-01"},"EXPENSE_FILTER_DATE_RANGE"],
    [{minAmount:"2",maxAmount:"1.99"},"EXPENSE_FILTER_AMOUNT_RANGE"],
    ...["-1","1.001","1e2","1000000000000"].map(minAmount=>[{minAmount},"EXPENSE_FILTER_AMOUNT_INVALID"]),
    [{sort:"amount);drop table expenses"},"EXPENSE_FILTER_INVALID"], [{paymentMethod:"crypto"},"EXPENSE_FILTER_INVALID"],
    [{category:"Unknown"},"EXPENSE_FILTER_INVALID"], [{search:"\0"},"EXPENSE_FILTER_SEARCH_INVALID"]
  ]) await assert.rejects(service.getExpenses(A,0,filters),error=>error.code===code);
  assert.equal(requests.length,initial);
  assert.equal(model.expenseErrorKey({code:"EXPENSE_FILTER_DATE_RANGE"}),"expensesPanel.filters.dateRangeInvalid");
});

test("server filters before pagination, finds matching rows beyond page one and preserves owner scope",async()=>{
  const first=await service.getExpenses(A,0,{category:"Food",datePreset:"custom",dateTo:"2026-11-01"});
  const second=await service.getExpenses(A,1,{category:"Food",datePreset:"custom",dateTo:"2026-11-01"});
  assert.equal(first.items.length,25);assert.equal(first.hasMore,true);assert.equal(second.items.length,10);assert.equal(second.hasMore,false);
  assert.equal(new Set([...first.items,...second.items].map(item=>item.id)).size,35);
  const combined=await service.getExpenses(A,0,{datePreset:"custom",dateFrom:"2026-11-07",dateTo:"2026-11-07",category:"Bills",paymentMethod:"unrecorded",minAmount:"40.10",maxAmount:"60.10",search:"lUnCh",sort:"amount_asc"});
  assert.equal(combined.items.length,11);assert.equal(combined.items[0].amount,"40.10");assert.equal(combined.items.at(-1).amount,"60.10");
  assert.ok(combined.items.every(item=>item.date==="2026-11-07"&&item.paymentMethod===""));
  assert.equal(requests.at(-1).searchParams.get("payment_method"),"is.null");
  owner=B;const mine=await service.getExpenses(B);assert.deepEqual(mine.items.map(item=>item.id),[id(93)]);owner=A;
});

test("literal case-insensitive search escapes wildcards, regex syntax, Unicode and backslashes",async()=>{
  for(const search of ["10%_*","(x).+? [a]","\\ ^$ | {z}","午餐"]) {
    const result=await service.getExpenses(A,0,{search});assert.deepEqual(result.items.map(item=>item.id),[id(90)]);
  }
  const coffee=await service.getExpenses(A,0,{search:"  cOfFeE  "});assert.equal(coffee.hasMore,true);assert.ok(coffee.items.every(item=>item.description==="Coffee"));
});

test("numeric sorting is exact, date/time sorts keep NULL last within each date and ties are stable across pages",async()=>{
  for(const sort of query.EXPENSE_SORTS) {
    const filter={sort,datePreset:"custom",dateFrom:"2026-11-07",maxAmount:"20"};
    const result=await service.getExpenses(A,0,filter), records=result.items;
    if(sort==="amount_asc") assert.deepEqual(records.map(item=>item.amount),["0.29","2.50","12.50"]);
    if(sort==="amount_desc") assert.deepEqual(records.map(item=>item.amount),["12.50","2.50","0.29"]);
    if(sort==="date_asc") assert.deepEqual(records.map(item=>item.time),["00:00","00:01",""]);
    if(sort==="date_desc") assert.deepEqual(records.map(item=>item.time),["00:01","00:00",""]);
    const order=requests.at(-1).searchParams.get("order");assert.match(order,/id\.desc$/);
    if(sort==="created_desc") assert.match(order,/^created_at\.desc,id\.desc$/);
  }
  const filter={sort:"date_asc",datePreset:"custom",dateTo:"2026-11-01"};
  const first=await service.getExpenses(A,0,filter), second=await service.getExpenses(A,1,filter);
  const all=[...first.items,...second.items];assert.equal(new Set(all.map(item=>item.id)).size,35);
  assert.equal(all.findIndex(item=>!item.time),18);assert.ok(all.slice(18).every(item=>!item.time));
  assert.deepEqual(plain((await service.getExpenses(A,0,filter)).items),plain(first.items));
});
