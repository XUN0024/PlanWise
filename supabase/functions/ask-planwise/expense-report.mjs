// Portable public report validation/formatting helpers. No credentials, fetch, or runtime-specific imports.
export const EXPENSE_CATEGORIES = ["Food","Transport","Bills","Entertainment","Shopping","Health","Other"];
const METHODS = ["cash","debit_card","credit_card","bank_transfer","e_wallet","other","unrecorded"];
const invalid = (code="AI_EXPENSE_DATA_INVALID") => Object.assign(new Error(code), {code,status:400});
const integer = value => typeof value==="string" && /^(0|[1-9]\d{0,39})$/.test(value);
const signed = value => typeof value==="string" && /^-?(0|[1-9]\d{0,39})$/.test(value);
export function malaysiaDay(time=Date.now()) {
  const parts=Object.fromEntries(new Intl.DateTimeFormat("en",{timeZone:"Asia/Kuala_Lumpur",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(time)).map(part=>[part.type,part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function validDay(value) {
  if(typeof value!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const date=new Date(value+"T00:00:00Z");return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
export function decimalCents(value) {
  if(typeof value!=="string" || !/^\d{1,5}(\.\d{1,2})?$/.test(value))throw invalid("AI_EXPENSE_INPUT_INVALID");
  const [whole,fraction=""]=value.split("."), cents=BigInt(whole)*100n+BigInt(fraction.padEnd(2,"0"));
  if(cents<=0n||cents>1000000n)throw invalid("AI_EXPENSE_INPUT_INVALID");return cents;
}
export const centsDecimal = value => `${BigInt(value)/100n}.${String(BigInt(value)%100n).padStart(2,"0")}`;
export function validateExpenseContext(value) {
  if(!value||value.type!=="expenses"||Object.keys(value).some(key=>!["type","action","month","smallAmount","search","category"].includes(key))
    || !["review","compare"].includes(value.action)||typeof value.month!=="string"||!/^\d{4}-(0[1-9]|1[0-2])$/.test(value.month)||Number(value.month.slice(0,4))<1900
    || (value.search!==undefined && (typeof value.search!=="string"||Array.from(value.search).length>1000||value.search.includes("\0")))
    || (value.category!=null&&value.category!==""&&!EXPENSE_CATEGORIES.includes(value.category)))throw invalid("AI_EXPENSE_INPUT_INVALID");
  return {type:"expenses",action:value.action,month:value.month,smallAmount:centsDecimal(decimalCents(value.smallAmount??"20.00")),
    search:(value.search||"").trim(),category:value.category||""};
}
export const expenseContextKey = value => JSON.stringify(validateExpenseContext(value));
export function validateExpenseReport(value,context,ownerId) {
  const fail=()=>{throw invalid();}, require=(condition)=>{if(!condition)fail();};
  require(value?.schema==="expenses-insights-v1"&&value.currency==="MYR"&&value.timezone==="Asia/Kuala_Lumpur"&&/^[a-f0-9]{32}$/.test(value.data_version));
  if(ownerId)require(value.owner_id===ownerId);
  const s=value.scope;
  require(s&&s.month===context.month&&[s.date_from,s.date_to,s.previous_from,s.previous_to,s.as_of].every(validDay)
    &&s.date_from===context.month+"-01"&&s.date_from<=s.date_to&&s.previous_from<=s.previous_to&&s.previous_to<s.date_from&&s.date_to<=s.as_of
    &&typeof s.partial==="boolean"&&s.small_amount_cents===String(decimalCents(context.smallAmount))
    &&(s.search||"")===(context.search||"")&&(s.category||"")===(context.category||""));
  const usedIds=new Set();
  function period(p,from,to) {
    require(p&&[p.count,p.total_cents,p.average_cents,p.daily_average_cents,p.days,p.active_days,p.frequent_group_count].every(integer));
    const count=BigInt(p.count),total=BigInt(p.total_cents),days=BigInt(Math.round((Date.parse(to)-Date.parse(from))/86400000)+1);
    require(days>0n&&days<=31n&&BigInt(p.days)===days&&BigInt(p.active_days)<=days&&BigInt(p.active_days)<=count
      &&BigInt(p.average_cents)===(count?(total+count/2n)/count:0n)&&BigInt(p.daily_average_cents)===(total+days/2n)/days&&total>=count);
    require(p.small&&[p.small.count,p.small.total_cents,p.small.share_basis_points].every(integer));
    require(BigInt(p.small.count)<=count&&BigInt(p.small.total_cents)<=total
      &&BigInt(p.small.share_basis_points)===(total?(BigInt(p.small.total_cents)*10000n+total/2n)/total:0n));
    const groups=(items,kind,keys)=>{
      require(Array.isArray(items));let n=0n,sum=0n;const seen=new Set();
      for(const row of items){const key=row[kind];require(!seen.has(key)&&keys(key)&&integer(row.count)&&BigInt(row.count)>0n&&integer(row.total_cents));
        seen.add(key);n+=BigInt(row.count);sum+=BigInt(row.total_cents);
        if(kind==="date")require(key>=from&&key<=to);
        if(row.share_basis_points!==undefined)require(integer(row.share_basis_points)&&BigInt(row.share_basis_points)===(total?(BigInt(row.total_cents)*10000n+total/2n)/total:0n));
      }
      require(n===count&&sum===total);
    };
    groups(p.categories,"key",key=>EXPENSE_CATEGORIES.includes(key));groups(p.methods,"key",key=>METHODS.includes(key));
    groups(p.daily,"date",validDay);groups(p.weekdays,"key",key=>/^[1-7]$/.test(key));
    require(Array.isArray(p.frequent)&&p.frequent.length<=5&&BigInt(p.frequent.length)<=BigInt(p.frequent_group_count));
    let freqCount=0n,freqTotal=0n;
    for(const row of p.frequent){require(typeof row.description==="string"&&row.description.length<=320&&integer(row.count)&&BigInt(row.count)>=2n&&integer(row.total_cents));freqCount+=BigInt(row.count);freqTotal+=BigInt(row.total_cents);}
    require(freqCount<=count&&freqTotal<=total);
    require(Array.isArray(p.largest)&&p.largest.length<=5&&BigInt(p.largest.length)<=count);
    for(const row of p.largest){
      require(/^[a-f0-9-]{36}$/i.test(row.id||"")&&!usedIds.has(row.id)&&typeof row.version==="string"&&row.version.length<=64
        &&typeof row.note==="string"&&row.note.length<=320&&integer(row.amount_cents)&&BigInt(row.amount_cents)>0n&&BigInt(row.amount_cents)<=total
        &&EXPENSE_CATEGORIES.includes(row.category)&&validDay(row.date)&&row.date>=from&&row.date<=to
        &&(row.time===null||/^([01]\d|2[0-3]):[0-5]\d:00$/.test(row.time))&&(row.payment_method===null||METHODS.includes(row.payment_method)));
      usedIds.add(row.id);
    }
    return p;
  }
  const current=period(value.current,s.date_from,s.date_to),previous=period(value.previous,s.previous_from,s.previous_to),c=value.comparison;
  require(c&&signed(c.delta_cents)&&BigInt(c.delta_cents)===BigInt(current.total_cents)-BigInt(previous.total_cents)&&Array.isArray(c.categories));
  const base=BigInt(previous.total_cents),delta=BigInt(c.delta_cents),abs=delta<0n?-delta:delta;
  require(base===0n?c.change_basis_points===null:signed(c.change_basis_points)&&BigInt(c.change_basis_points)===(delta<0n?-1n:1n)*((abs*10000n+base/2n)/base));
  const keys=new Set([...current.categories,...previous.categories].map(row=>row.key)),seen=new Set();let sum=0n;
  for(const row of c.categories){require(keys.has(row.key)&&!seen.has(row.key)&&integer(row.current_cents)&&integer(row.previous_cents)&&signed(row.delta_cents));seen.add(row.key);
    require(row.current_cents===(current.categories.find(item=>item.key===row.key)?.total_cents||"0")&&row.previous_cents===(previous.categories.find(item=>item.key===row.key)?.total_cents||"0")
      &&BigInt(row.delta_cents)===BigInt(row.current_cents)-BigInt(row.previous_cents));sum+=BigInt(row.delta_cents);}
  require(seen.size===keys.size&&sum===delta);
  return {schema:value.schema,currency:value.currency,timezone:value.timezone,data_version:value.data_version,scope:s,current,previous,comparison:c};
}
