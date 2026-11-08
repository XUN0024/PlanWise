// Pure benchmark helpers. Keep identifier semantics aligned with pw_search_identifier SQL.
// Ordinary words retain lexical RRF weight; only acronyms/codes get the protected tier.
export function isProtectedIdentifier(term,text){
 if(typeof term!=="string"||!/^[A-Za-z0-9_-]{2,32}$/.test(term))return false;
 const boundary=value=>`(^|[^A-Za-z0-9_])${value}([^A-Za-z0-9_]|$)`;
 if(!new RegExp(boundary(term),"i").test(text||""))return false;
 return /^[A-Z]{2,16}$/.test(term)
  ||(/[A-Za-z]/.test(term)&&/[0-9]/.test(term))
  ||(/^[A-Za-z]{2,16}$/.test(term)&&new RegExp(boundary(term.toUpperCase())).test(text||""));
}
export function rankRetrievalCandidates(records,terms,threshold=0.42){
 const candidates=records.map(r=>({...r,lexical:terms.filter(t=>r.text.toLowerCase().includes(t.toLowerCase())).length,
  identifier:terms.some(t=>isProtectedIdentifier(t,r.text))}));
 const byId=(a,b)=>a.id<b.id?-1:a.id>b.id?1:0;
 const keyword=candidates.filter(r=>r.lexical>0).sort((a,b)=>b.lexical-a.lexical||byId(a,b));
 const semantic=candidates.filter(r=>r.similarity>=threshold).sort((a,b)=>b.similarity-a.similarity||byId(a,b));
 const hybrid=candidates.filter(r=>r.lexical||r.similarity>=threshold).map(r=>({...r,
  score:(r.lexical?1/(61+keyword.indexOf(r)):0)+(r.similarity>=threshold?1/(61+semantic.indexOf(r)):0)}))
  .sort((a,b)=>Number(b.identifier)-Number(a.identifier)||b.score-a.score
   ||(Number.isFinite(b.similarity)?b.similarity:-Infinity)-(Number.isFinite(a.similarity)?a.similarity:-Infinity)
   ||b.lexical-a.lexical||byId(a,b));
 return{keyword,hybrid};
}
