import { EXPENSE_CATEGORIES, malaysiaDay, validDay, decimalCents, centsDecimal } from "./expense-report.mjs";
export const EXPENSE_METHODS=["cash","debit_card","credit_card","bank_transfer","e_wallet","other","unrecorded"];
const fail=(code="AI_EXPENSE_INPUT_INVALID")=>{throw Object.assign(new Error(code),{code,status:400});};
const integer=v=>typeof v==="string"&&/^(0|[1-9]\d{0,39})$/.test(v);
const signed=v=>typeof v==="string"&&/^-?(0|[1-9]\d{0,39})$/.test(v);
export const dateAdd=(date,days)=>new Date(Date.parse(date+"T00:00:00Z")+days*86400000).toISOString().slice(0,10);
export function monthStart(year,month){return `${year}-${String(month).padStart(2,"0")}-01`;}
export const monthEnd=(year,month)=>dateAdd(month===12?monthStart(year+1,1):monthStart(year,month+1),-1);
export function shiftMonth(date,amount){const [y,m,d]=date.split("-").map(Number),index=y*12+m-1+amount,year=Math.floor(index/12),month=index%12+1;return `${monthStart(year,month).slice(0,7)}-${String(Math.min(d,Number(monthEnd(year,month).slice(8)))).padStart(2,"0")}`;}
export function expensePreset(preset,time=Date.now()){
  const today=malaysiaDay(time),[year,month]=today.split("-").map(Number),start=monthStart(year,month);
  if(preset==="all")return{from:"",to:""};
  if(preset==="this_month")return{from:start,to:monthEnd(year,month)};
  if(preset==="last_month"){const from=shiftMonth(start,-1);return{from,to:dateAdd(start,-1)};}
  if(preset==="last_3_months")return{from:shiftMonth(start,-2),to:monthEnd(year,month)};
  if(preset==="this_year")return{from:monthStart(year,1),to:monthEnd(year,12)};
  if(preset==="this_quarter"){const first=Math.floor((month-1)/3)*3+1;return{from:monthStart(year,first),to:monthEnd(year,first+2)};}
  return{from:today,to:today};
}
export const defaultExpenseRange=()=>({type:"expenses",from:"",to:"",comparison:"none",compareFrom:"",compareTo:"",granularity:"auto",category:"",paymentMethod:"",search:"",smallAmount:"20.00",minAmount:"",maxAmount:""});
export function amountCents(value){if(typeof value!=="string"||!/^\d{1,12}(\.\d{1,2})?$/.test(value))fail();const [a,b=""]=value.split(".");return BigInt(a)*100n+BigInt(b.padEnd(2,"0"));}
export function validateExpenseRange(value,derived=false){
  const keys=["type","from","to","comparison","compareFrom","compareTo","granularity","category","paymentMethod","search","smallAmount","minAmount","maxAmount",...(derived?["action"]:[])];
  if(!value||value.type!==(derived?"expenses_range":"expenses")||Object.keys(value).some(key=>!keys.includes(key)))fail();
  const out={...defaultExpenseRange(),...value};
  if(![out.from,out.to,out.compareFrom,out.compareTo].every(v=>typeof v==="string"&&(v===""||(validDay(v)&&v>="1900-01-01")))||(out.from&&out.to&&out.from>out.to)
    ||!["none","previous","custom"].includes(out.comparison)||!["auto","day","month"].includes(out.granularity)
    ||!EXPENSE_CATEGORIES.includes(out.category)&&out.category!==""||!EXPENSE_METHODS.includes(out.paymentMethod)&&out.paymentMethod!==""
    ||typeof out.search!=="string"||Array.from(out.search).length>1000||out.search.includes("\0")
    ||(out.comparison==="custom"&&(!out.compareFrom||!out.compareTo||out.compareFrom>out.compareTo))
    ||(out.comparison!=="custom"&&(out.compareFrom||out.compareTo)))fail();
  out.smallAmount=centsDecimal(decimalCents(out.smallAmount));out.search=out.search.trim();
  for(const key of ["minAmount","maxAmount"])if(out[key]!=="")out[key]=centsDecimal(amountCents(out[key]));
  if(out.minAmount&&out.maxAmount&&amountCents(out.minAmount)>amountCents(out.maxAmount))fail();
  if(derived&&!["count","review","trend","compare"].includes(out.action))fail();
  return out;
}
export function legacyExpenseRange(ref){return ref.month?{...defaultExpenseRange(),from:ref.month+"-01",to:monthEnd(...ref.month.split("-").map(Number)),comparison:"previous",category:ref.category||"",search:ref.search||"",smallAmount:ref.smallAmount||"20.00"}:validateExpenseRange(ref);}
export function previousExpenseRange(context,actualFrom,asOf){
  if(context.comparison==="none")return null;
  if(context.comparison==="custom")return{from:context.compareFrom,to:context.compareTo<asOf?context.compareTo:asOf};
  const from=context.from||actualFrom,to=context.to&&context.to<asOf?context.to:asOf;
  if(context.from&&context.to&&from.endsWith("-01")&&context.to===monthEnd(...context.to.slice(0,7).split("-").map(Number))){
    const [a,b]=from.split("-").map(Number),[c,d]=context.to.split("-").map(Number),months=(c-a)*12+d-b+1,end=dateAdd(from,-1),shifted=shiftMonth(to,-months);
    return{from:shiftMonth(from,-months),to:to===context.to?end:shifted<end?shifted:end};
  }
  return{from:dateAdd(from,-Math.round((Date.parse(to)-Date.parse(from))/86400000)-1),to:dateAdd(from,-1)};
}
export function validateRangeStatistics(value,from,to){
  const bad=()=>fail("AI_EXPENSE_DATA_INVALID");
  if(!value||![value.count,value.total_cents,value.average_cents].every(integer)||!["day","month"].includes(value.granularity))bad();
  const count=BigInt(value.count),total=BigInt(value.total_cents);
  if(total<count||(count===0n&&total!==0n)||BigInt(value.average_cents)!==(count?(total+count/2n)/count:0n))bad();
  for(const [name,field,test]of [["categories","key",key=>EXPENSE_CATEGORIES.includes(key)],["methods","key",key=>EXPENSE_METHODS.includes(key)],["trend","date",day=>validDay(day)&&(value.granularity!=="month"||day.endsWith("-01"))]]){
    if(!Array.isArray(value[name])||value[name].length>(name==="trend"?731:8))bad();
    let sum=0n,n=0n;const seen=new Set();let previous="";
    for(const row of value[name]){
      if(!row||!test(row[field])||seen.has(row[field])||!integer(row.count)||!integer(row.total_cents))bad();
      const amount=BigInt(row.total_cents),rows=BigInt(row.count);
      if(amount<rows||(rows===0n&&amount!==0n)||(name!=="trend"&&rows===0n))bad();
      if(name==="trend"&&(row.date< (value.granularity==="month"?from.slice(0,7)+"-01":from)||row.date>to||row.date<=previous))bad();
      previous=row[field];seen.add(row[field]);sum+=amount;n+=rows;
    }
    if(sum!==total||n!==count)bad();
  }
  return value;
}
export function validateExpenseRangeReport(value,context,owner){
  const bad=()=>fail("AI_EXPENSE_DATA_INVALID"),s=value?.scope;
  if(value?.schema!=="expenses-range-v1"||value.currency!=="MYR"||value.timezone!=="Asia/Kuala_Lumpur"||!/^[a-f0-9]{32}$/.test(value.data_version||"")||(owner&&value.owner_id!==owner)||!s)bad();
  if(s.requested_from!==(context.from||null)||s.requested_to!==(context.to||null)||![s.date_from,s.date_to,s.as_of].every(validDay)||s.date_from>s.date_to||s.date_to>s.as_of
    ||(context.from&&s.date_from!==context.from)||(context.to&&s.date_to!==(context.to<s.as_of?context.to:s.as_of))
    ||s.comparison!==context.comparison||s.granularity!==context.granularity||typeof s.partial!=="boolean"||s.partial!==!!(context.to&&context.to>s.as_of)
    ||s.small_amount_cents!==String(decimalCents(context.smallAmount))||["category","search","paymentMethod","minAmount","maxAmount"].some(key=>(s[key]||"")!==(context[key]||"")))bad();
  const ids=new Set();
  const period=(p,from,to)=>{
    validateRangeStatistics(p,from,to);
    const days=BigInt(Math.round((Date.parse(to)-Date.parse(from))/86400000)+1),total=BigInt(p.total_cents),count=BigInt(p.count);
    const unit=context.granularity==="auto"?(days>93n?"month":"day"):context.granularity;
    if(p.granularity!==unit||(context.category&&p.categories.some(row=>row.key!==context.category))||(context.paymentMethod&&p.methods.some(row=>row.key!==context.paymentMethod)))bad();
    const buckets=[];for(let d=unit==="month"?from.slice(0,7)+"-01":from;d<=to;d=unit==="month"?shiftMonth(d,1):dateAdd(d,1)){buckets.push(d);if(buckets.length>731)bad();}
    if(p.trend.length!==buckets.length||p.trend.some((row,index)=>row.date!==buckets[index]))bad();
    if(!integer(p.days)||BigInt(p.days)!==days||!integer(p.daily_average_cents)||BigInt(p.daily_average_cents)!==(total+days/2n)/days
      ||!p.small||![p.small.count,p.small.total_cents,p.small.share_basis_points].every(integer)||BigInt(p.small.count)>count||BigInt(p.small.total_cents)>total
      ||BigInt(p.small.share_basis_points)!==(total?(BigInt(p.small.total_cents)*10000n+total/2n)/total:0n)||!Array.isArray(p.largest)||p.largest.length>5||BigInt(p.largest.length)>count)bad();
    const local=new Set();
    for(const row of p.largest){if(!row||! /^[a-f0-9-]{36}$/i.test(row.id||"")||local.has(row.id)||typeof row.version!=="string"||row.version.length>64||typeof row.note!=="string"||Array.from(row.note).length>160
      ||!integer(row.amount_cents)||BigInt(row.amount_cents)<1n||BigInt(row.amount_cents)>total||!validDay(row.date)||row.date<from||row.date>to||!EXPENSE_CATEGORIES.includes(row.category))bad();local.add(row.id);ids.add(row.id);}
    return p;
  };
  const current=period(value.current,s.date_from,s.date_to);
  if(context.comparison==="none"){if(value.previous!==null||value.comparison!==null||s.previous_from!==null||s.previous_to!==null)bad();}
  else{
    if(![s.previous_from,s.previous_to].every(validDay)||s.previous_from>s.previous_to||s.previous_to>s.as_of)bad();
    const expected=previousExpenseRange(context,s.date_from,s.as_of);
    if(s.previous_from!==expected.from||s.previous_to!==expected.to)bad();
    const previous=period(value.previous,s.previous_from,s.previous_to),c=value.comparison;
    const delta=BigInt(current.total_cents)-BigInt(previous.total_cents),base=BigInt(previous.total_cents),abs=delta<0n?-delta:delta;
    if(!c||!signed(c.delta_cents)||BigInt(c.delta_cents)!==delta||!signed(c.count_delta)||BigInt(c.count_delta)!==BigInt(current.count)-BigInt(previous.count)
      ||(base===0n?c.change_basis_points!==null:!signed(c.change_basis_points)||BigInt(c.change_basis_points)!==(delta<0n?-1n:1n)*((abs*10000n+base/2n)/base)))bad();
    const keys=new Set([...current.categories,...previous.categories].map(row=>row.key));
    if(!Array.isArray(c.categories)||c.categories.length!==keys.size||new Set(c.categories.map(row=>row.key)).size!==keys.size)bad();
    for(const row of c.categories){const a=current.categories.find(item=>item.key===row.key)?.total_cents||"0",b=previous.categories.find(item=>item.key===row.key)?.total_cents||"0";
      if(!keys.has(row.key)||row.current_cents!==a||row.previous_cents!==b||!signed(row.delta_cents)||BigInt(row.delta_cents)!==BigInt(a)-BigInt(b))bad();}
  }
  return{schema:value.schema,currency:value.currency,timezone:value.timezone,data_version:value.data_version,scope:s,current,previous:value.previous,comparison:value.comparison};
}
export const rangeSources=report=>[...report.current.largest,...(report.previous?.largest||[])].map(row=>({type:"expense",id:row.id,version:row.version,title:row.note,date:row.date,amount_cents:row.amount_cents})).filter((row,index,rows)=>rows.findIndex(item=>item.id===row.id)===index);
