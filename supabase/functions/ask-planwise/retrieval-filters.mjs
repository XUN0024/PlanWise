import { expenseDateSpans } from "./expense-query.mjs";
import { retrievalTerms } from "./retrieval.mjs";
const fail=()=>{throw Object.assign(new Error("AI_SCOPE_INVALID"),{code:"AI_SCOPE_INVALID",status:400});};
export function taskRetrievalFilter(filter,question,now){
 const result={...filter},spans=expenseDateSpans(question,now);
 if(spans.length>2)fail();
 if(spans.length){const from=spans[0].from,to=spans.at(-1).to;if(filter.from&&from<filter.from||filter.to&&to>filter.to)fail();result.from=from;result.to=to;}
 for(const [pattern,priority] of [[/高优先级|high.priority/i,'High'],[/中优先级|medium.priority/i,'Medium'],[/低优先级|low.priority/i,'Low']])if(pattern.test(question)){if(filter.priority&&filter.priority!==priority)fail();result.priority=priority;}
 const state=/未完成|没有完成|没做完|unfinished|incomplete/i.test(question)?'unfinished':/已完成|\bcompleted\b/i.test(question)?'completed':null;
 if(state){if(filter.status!=='all'&&filter.status!==state)fail();result.status=state;}
 return result;
}
export function taskHasTopic(question,now){
 let text=question;
 for(const span of expenseDateSpans(question,now).slice().reverse())text=text.slice(0,span.start)+' '+text.slice(span.end);
 text=text.replace(/未完成|已完成|没有完成|没做完|高优先级|中优先级|低优先级|一共|总共|多少(?:个|项|条)?|数量|总数|全部|所有|还|有|个|项/g,' ');
 const filters=new Set('unfinished incomplete completed high medium low priority reminder reminders date dates today yesterday due'.split(' '));
 return retrievalTerms(text).some(t=>!filters.has(t.toLowerCase()));
}
export function expenseHasTopic(question,now){
 let text=question;
 for(const span of expenseDateSpans(question,now).slice().reverse())text=text.slice(0,span.start)+' '+text.slice(span.end);
 text=text.replace(/(?:at least|at most|over|above|under|below|不超过|超过|低于|不少于|最低|最高)\s*(?:RM|MYR)?\s*\d+(?:\.\d+)?/gi,' ')
  .replace(/(?:category|分类)\s*[:：=为是]?\s*(?:Food|Transport|Bills|Entertainment|Shopping|Health|Other|餐饮|交通|账单|娱乐|购物|健康|其他)/gi,' ')
  .replace(/\b(?:cash|debit card|credit card|bank transfer|e.wallet)\b|现金|借记卡|信用卡|银行转账|电子钱包/gi,' ')
  .replace(/分析|回顾|比较|对比|相比|趋势|走势|每月|按月|历月|花了|花多少|花费|花销|开销|开支|费用|付款|多少(?:笔|条|钱)?|总额|总共|一共|数量|平均|合计|哪里|多花|有什么变化|比|有|在|都|了/g,' ');
 const generic=new Set('analyze analyse review explain compare comparison versus vs than trend trends over time by month monthly per each day daily current previous last average count number sum money much transactions transaction changes change difference most less more paid pay costs cost bills bill as of total amount amounts recorded record'.split(' '));
 return retrievalTerms(text).some(term=>!generic.has(term.toLowerCase()));
}
export function expenseRetrievalFilter(filter,question){
 const result={...filter};
 // Only explicit field names are parsed. Concepts such as commuting remain semantic.
 const categories={food:'Food',transport:'Transport',bills:'Bills',entertainment:'Entertainment',shopping:'Shopping',health:'Health',other:'Other',餐饮:'Food',交通:'Transport',账单:'Bills',娱乐:'Entertainment',购物:'Shopping',健康:'Health',其他:'Other'};
 const category=question.match(/(?:category\s*[:=]?\s*|分类\s*[:：为是]?\s*)(Food|Transport|Bills|Entertainment|Shopping|Health|Other|餐饮|交通|账单|娱乐|购物|健康|其他)/i);
 if(category){const value=categories[category[1].toLowerCase()];if(filter.category&&filter.category!==value)fail();result.category=value;}
 const methods=[[/\bcash\b|现金/i,'cash'],[/\bdebit card\b|借记卡/i,'debit_card'],[/\bcredit card\b|信用卡/i,'credit_card'],[/\bbank transfer\b|银行转账/i,'bank_transfer'],[/\be.wallet\b|电子钱包/i,'e_wallet']];
 const matches=methods.filter(([p])=>p.test(question));if(matches.length>1)fail();
 if(matches.length){const value=matches[0][1];if(filter.paymentMethod&&filter.paymentMethod!==value)fail();result.paymentMethod=value;}
 for(const [key,pattern] of [['minAmount',/(at least|over|above|(?<!不)超过|不少于|最低)\s*(?:RM|MYR)?\s*(\d+(?:\.\d+)?)/i],['maxAmount',/(at most|under|below|低于|不超过|最高)\s*(?:RM|MYR)?\s*(\d+(?:\.\d+)?)/i]]){
  const match=question.match(pattern);if(match){
   if(!/^\d{1,12}(?:\.\d{1,2})?$/.test(match[2]))fail();
   const [whole,fraction='']=match[2].split('.');let cents=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
   if(/^(over|above|超过)$/i.test(match[1]))cents+=1n;
   if(/^(under|below|低于)$/i.test(match[1]))cents-=1n;
   if(cents<0n||cents>99999999999999n)fail();
   const value=`${cents/100n}.${String(cents%100n).padStart(2,'0')}`;
   if(key==='minAmount'&&filter.minAmount&&Number(value)<Number(filter.minAmount)||key==='maxAmount'&&filter.maxAmount&&Number(value)>Number(filter.maxAmount))fail();result[key]=value;
  }
 }
 if(result.minAmount&&result.maxAmount&&Number(result.minAmount)>Number(result.maxAmount))fail();
 return result;
}
