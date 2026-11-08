import { malaysiaDay, validDay } from "./expense-report.mjs";
import { validateExpenseRange, legacyExpenseRange, expensePreset, dateAdd, monthStart, monthEnd, shiftMonth, previousExpenseRange } from "./expense-range.mjs";
const fail=(code="AI_EXPENSE_DATE_AMBIGUOUS")=>{throw Object.assign(new Error(code),{code,status:400});};
const MONTHS="Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";
const monthNumber=name=>["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"].indexOf(name.toLowerCase().slice(0,3))+1;
const chineseMonth={一:1,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10,十一:11,十二:12};
export function expenseDateSpans(question,time=Date.now()){
  const today=malaysiaDay(time),year=Number(today.slice(0,4)),years=[...new Set(question.match(/\b(?:19|20)\d{2}\b/g)||[])],defaultYear=years.length===1?Number(years[0]):year,spans=[];
  const add=(match,from,to,kind)=>{if(!validDay(from)||!validDay(to)||from<"1900-01-01"||from>to)fail();if(!spans.some(item=>match.index<item.end&&match.index+match[0].length>item.start))spans.push({start:match.index,end:match.index+match[0].length,from,to,kind});};
  const scan=(pattern,make)=>{for(const match of question.matchAll(pattern)){const item=make(match);if(item)add(match,item.from,item.to,item.kind);}};
  const day=(y,m,d)=>{if(Number(m)<1||Number(m)>12||Number(d)<1||Number(d)>31)fail();const value=monthStart(Number(y),Number(m)).slice(0,7)+"-"+String(d).padStart(2,"0");return{from:value,to:value,kind:"day"};};
  const month=(y,m)=>{if(Number(m)<1||Number(m)>12)fail();return{from:monthStart(Number(y),Number(m)),to:monthEnd(Number(y),Number(m)),kind:"month"};};
  const quarter=(y,q)=>({from:monthStart(Number(y),(Number(q)-1)*3+1),to:monthEnd(Number(y),Number(q)*3),kind:"quarter"});
  scan(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/g,m=>day(m[1],m[2],m[3]));
  scan(/(\d{4})年(\d{1,2})月(\d{1,2})日/g,m=>day(m[1],m[2],m[3]));
  scan(new RegExp("\\b("+MONTHS+")\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b","gi"),m=>day(m[3]||defaultYear,monthNumber(m[1]),m[2]));
  scan(new RegExp("\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+("+MONTHS+")\\.?\\s+(\\d{4})\\b","gi"),m=>day(m[3],monthNumber(m[2]),m[1]));
  scan(/\b(\d{4})\s*Q([1-4])\b/gi,m=>quarter(m[1],m[2]));
  scan(/\bQ([1-4])(?:\s+(\d{4}))?\b/gi,m=>quarter(m[2]||defaultYear,m[1]));
  scan(/(?:(\d{4})年)?第?([一二三四1-4])季度/g,m=>quarter(m[1]||defaultYear,chineseMonth[m[2]]||m[2]));
  scan(/\b(\d{4})[-/](\d{1,2})\b/g,m=>month(m[1],m[2]));
  scan(new RegExp("\\b("+MONTHS+")\\.?(?:\\s+(\\d{4}))?\\b","gi"),m=>m[1].toLowerCase()==="may"&&!m[2]&&/^\s+(?:i|we|you|it)\b/i.test(question.slice(m.index+m[0].length))?null:month(m[2]||defaultYear,monthNumber(m[1])));
  scan(new RegExp("\\b(\\d{4})\\s+("+MONTHS+")\\.?\\b","gi"),m=>month(m[1],monthNumber(m[2])));
  scan(/(?:(\d{4})年)?(十二|十一|十|[一二三四五六七八九]|1[0-2]|0?[1-9])月/g,m=>month(m[1]||defaultYear,chineseMonth[m[2]]||m[2]));
  scan(/(?:last|past)\s+(\d{1,3})\s+months?\b|(?:近|过去)(\d{1,3})个?月/gi,m=>{const n=Number(m[1]||m[2]);if(!n)fail();return{from:shiftMonth(today.slice(0,7)+"-01",1-n),to:monthEnd(year,Number(today.slice(5,7))),kind:"range"};});
  scan(/(?:last|past)\s+(\d{1,3})\s+days?\b|(?:近|过去)(\d{1,3})天/gi,m=>{const n=Number(m[1]||m[2]);if(!n)fail();return{from:dateAdd(today,1-n),to:today,kind:"range"};});
  const relative=[[/\bthis month\b|本月|这个月/gi,"this_month"],[/\blast month\b|上个月|上月/gi,"last_month"],[/\bthis year\b|今年/gi,"this_year"],[/\bthis quarter\b|本季度|这个季度/gi,"this_quarter"]];
  for(const [pattern,preset]of relative)scan(pattern,()=>({...expensePreset(preset,time),kind:preset}));
  scan(/\blast year\b|去年/gi,()=>({from:monthStart(year-1,1),to:monthEnd(year-1,12),kind:"year"}));
  scan(/\blast quarter\b|上季度|上个季度/gi,()=>{const current=expensePreset("this_quarter",time);return{from:shiftMonth(current.from,-3),to:dateAdd(current.from,-1),kind:"quarter"};});
  scan(/\b(?:this|last) week\b|本周|这周|上周/gi,m=>{const weekday=new Date(today+"T00:00:00Z").getUTCDay(),monday=dateAdd(today,-((weekday+6)%7)),from=/last|上/.test(m[0])?dateAdd(monday,-7):monday;return{from,to:dateAdd(from,6),kind:"week"};});
  scan(/\byesterday\b|昨天/gi,()=>({from:dateAdd(today,-1),to:dateAdd(today,-1),kind:"day"}));
  scan(/\btoday\b|今天/gi,()=>({from:today,to:today,kind:"day"}));
  if(!spans.length)scan(/\b((?:19|20)\d{2})\b|((?:19|20)\d{2})年/g,m=>{
    if(/(?:RM|MYR|USD|\$|at least|at most|over|under|above|below|超过|低于|不少于|最低|最高)\s*$/i.test(question.slice(0,m.index))||/^[.,]\d/.test(question.slice(m.index+m[0].length)))return null;
    return{from:monthStart(Number(m[1]||m[2]),1),to:monthEnd(Number(m[1]||m[2]),12),kind:"year"};
  });
  if(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/.test(question))fail();
  const temporalText=question.replace(/\bmay\s+(?:i|we|you|it)\b/gi,"");
  if(!spans.length&&(new RegExp("\\b(?:"+MONTHS+")","i").test(temporalText)||/\bQ\d\b|\d+月|\d{4}[-/]\d/.test(temporalText)))fail();
  return spans.sort((a,b)=>a.start-b.start);
}
export function resolveExpenseQuery(question,reference,time=Date.now(),explicit=false){
  const base=legacyExpenseRange(reference),spans=expenseDateSpans(question,time),today=malaysiaDay(time);
  const compare=/\b(?:compare|comparison|versus|vs|than)\b|period changes|对比|比较|相比|比上月|同比|环比/i.test(question);
  const trend=/trend|over time|by month|each month|per month|monthly|趋势|走势|每月|按月|历月/i.test(question);
  const count=/how many|number of (?:expenses|records|transactions)|expense count|多少(?:笔|条)|几笔|记录数量/i.test(question);
  if(compare&&!spans.length&&!base.from&&!base.to&&base.comparison==="none")fail();
  if(spans.length>2)fail();
  const context={...base,type:"expenses_range",action:compare?"compare":trend?"trend":count?"count":"review"};
  const contains=span=>(!base.from||span.from>=base.from)&&(!base.to||span.to<=base.to);
  if(spans.length){
    const joined=/\b(?:from|between)\b.*\b(?:to|through|until|and)\b|从.*(?:到|至)/i.test(question);
    const versus=/\b(?:vs|versus|with|against|than)\b|相比|(?:比较|对比).*(?:与|和)/i.test(question);
    if(spans.length===2&&compare&&(!joined||versus)){
      const baseline=previousExpenseRange(base,base.from||spans[0].from,today);
      const baselineContains=baseline&&spans[1].from>=baseline.from&&spans[1].to<=baseline.to;
      if(explicit&&(!contains(spans[0])||(!contains(spans[1])&&!baselineContains)))fail("AI_EXPENSE_SCOPE_MISMATCH");
      context.from=spans[0].from;context.to=spans[0].to;context.comparison="custom";context.compareFrom=spans[1].from;context.compareTo=spans[1].to;
      const adjacent=previousExpenseRange({...context,comparison:"previous",compareFrom:"",compareTo:""},context.from,context.to);
      if(adjacent.from===spans[1].from&&adjacent.to===spans[1].to){context.comparison="previous";context.compareFrom="";context.compareTo="";}
    }else{
      const span={from:spans[0].from,to:spans.at(-1).to};
      if(explicit&&!contains(span))fail("AI_EXPENSE_SCOPE_MISMATCH");
      context.from=span.from;context.to=span.to;
    }
  }
  if(compare&&context.comparison==="none")context.comparison="previous";
  if(context.comparison!=="none")context.action="compare";
  if(explicit&&context.comparison!=="none"&&context.from){
    const requested=previousExpenseRange(context,context.from,today),allowed=previousExpenseRange(base,base.from||context.from,today);
    if(!contains(requested)&&!(allowed&&requested.from>=allowed.from&&requested.to<=allowed.to))fail("AI_EXPENSE_SCOPE_MISMATCH");
  }
  if(/by month|each month|per month|monthly|每月|按月|历月/i.test(question))context.granularity="month";
  if(context.from&&context.from>today||context.compareFrom&&context.compareFrom>today)fail("AI_EXPENSE_INPUT_INVALID");
  return validateExpenseRange(context,true);
}
