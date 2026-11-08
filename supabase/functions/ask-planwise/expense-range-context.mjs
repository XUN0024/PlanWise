import { malaysiaDay } from "./expense-report.mjs";
import { validateExpenseRangeReport } from "./expense-range.mjs";
import { expenseDateSpans } from "./expense-query.mjs";
export async function readExpenseRange(options){
  const {context,url,userId,authorization,publicKey,fetchImpl,readJson,now}=options,asOf=malaysiaDay(now());
  const fail=(code,status=503)=>Object.assign(new Error(code),{code,status});
  let response;try{response=await fetchImpl(url+"/rest/v1/rpc/get_expense_range_insights",{method:"POST",headers:{Authorization:authorization,apikey:publicKey,"Content-Type":"application/json"},
    body:JSON.stringify({p_from:context.from||null,p_to:context.to||null,p_comparison:context.comparison,p_compare_from:context.compareFrom||null,p_compare_to:context.compareTo||null,
      p_granularity:context.granularity,p_small:context.smallAmount,p_category:context.category||null,p_payment:context.paymentMethod||null,p_search:context.search||null,p_min:context.minAmount||null,p_max:context.maxAmount||null,p_as_of:asOf}),signal:AbortSignal.timeout(15000)});}catch{throw fail("AI_EXPENSE_LOAD_FAILED");}
  if(!response.ok){let error;try{error=await readJson(response,8192);}catch{}
    throw fail(response.status===404?"AI_EXPENSE_RANGE_SETUP_REQUIRED":response.status===401?"AI_AUTH_REQUIRED":response.status===400?(String(error?.message).includes("EXPENSE_RANGE_TOO_WIDE")?"AI_EXPENSE_RANGE_LIMIT":"AI_EXPENSE_INPUT_INVALID"):"AI_EXPENSE_LOAD_FAILED",response.status===401?401:response.status===400?400:503);
  }
  let report;try{report=validateExpenseRangeReport(await readJson(response,1048576),context,userId);}catch{throw fail("AI_EXPENSE_DATA_INVALID",502);}
  if(report.scope.as_of!==asOf)throw fail("AI_EXPENSE_DATA_INVALID",502);return report;
}
const money=cents=>{const n=BigInt(cents),abs=n<0n?-n:n;return(n<0n?"-":"")+"RM "+(abs/100n).toString()+"."+String(abs%100n).padStart(2,"0");};
export function expenseRangeAnswer(report,question){
  const zh=/[\u3400-\u9fff]/.test(question),s=report.scope,p=report.current;
  const lines=[`${s.date_from} → ${s.date_to}`,zh?`已记录 ${p.count} 笔支出，总额 ${money(p.total_cents)}，平均每笔 ${money(p.average_cents)}。`:`There are ${p.count} recorded expenses, totaling ${money(p.total_cents)}. Average per record: ${money(p.average_cents)}.`];
  if(s.partial)lines.push(zh?`本期尚未结束，统计截至 ${s.as_of}。`:`This period is incomplete; figures run through ${s.as_of}.`);
  if(report.previous)lines.push(zh?`对比期间：${s.previous_from} → ${s.previous_to}；${report.previous.count} 笔，${money(report.previous.total_cents)}；净变化 ${money(report.comparison.delta_cents)}。`:`Comparison: ${s.previous_from} → ${s.previous_to}; ${report.previous.count} records, ${money(report.previous.total_cents)}; net change ${money(report.comparison.delta_cents)}.`);
  if(p.count==="0")lines.push(zh?"该范围没有匹配的已记录支出，不代表没有实际消费。":"No matching expenses are recorded for this range; this does not prove no spending occurred.");
  return lines.join("\n\n");
}
export function guardExpenseRangeReply(reply,card,question){
  const report=card.report,scope=report.scope,allowed=[{from:scope.date_from,to:scope.date_to},...(report.previous?[{from:scope.previous_from,to:scope.previous_to}]:[])];
  let unsupported=false;
  try{const spans=expenseDateSpans(reply,Date.parse(scope.as_of+"T00:00:00Z"));unsupported=spans.filter(span=>span.kind!=="year"||/\b(?:in|during|year|from|to|for)\s*$/i.test(reply.slice(0,span.start))||reply.slice(span.start,span.end).endsWith("年")).some(span=>!allowed.some(range=>span.from<=range.to&&span.to>=range.from));}catch{unsupported=true;}
  const plain=reply.replace(/[*_`#]/g,"");
  const totals=[...plain.matchAll(/(?:recorded total|total (?:expenses|spending)|支出总额|总金额)\s*[:：]?\s*(?:RM\s*)?([\d,]+\.\d{2})/gi)];
  const falseTotal=totals.some(match=>BigInt(match[1].replace(/[,.]/g,""))!==BigInt(report.current.total_cents));
  const falseZero=report.current.count!=="0"&&!report.previous&&/no (?:recorded )?expenses|total expenses\s*:\s*(?:RM\s*)?0(?:\.00)?\b|没有.{0,5}(?:账单|支出记录)/i.test(plain);
  const falseComparison=!report.previous&&/quarterly comparison|compares? .{0,30}with|季度对比|正在对比/i.test(plain);
  if(!unsupported&&!falseTotal&&!falseZero&&!falseComparison)return reply;
  const answer=[expenseRangeAnswer(report,question)];
  if(card.action==="trend"&&report.current.trend.length){const rows=report.current.trend.slice(-12);answer.push(rows.map(row=>`${row.date}: ${money(row.total_cents)} · ${row.count}`).join("\n"));}
  return answer.join("\n\n");
}
