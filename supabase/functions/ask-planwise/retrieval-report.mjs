export const retrievalModule=kind=>({note:"notes",task:"tasks",expense:"expenses"}[kind]);
// Shared by Edge and browser result validation. No credentials or network here.
export function validateRetrievalCard(card,context){
 const bad=()=>{throw Object.assign(new Error("AI_WORKSPACE_DATA_INVALID"),{code:"AI_WORKSPACE_DATA_INVALID"});};
 const uuid=/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i,refs=context.references;
 if(card.module!==retrievalModule(card.kind)||!card.module||!["hybrid","keyword"].includes(card.method)||card.exhaustive!==false||typeof card.query!=="string"||card.query.length>4000
  ||!/^[a-f\d]{32}$/.test(card.snapshot||"")
  ||!card.filter||typeof card.filter!=="object"||Array.isArray(card.filter)||!Array.isArray(card.rows)||card.rows.length>8
  ||![card.eligibleCount,card.indexedCount,card.candidateCount].every(n=>Number.isSafeInteger(n)&&n>=0)||card.indexedCount>card.eligibleCount||card.candidateCount>card.eligibleCount||card.rows.length>card.candidateCount
  ||!(card.reason===null||["embedding_not_configured","embedding_budget_limit","embedding_timeout","embedding_rate_limited","embedding_auth_failed","embedding_unavailable","embedding_invalid_response","embedding_invalid_dimensions"].includes(card.reason))
  ||(card.method==="hybrid"&&card.reason!==null)||(card.method==="keyword"&&!card.reason))bad();
 const selected=refs.filter(ref=>ref.type===card.module||(card.kind==="note"&&ref.type==="note"));
 if(refs.length&&!selected.length)bad();
 for(const ref of selected){
  if(ref.type==="note"&&(!Array.isArray(card.filter.ids)||!card.filter.ids.includes(ref.id)))bad();
  if(ref.type==="tasks"){
   if(ref.taskId&&JSON.stringify(card.filter.ids)!==JSON.stringify([ref.taskId]))bad();
   for(const k of ["priority","search"])if(ref[k]&&card.filter[k]!==ref[k])bad();
   if(ref.from&&(!card.filter.from||card.filter.from<ref.from)||ref.to&&(!card.filter.to||card.filter.to>ref.to))bad();
   if(ref.status!=="all"&&card.filter.status!==ref.status)bad();
  }
  if(ref.type==="expenses"){
   // The normal route supplies canonical range refs; legacy month remains handled by its old path.
   for(const k of ["category","paymentMethod","search"])if(ref[k]&&card.filter[k]!==ref[k])bad();
   if(ref.minAmount&&(!card.filter.minAmount||Number(card.filter.minAmount)<Number(ref.minAmount))||ref.maxAmount&&(!card.filter.maxAmount||Number(card.filter.maxAmount)>Number(ref.maxAmount)))bad();
   if(ref.from&&(!card.filter.from||card.filter.from<ref.from)||ref.to&&(!card.filter.to||card.filter.to>ref.to))bad();
   if(ref.month){const [year,month]=ref.month.split('-').map(Number),last=new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);if(!card.filter.from||card.filter.from<ref.month+'-01'||!card.filter.to||card.filter.to>last)bad();}
  }
 }
 if(new Set(card.rows.map(row=>row.id)).size!==card.rows.length)bad();
 for(const row of card.rows){
  if(!uuid.test(row.id||"")||typeof row.title!=="string"||row.title.length>1200||!/^[a-f\d]{32}$/.test(row.version||"")||typeof row.snippet!=="string"||Array.from(row.snippet).length>1400||!row.metadata||typeof row.metadata!=="object")bad();
  if(card.filter.ids&&!card.filter.ids.includes(row.id))bad();
  if(card.kind==="note"&&refs.some(r=>r.type==="note")&&!refs.some(r=>r.type==="note"&&r.id===row.id))bad();
  if(row.subtask_id!==null&&!uuid.test(row.subtask_id||""))bad();
  if(row.chunk_no!==null&&(!Number.isSafeInteger(row.chunk_no)||row.chunk_no<0||!Number.isSafeInteger(row.start_offset)||!Number.isSafeInteger(row.end_offset)||row.start_offset<0||row.end_offset<row.start_offset))bad();
  if(row.similarity!==null&&(typeof row.similarity!=="number"||!Number.isFinite(row.similarity)||row.similarity< -1.001||row.similarity>1.001))bad();
  const m=row.metadata,f=card.filter;
  if(card.kind==="task"&&((f.status&&f.status!=="all"&&m.status!==f.status)||(f.priority&&m.priority!==f.priority)||(f.from&&(!m.reminder_date||m.reminder_date<f.from))||(f.to&&(!m.reminder_date||m.reminder_date>f.to))))bad();
  if(card.kind==="expense"){
   if(!/^\d{4}-\d{2}-\d{2}$/.test(m.date||"")||!/^\d+(\.\d{1,2})?$/.test(m.amount||""))bad();
   if(f.from&&m.date<f.from||f.to&&m.date>f.to||f.category&&m.category!==f.category||f.paymentMethod&&(f.paymentMethod==="unrecorded"?m.payment_method!==null:m.payment_method!==f.paymentMethod))bad();
   const cents=s=>{const [a,b=""]=s.split(".");return BigInt(a)*100n+BigInt(b.padEnd(2,"0"));};
   if(f.minAmount&&cents(m.amount)<cents(f.minAmount)||f.maxAmount&&cents(m.amount)>cents(f.maxAmount))bad();
  }
 }
 return card;
}
export function retrievalSources(card){return card.rows.map(row=>({type:card.kind,id:row.id,title:row.title,version:row.version,snippet:row.snippet,
 chunk_no:row.chunk_no,subtask_id:row.subtask_id,start_offset:row.start_offset,end_offset:row.end_offset,
 ...(card.kind==="expense"?{date:row.metadata.date,amount_cents:(()=>{const [a,b=""]=row.metadata.amount.split(".");return String(BigInt(a)*100n+BigInt(b.padEnd(2,"0")));})()}:{} )}));}
