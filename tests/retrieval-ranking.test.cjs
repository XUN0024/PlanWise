const test=require('node:test'),assert=require('node:assert/strict');
const fixture=require('./fixtures/retrieval-relevance.json'),observed=require('./fixtures/retrieval-observed-cosines.json');
let ranking,retrieval;
test.before(async()=>{ranking=await import('../supabase/functions/ask-planwise/retrieval-ranking.mjs');retrieval=await import('../supabase/functions/ask-planwise/retrieval.mjs');});
test('only whole acronyms/codes get the protected tier; ordinary English and partial identifiers retain normal lexical weight',()=>{
 for(const [term,text,expected] of [['TAI','TAI课程',true],['tai','TAI course',true],['CS401','CS401 notes',true],['cs401','cs401 course',true],['TAI-101','TAI-101课',true],['campus','Grab ride to campus',false],['2026','Expenses in 2026',false],['TAI','detail',false],['TAI','preTAI',false],['TAI','TAI2',false],['[','[regex]',false],[null,'anything',false]])assert.equal(ranking.isProtectedIdentifier(term,text),expected,JSON.stringify([term,text]));
 const terms=retrieval.retrievalTerms('campus 食堂 lunch expenses');
 const result=ranking.rankRetrievalCandidates([{id:'a-travel',text:'Grab ride to campus\nTransport',similarity:.4956181147498445},{id:'z-lunch',text:'校园食堂午餐\nFood',similarity:.7349395740633602}],terms);
 assert.equal(result.hybrid[0].id,'z-lunch');assert.ok(result.hybrid.every(r=>!r.identifier));
});
test('replaying the nine recorded provider score sets ranks all expected sources first, while retaining visible false positives',()=>{
 let keywordFirst=0,hybridFirst=0,extraCandidates=0;
 for(const q of fixture.queries){
  const saved=observed.cases.find(c=>c.id===q.id);assert.equal(saved.query,q.query);assert.deepEqual(saved.expected,q.expected);
  const scores=new Map(saved.cosines.map(r=>[r.id,r.similarity]));
  const candidates=fixture.records.filter(r=>r.kind===q.kind).map(r=>({...r,similarity:scores.get(r.id)}));assert.ok(candidates.every(r=>Number.isFinite(r.similarity)));
  const result=ranking.rankRetrievalCandidates(candidates,retrieval.retrievalTerms(q.query));
  if(q.expected.includes(result.keyword[0]?.id))keywordFirst++;
  if(q.expected.includes(result.hybrid[0]?.id))hybridFirst++;
  extraCandidates+=result.hybrid.filter(r=>!q.expected.includes(r.id)).length;
 }
 assert.equal(keywordFirst,4);assert.equal(hybridFirst,9);assert.equal(extraCandidates,6);
});
