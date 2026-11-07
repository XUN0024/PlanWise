// Fixed, reproducible evaluation data. This script writes files only; it never connects to Supabase.
const fs = require("node:fs"), path = require("node:path");
const BATCH = "PWDEMO-20261107-V1", MARKER = `[${BATCH}]`, AS_OF = "2026-11-07";
const directory = path.resolve(__dirname, "../database/seeds");
const rows = [];
function add(date, cents, category, description, payment = "cash", time = "12:30") {
  if (date > "2026-11-06") return;
  rows.push({date, cents, category, description, payment, time});
}
for (let month = 5; month <= 11; month++) {
  const index = month - 5, date = day => `2026-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
  add(date(1),75000,"Bills","房租 · 学生公寓","bank_transfer","09:00");
  add(date(3),9800 + index*135,"Bills","水电费 · 当月账单","bank_transfer","18:20");
  add(date(5),8900,"Bills","宽带 · 月费","debit_card","10:10");
  add(date(12),3500,"Bills","手机 · 月费","e_wallet","08:00");
  const mealDays=[1,2,4,6,8,10,12,14,16,18,20,22,24,26,28], prices=[700,950,1250,1500,1180,1850,900,1340,1600,1050,2200,1450,800,1750,1250];
  mealDays.forEach((day,n)=>add(date(day),prices[n]+index*35,"Food",["早餐 · 校园食堂","午餐 · 鸡饭","晚餐 · 面馆"][n%3],n%3===0?"cash":n%3===1?"e_wallet":"debit_card",["08:15","12:30","19:20"][n%3]));
  [7,17,27].forEach((day,n)=>add(date(day),[800,1250,1650][n]+index*20,"Food","咖啡 · 校园咖啡店","e_wallet","15:10"));
  [9,23].forEach((day,n)=>add(date(day),[5850,7420][n]+index*131,"Food","杂货 · 超市食材","debit_card","20:00"));
  [2,5,9,13,17,21,25,29].forEach((day,n)=>add(date(day),[240,680,1950,350,240,1220,800,240][n]+(n===2?index*100:0),"Transport",n===2||n===5?"Grab · 网约车":"交通 · 公交与轨道",n%3===0?"cash":"e_wallet",n%2===0?"08:40":"18:05"));
  [8,19,26].forEach((day,n)=>add(date(day),[1700,2890,4590][n]+index*45,"Entertainment",["电影 · 周末场次","游戏 · 数字内容","聚会 · 活动门票"][n],"credit_card","21:00"));
  [11,24].forEach((day,n)=>add(date(day),[3990,6500][n]+index*110,"Shopping",n?"购物 · 日用品":"购物 · 文具和书籍","debit_card","16:20"));
  add(date(15),3500+index*80,"Health","健康 · 药房用品","cash","11:30");
  add(date(20),850+index*15,"Other","其他 · 打印与复印",index%2===0?"other":null,null);
}
add("2026-07-17",26000,"Transport","城际旅行 · 吉隆坡往返槟城车票","credit_card","07:15");
add("2026-09-16",58000,"Health","健康 · 一次性门诊检查","credit_card","10:00");
add("2026-10-18",249900,"Shopping","购物 · 学习用笔记本电脑","credit_card","14:35");
add("2026-09-12",1475,"Food","补录 · 未记录付款方式和时间",null,null);
add("2026-06-30",999,"Other","边界核对 · 六月底","cash","23:59");
add("2026-07-01",1001,"Other","边界核对 · 七月初","cash","00:00");
add("2026-10-31",1575,"Food","边界核对 · 十月底","e_wallet","23:59");
add("2026-11-01",825,"Food","边界核对 · 十一月初","e_wallet","00:00");
for (const [suffix,cents] of [["A",10],["B",20],["C",29]])add("2026-08-31",cents,"Other",`精度核对 · ${suffix}`,"other","12:00");
// Two distinct transactions deliberately share note/amount/date/time. Both must count.
for(let n=0;n<2;n++)add("2026-11-06",1250,"Food","午餐 · 校园食堂","cash","12:30");
rows.sort((a,b)=>a.date.localeCompare(b.date)||(a.time??"99:99").localeCompare(b.time??"99:99"));
rows.forEach((row,index)=>{row.slot=index+1;row.note=`${MARKER} ${row.description}`;row.createdAt=`2026-11-07T00:${String(Math.floor(index/60)).padStart(2,"0")}:${String(index%60).padStart(2,"0")}+00:00`;});
const decimal = value => `${BigInt(value)/100n}.${String(BigInt(value)%100n).padStart(2,"0")}`;
const money = value => `RM ${decimal(value)}`;
const sql = value => value == null ? "NULL" : `'${String(value).replace(/'/g,"''")}'`;
function selectRows(filters={}) {
  return rows.filter(row=>(!filters.from||row.date>=filters.from)&&(!filters.to||row.date<=filters.to)
    &&(!filters.category||row.category===filters.category)&&(!filters.method||(filters.method==="unrecorded"?row.payment===null:row.payment===filters.method))
    &&(!filters.search||row.note.includes(filters.search))&&(!filters.min||row.cents>=filters.min)&&(!filters.max||row.cents<=filters.max));
}
function aggregate(items, granularity="month") {
  const total=items.reduce((sum,row)=>sum+BigInt(row.cents),0n),count=BigInt(items.length);
  function groups(key,trend=false){
    const map=new Map();for(const row of items){const name=key(row),group=map.get(name)||{count:0n,total:0n};group.count++;group.total+=BigInt(row.cents);map.set(name,group);}
    return [...map].sort((a,b)=>trend?a[0].localeCompare(b[0]):a[1].total!==b[1].total?(a[1].total>b[1].total?-1:1):a[0]<b[0]?-1:1)
      .map(([name,value])=>({[trend?"date":"key"]:name,count:String(value.count),total_cents:String(value.total)}));
  }
  return {count:String(count),total_cents:String(total),average_cents:String(count?(total+count/2n)/count:0n),granularity,
    categories:groups(row=>row.category),methods:groups(row=>row.payment||"unrecorded"),trend:groups(row=>granularity==="month"?row.date.slice(0,7)+"-01":row.date,true)};
}
const cases=[
  ["all","这批模拟支出一共有多少笔、总额和平均每笔是多少？",{},"month"],
  ["october","2026 年 10 月支出总额和笔数是多少？",{from:"2026-10-01",to:"2026-10-31"},"day"],
  ["september","2026 年 9 月支出总额和笔数是多少？",{from:"2026-09-01",to:"2026-09-30"},"day"],
  ["october_food","10 月餐饮支出多少？",{from:"2026-10-01",to:"2026-10-31",category:"Food"},"day"],
  ["september_health","9 月健康类支出多少，有哪些已记录的原因？",{from:"2026-09-01",to:"2026-09-30",category:"Health"},"day"],
  ["july_transport","7 月交通支出多少？",{from:"2026-07-01",to:"2026-07-31",category:"Transport"},"day"],
  ["october_credit_card","10 月通过信用卡付款的支出是多少？",{from:"2026-10-01",to:"2026-10-31",method:"credit_card"},"day"],
  ["unrecorded","没有记录付款方式的支出有多少笔、多少钱？",{method:"unrecorded"},"month"],
  ["precision","精度核对的 0.10、0.20、0.29 三笔合计多少？",{search:`${MARKER} 精度核对`},"day"],
  ["month_boundary","十月底和十一月初两笔边界核对合计多少？",{from:"2026-10-31",to:"2026-11-01",search:`${MARKER} 边界核对`},"day"],
  ["june_july_boundary","六月底和七月初两笔边界核对合计多少？",{from:"2026-06-30",to:"2026-07-01",search:`${MARKER} 边界核对`},"day"],
  ["zero_day","2026-08-30 有没有支出？",{from:"2026-08-30",to:"2026-08-30"},"day"],
  ["last_seven_days","以 2026-11-07 为今天，近七天含今天的支出是多少？",{from:"2026-11-01",to:"2026-11-07"},"day"],
  ["today","以 2026-11-07 为今天，今天花了多少钱？",{from:AS_OF,to:AS_OF},"day"],
  ["november_to_date","截至 2026-11-07，本月目前花了多少钱？",{from:"2026-11-01",to:AS_OF},"day"],
  ["october_same_days","10 月 1–6 日花了多少钱，用于与 11 月 1–6 日比较？",{from:"2026-10-01",to:"2026-10-06"},"day"],
  ["coffee","这批模拟记录中咖啡消费合计多少？",{search:`${MARKER} 咖啡`},"month"],
  ["large_payments","单笔不少于 RM 500 的支出有几笔、合计多少？",{min:50000},"month"],
  ["same_looking_rows","11 月 6 日相同描述的两笔校园食堂午餐合计多少？",{from:"2026-11-06",to:"2026-11-06",search:`${MARKER} 午餐 · 校园食堂`},"day"],
].map(([id,question,filters,granularity])=>({id,question,filters:{...filters,search:filters.search||MARKER},expected:aggregate(selectRows(filters),granularity)}));
const monthly=aggregate(rows).trend;
const october=cases.find(value=>value.id==="october").expected,september=cases.find(value=>value.id==="september").expected;
const delta=BigInt(october.total_cents)-BigInt(september.total_cents),base=BigInt(september.total_cents);
const percent=(delta<0n?-1n:1n)*((delta<0n?-delta:delta)*10000n+base/2n)/base;
const largest=[...rows].sort((a,b)=>b.cents-a.cents||a.slot-b.slot)[0];
const manifest={batch:BATCH,marker:MARKER,asOf:AS_OF,dateFrom:rows[0].date,dateTo:rows.at(-1).date,currency:"MYR",timezone:"Asia/Kuala_Lumpur",
  rowCount:rows.length,totals:aggregate(rows),monthly,cases,comparison:{octoberVsSeptember:{delta_cents:String(delta),percent_hundredths:String(percent)}},
  largest:{slot:largest.slot,date:largest.date,note:largest.note,amount:decimal(largest.cents),category:largest.category},
  records:rows.map(row=>({slot:row.slot,note:row.note,amount:decimal(row.cents),category:row.category,expense_date:row.date,expense_time:row.time,payment_method:row.payment,created_at:row.createdAt}))};

