const old=require("./expense-insight.cjs"),USER=old.USER;
const context=extra=>({type:"expenses_range",from:"2026-10-01",to:"2026-10-31",comparison:"none",compareFrom:"",compareTo:"",granularity:"auto",category:"",paymentMethod:"",search:"",smallAmount:"20.00",minAmount:"",maxAmount:"",action:"review",...extra});
const add=(date,n)=>new Date(Date.parse(date+"T00:00:00Z")+n*86400000).toISOString().slice(0,10);
function period(from,to,ctx,records){
  const all=records||[...old.report().current.largest,...old.report().previous.largest],rows=all.filter(row=>row.date>=from&&row.date<=to&&(!ctx.category||row.category===ctx.category)&&(!ctx.search||row.note.toLowerCase().includes(ctx.search.toLowerCase())));
  const total=rows.reduce((sum,row)=>sum+BigInt(row.amount_cents),0n),count=BigInt(rows.length),days=BigInt((Date.parse(to)-Date.parse(from))/86400000+1),granularity=ctx.granularity==="auto"?(days>93n?"month":"day"):ctx.granularity;
  const groups=key=>[...new Set(rows.map(row=>row[key]))].map(keyValue=>{const group=rows.filter(row=>row[key]===keyValue);return{key:keyValue,count:String(group.length),total_cents:String(group.reduce((sum,row)=>sum+BigInt(row.amount_cents),0n))};});
  const trend=[];for(let date=granularity==="month"?from.slice(0,7)+"-01":from;date<=to;){const group=rows.filter(row=>granularity==="month"?row.date.slice(0,7)===date.slice(0,7):row.date===date);trend.push({date,count:String(group.length),total_cents:String(group.reduce((sum,row)=>sum+BigInt(row.amount_cents),0n))});if(granularity==="day")date=add(date,1);else{const d=new Date(date+"T00:00:00Z");d.setUTCMonth(d.getUTCMonth()+1);date=d.toISOString().slice(0,10);}}
  const small=rows.filter(row=>BigInt(row.amount_cents)<=BigInt(ctx.smallAmount.replace(".",""))),smallTotal=small.reduce((sum,row)=>sum+BigInt(row.amount_cents),0n);
  return{count:String(count),total_cents:String(total),average_cents:String(count?(total+count/2n)/count:0n),days:String(days),daily_average_cents:String((total+days/2n)/days),
    granularity,categories:groups("category"),methods:groups("payment_method"),trend,small:{count:String(small.length),total_cents:String(smallTotal),share_basis_points:String(total?(smallTotal*10000n+total/2n)/total:0n)},largest:rows.slice().sort((a,b)=>Number(BigInt(b.amount_cents)-BigInt(a.amount_cents))).slice(0,5)};
}
function report(ctx=context(),asOf="2026-11-07",records){
  const from=ctx.from||"2026-09-01",to=ctx.to&&ctx.to<asOf?ctx.to:asOf,current=period(from,to,ctx,records);let previous=null,comparison=null,previousFrom=null,previousTo=null;
  if(ctx.comparison!=="none"){
    if(ctx.comparison==="custom"){previousFrom=ctx.compareFrom;previousTo=ctx.compareTo<asOf?ctx.compareTo:asOf;}
    else{const d=new Date(from+"T00:00:00Z");d.setUTCMonth(d.getUTCMonth()-1);previousFrom=d.toISOString().slice(0,10);previousTo=to===ctx.to?add(from,-1):previousFrom.slice(0,8)+to.slice(8);}
    previous=period(previousFrom,previousTo,ctx,records);const delta=BigInt(current.total_cents)-BigInt(previous.total_cents),base=BigInt(previous.total_cents),abs=delta<0n?-delta:delta;
    comparison={delta_cents:String(delta),count_delta:String(BigInt(current.count)-BigInt(previous.count)),change_basis_points:base?String((delta<0n?-1n:1n)*((abs*10000n+base/2n)/base)):null,
      categories:[...new Set([...current.categories,...previous.categories].map(row=>row.key))].map(key=>{const a=current.categories.find(row=>row.key===key)?.total_cents||"0",b=previous.categories.find(row=>row.key===key)?.total_cents||"0";return{key,current_cents:a,previous_cents:b,delta_cents:String(BigInt(a)-BigInt(b))};})};
  }
  return{schema:"expenses-range-v1",owner_id:USER,currency:"MYR",timezone:"Asia/Kuala_Lumpur",data_version:"d".repeat(32),scope:{requested_from:ctx.from||null,requested_to:ctx.to||null,date_from:from,date_to:to,as_of:asOf,partial:!!(ctx.to&&ctx.to>asOf),comparison:ctx.comparison,previous_from:previousFrom,previous_to:previousTo,previous_partial:!!(ctx.comparison==="custom"&&ctx.compareTo>asOf),granularity:ctx.granularity,small_amount_cents:ctx.smallAmount.replace(".",""),category:ctx.category,paymentMethod:ctx.paymentMethod,search:ctx.search,minAmount:ctx.minAmount,maxAmount:ctx.maxAmount},current,previous,comparison};
}
module.exports={USER,context,report};