const configure=`-- Generated by scripts/generate-expense-demo.cjs. Batch: ${BATCH}.
-- Supabase SQL Editor: replace PASTE_USER_UID_HERE once, using auth.users.id (not an email/project ID).
BEGIN;
CREATE TEMP TABLE pw_demo_config(user_id uuid NOT NULL) ON COMMIT DROP;
DO $config$
DECLARE target_uid text := 'PASTE_USER_UID_HERE';
BEGIN
  IF target_uid !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'DEMO_TARGET_UID_REQUIRED: replace PASTE_USER_UID_HERE with the target auth.users.id';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=target_uid::uuid) THEN
    RAISE EXCEPTION 'DEMO_TARGET_USER_NOT_FOUND: this UID does not exist in this Supabase project';
  END IF;
  INSERT INTO pg_temp.pw_demo_config VALUES(target_uid::uuid);
END;
$config$;
-- Deterministic IDs are namespaced by batch, owner and row number; no extension required.
CREATE OR REPLACE FUNCTION pg_temp.pw_demo_id(owner_id uuid, slot integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $id$
  SELECT overlay(overlay(md5('${BATCH}:' || owner_id::text || ':' || slot::text) placing '4' from 13 for 1) placing '8' from 17 for 1)::uuid;
$id$;
GRANT EXECUTE ON FUNCTION pg_temp.pw_demo_id(uuid,integer) TO authenticated;
`;
const values=rows.map(row=>`(${row.slot},${sql(row.note)},${decimal(row.cents)},${sql(row.category)},${sql(row.date)}::date,${row.time?sql(row.time)+"::time":"NULL"},${sql(row.payment)},${sql(row.createdAt)}::timestamptz)`).join(",\n");
const fixture=`CREATE TEMP TABLE pw_demo_rows(slot integer PRIMARY KEY,note text,amount numeric,category text,expense_date date,expense_time time,payment_method text,created_at timestamptz) ON COMMIT DROP;
INSERT INTO pg_temp.pw_demo_rows VALUES
${values};
`;
const membership=`e.user_id=c.user_id AND e.id=pg_temp.pw_demo_id(c.user_id,r.slot)`;
const same=`ROW(e.note,e.amount,e.currency,e.category,e.expense_date,e.expense_time,e.payment_method,e.created_at)
  IS NOT DISTINCT FROM ROW(r.note,r.amount,'MYR'::text,r.category,r.expense_date,r.expense_time,r.payment_method,r.created_at)`;
const seed=configure+fixture+`-- No deletes, no updates, no schema or policy changes to business tables.
DO $guard$
BEGIN
  IF EXISTS(SELECT 1 FROM pg_temp.pw_demo_rows r CROSS JOIN pg_temp.pw_demo_config c JOIN public.expenses e ON e.id=pg_temp.pw_demo_id(c.user_id,r.slot)
    WHERE e.user_id<>c.user_id OR NOT (${same})) THEN
    RAISE EXCEPTION 'DEMO_ROW_CONFLICT: an existing deterministic row was edited or its ID belongs to another owner; nothing was overwritten';
  END IF;
  IF EXISTS(SELECT 1 FROM public.expenses e CROSS JOIN pg_temp.pw_demo_config c WHERE e.user_id=c.user_id AND position('${MARKER}' in e.note)>0
    AND NOT EXISTS(SELECT 1 FROM pg_temp.pw_demo_rows r WHERE e.id=pg_temp.pw_demo_id(c.user_id,r.slot))) THEN
    RAISE EXCEPTION 'DEMO_MARKER_CONFLICT: unexpected records use the reserved demo marker';
  END IF;
END;
$guard$;
CREATE TEMP TABLE pw_demo_import_result(newly_inserted bigint) ON COMMIT DROP;
WITH inserted AS (
  INSERT INTO public.expenses(id,user_id,note,amount,currency,category,expense_date,expense_time,payment_method,created_at)
  SELECT pg_temp.pw_demo_id(c.user_id,r.slot),c.user_id,r.note,r.amount,'MYR',r.category,r.expense_date,r.expense_time,r.payment_method,r.created_at
  FROM pg_temp.pw_demo_rows r CROSS JOIN pg_temp.pw_demo_config c
  ON CONFLICT(id) DO NOTHING RETURNING id
)
INSERT INTO pg_temp.pw_demo_import_result SELECT count(*) FROM inserted;
SELECT c.user_id,s.newly_inserted,${rows.length} AS expected_batch_rows,count(e.id) AS batch_rows,sum(e.amount) AS total_myr,min(e.expense_date) AS first_expense_date,max(e.expense_date) AS last_expense_date
FROM pg_temp.pw_demo_rows r CROSS JOIN pg_temp.pw_demo_config c JOIN public.expenses e ON ${membership}
CROSS JOIN pg_temp.pw_demo_import_result s GROUP BY c.user_id,s.newly_inserted;
COMMIT;
`;
const caseValues=cases.map(item=>`(${sql(item.id)},${sql(item.question)},${sql(item.filters.from)}::date,${sql(item.filters.to)}::date,${sql(item.filters.category)},${sql(item.filters.method)},${sql(item.filters.search)},${item.filters.min?decimal(item.filters.min):"NULL"},${sql(item.expected.granularity)},${sql(JSON.stringify(item.expected))}::jsonb)`).join(",\n");
const verify=configure+fixture+`-- Temporary fixture grants only. Existing expense RLS/column permissions are unchanged.
GRANT SELECT ON pg_temp.pw_demo_rows,pg_temp.pw_demo_config TO authenticated;
SELECT set_config('request.jwt.claim.sub',user_id::text,true) FROM pg_temp.pw_demo_config;
CREATE TEMP TABLE pw_demo_cases(case_id text,question text,date_from date,date_to date,category text,payment_method text,search text,min_amount numeric,granularity text,expected jsonb) ON COMMIT DROP;
INSERT INTO pg_temp.pw_demo_cases VALUES
${caseValues};
GRANT SELECT ON pg_temp.pw_demo_cases TO authenticated;
SET LOCAL ROLE authenticated;
-- Supporting rows first; the final result table contains all 19 pass/fail cases.
SELECT e.id,e.note,e.amount,e.category,e.expense_date,e.expense_time FROM public.expenses e CROSS JOIN pg_temp.pw_demo_config c
WHERE e.user_id=c.user_id AND position('${MARKER}' in e.note)>0 ORDER BY e.amount DESC,e.id LIMIT 5;
WITH integrity AS (
SELECT ${rows.length} AS expected_rows,count(e.id) AS actual_rows,
  count(*) FILTER(WHERE e.id IS NULL) AS missing_rows,
  count(*) FILTER(WHERE e.id IS NOT NULL AND NOT (${same})) AS edited_rows
FROM pg_temp.pw_demo_rows r CROSS JOIN pg_temp.pw_demo_config c LEFT JOIN public.expenses e ON ${membership}
)
SELECT q.case_id,q.question,
  q.expected->>'count' AS expected_count,a.result->>'count' AS actual_count,
  ((q.expected->>'total_cents')::numeric/100)::numeric(18,2) AS expected_myr,
  ((a.result->>'total_cents')::numeric/100)::numeric(18,2) AS actual_myr,
  i.expected_rows,i.actual_rows,i.missing_rows,i.edited_rows,
  a.result=q.expected AND i.missing_rows=0 AND i.edited_rows=0 AS passed
FROM pg_temp.pw_demo_cases q CROSS JOIN integrity i CROSS JOIN LATERAL (
  SELECT public.get_expense_statistics(q.date_from,q.date_to,q.category,q.payment_method,q.search,q.min_amount,NULL,q.granularity) AS result
) a ORDER BY q.case_id;
ROLLBACK;
`;
const cleanup=configure+`-- OPTIONAL CLEANUP ONLY. Do not run this immediately after importing.
-- Deletes only this UID's deterministic batch IDs AND descriptions retaining the marker.
CREATE TEMP TABLE pw_demo_targets ON COMMIT DROP AS
SELECT e.id FROM public.expenses e CROSS JOIN pg_temp.pw_demo_config c
WHERE e.user_id=c.user_id AND e.id IN (SELECT pg_temp.pw_demo_id(c.user_id,n) FROM generate_series(1,${rows.length}) n)
  AND position('${MARKER}' in e.note)>0;
DO $receipts$
DECLARE has_receipts boolean;
BEGIN
  IF to_regclass('public.expense_attachments') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS(SELECT 1 FROM public.expense_attachments a JOIN pg_temp.pw_demo_targets t ON t.id=a.expense_id)' INTO has_receipts;
    IF has_receipts THEN RAISE EXCEPTION 'DEMO_RECEIPTS_EXIST: remove these receipts through PlanWise first so Storage files are cleaned; no expenses were deleted'; END IF;
  END IF;
END;
$receipts$;
WITH deleted AS (
  DELETE FROM public.expenses e USING pg_temp.pw_demo_targets t,pg_temp.pw_demo_config c
  WHERE e.id=t.id AND e.user_id=c.user_id RETURNING e.id
) SELECT count(*) AS deleted_demo_expenses FROM deleted;
SELECT count(*) AS remaining_deterministic_rows FROM public.expenses e CROSS JOIN pg_temp.pw_demo_config c
WHERE e.user_id=c.user_id AND e.id IN(SELECT pg_temp.pw_demo_id(c.user_id,n) FROM generate_series(1,${rows.length}) n);
COMMIT;
`;
const percentText=`${percent<0n?"-":""}${decimal(percent<0n?-percent:percent)}%`;
const guide=`# Expenses 历史模拟数据与 AI 核对基准\n\n更新：2026-11-07，Asia/Kuala_Lumpur。批次：\`${BATCH}\`。\n\n本文件由 \`node scripts/generate-expense-demo.cjs\` 生成；不会连接数据库。金额按整数分计算，再由现有 PostgreSQL 统计 RPC 独立核对。\n\n**本轮仅准备模拟支出与预期结果；PW AI 的任务/支出业务查询仍需另外接入后端。导入数据不会自动赋予模型读库能力。**\n\n## 数据范围\n\n- ${rows.length} 笔，${manifest.dateFrom} 至 ${manifest.dateTo}，MYR，合计 **${money(manifest.totals.total_cents)}**，平均每笔 ${money(manifest.totals.average_cents)}。\n- 覆盖七种分类、六种支付方式及未记录；每个完整月份超过 25 笔，便于发现只统计当前页的错误。\n- 描述统一带 \`${MARKER}\`。最大单笔：${largest.date}，${largest.description}，${money(largest.cents)}。\n- 2026-08-30 与 2026-11-07 没有模拟支出；两组跨月 23:59/00:00 边界；RM 0.10 + 0.20 + 0.29 精度样本；两笔看起来相同但应分别计数的午餐。\n- 所有 created_at 故意设为 2026-11-07 模拟补录时间；updated_at 由原有触发器生成。消费统计必须使用 expense_date，不能按录入日期汇总。\n- 11 月只包含 1–6 日，不能与整个 10 月直接比较并宣称节省；应比较相同日期范围或说明未完月。\n\n## 导入步骤\n\n1. 在目标 Supabase 项目的 Authentication → Users 复制目标账号 **User UID**。使用空测试账号最容易逐项核对；导入当前账号也可以，但整体总额会混入原有真实账单。\n2. 在 SQL Editor 打开并粘贴 [seed SQL](../database/seeds/20261107_expenses_demo_seed.sql)，将配置行 \`target_uid text := 'PASTE_USER_UID_HERE'\` 改为真实 UID（保留引号），再运行整个文件。不要修改占位符检查逻辑。\n3. 首次 expected_batch_rows 应为 ${rows.length}，newly_inserted 为 ${rows.length}；未编辑模拟记录时重跑 newly_inserted 为 0，不重复、不覆盖已有记录。\n4. 打开 [verify SQL](../database/seeds/20261107_expenses_demo_verify.sql)，同样只填写配置行的 UID，再运行；missing_rows、edited_rows 应为 0，${cases.length} 个问题的 passed 应全部为 true。验证会使用 authenticated 身份及现有统计 RPC，结束后 ROLLBACK 清理临时状态。\n5. 刷新 Expenses，搜索 \`${BATCH}\` 只看本批模拟记录；查看统计、月趋势、分类、支付方式和分页。已有支出不会被删除。\n\n这不是 schema migration，不要放进自动生产迁移。前提是已经运行现有 Expenses CRUD、payment/time、statistics 三份迁移；本轮不修改权限策略或添加服务端 Secrets。若 SQL 报错使事务中止，先执行 \`ROLLBACK;\`，检查 UID/已有迁移后重跑完整文件。\n\n## 月度标准答案\n\n| 月份 | 笔数 | 金额 |\n|---|---:|---:|\n${monthly.map(value=>`| ${value.date.slice(0,7)}${value.date.startsWith("2026-11")?"（1–6 日）":""} | ${value.count} | ${money(value.total_cents)} |`).join("\n")}\n\n10 月相对 9 月差额：${delta<0n?"减少":"增加"} ${money(delta<0n?-delta:delta)}，变化率 ${percentText}（以 9 月为分母，四舍五入到百分比两位小数）。可说明已记录的大额购物，不可凭此断言超预算、浪费或个人收入情况。\n\n## 可直接提问的核对清单\n\n以下答案**只针对本批模拟记录**。如同账号有真实账单，提问和工具查询必须限定模拟批次；不能用这里的标准总额评判整个账号的实际统计。相对日期冻结在 2026-11-07，之后测试请改用明确日期。\n\n| 问题 | 笔数 | 正确总额 | 平均每笔 |\n|---|---:|---:|---:|\n${cases.map(value=>`| ${value.question} | ${value.expected.count} | ${money(value.expected.total_cents)} | ${money(value.expected.average_cents)} |`).join("\n")}\n\n机器可读的筛选条件、分类/支付方式/趋势完整结果及全部原始样本位于 [expected JSON](../database/seeds/20261107_expenses_demo_expected.json)。大额、月末、缺失付款方式都必须计入；NULL 时间不代表午夜，付款方式未记录不能算现金；两笔相同午餐不应自动去重。\n\n## 模型解释怎样验收\n\n- 数字由数据库返回；模型负责表达与说明，不凭最近 25 条列表心算，也不拿聊天记忆代替查询。总额、笔数、均值、分组、日期边界必须与 verify/JSON 对齐。\n- 用户问“为什么 10 月上涨”：可引用已记录的学习用电脑及其金额，不能编造购物动机或把相关性写成确定原因。\n- 用户问“我超预算了吗”：当前没有预算数据，应说明无法判断并询问预算；不能把某个月的支出当作用户预算。\n- 本月是部分月份，比较需说明截止日期；月份和时刻按马来西亚本地日历，不能误用 created_at 或 UTC 平移消费日期。\n- 模拟数据本身不检验跨账号隔离；业务查询接入后仍需用第二个账号验证 API 不能读取本账号记录。\n\n## 清理（可选）\n\n只在不再需要本批数据时运行 [cleanup SQL](../database/seeds/20261107_expenses_demo_cleanup.sql)，同样只填写配置行 UID。按批次确定的 ID + 目标用户 + 描述标记删除，不按整个日期范围删除。若模拟记录后来附加了收据，脚本会拒绝删除，先在应用内清理收据，避免留下 Storage 文件。移除了描述标记的模拟记录会保留并报告 remaining_deterministic_rows，需要人工核对。\n\n## 本地重建\n\n\`\`\`powershell\nnode scripts/generate-expense-demo.cjs\nnode scripts/generate-expense-demo.cjs --check\nnode --test tests/expense-demo-seed.test.cjs\n\`\`\`\n\n生成器只写入本批 SQL、JSON 和这份说明，不修改应用代码或连接线上 Supabase。\n`;
const artifacts={
  [path.join(directory,"20261107_expenses_demo_seed.sql")]:seed,
  [path.join(directory,"20261107_expenses_demo_verify.sql")]:verify,
  [path.join(directory,"20261107_expenses_demo_cleanup.sql")]:cleanup,
  [path.join(directory,"20261107_expenses_demo_expected.json")]:JSON.stringify(manifest,null,2)+"\n",
  [path.resolve(__dirname,"../docs/EXPENSES_AI_DEMO_DATA.md")]:guide,
};
if(require.main===module){
  const check=process.argv.includes("--check");
  for(const [file,content] of Object.entries(artifacts)){
    if(check){if(!fs.existsSync(file)||fs.readFileSync(file,"utf8").replace(/\r\n/g,"\n")!==content)throw Error(`Generated artifact is out of date: ${path.relative(process.cwd(),file)}`);}
    else{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,content);}
  }
  console.log(`${check?"Checked":"Generated"} ${rows.length} expenses, ${cases.length} evaluation cases, total ${money(manifest.totals.total_cents)}.`);
}
module.exports={BATCH,MARKER,manifest,artifacts};
