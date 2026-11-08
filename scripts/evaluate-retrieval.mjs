// Optional real-model benchmark. Fictional text only; no production records or credentials in report.
// Set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_EMBEDDING_API_TOKEN, PW_EMBEDDINGS_ENABLED=true.
import {readFile,writeFile} from 'node:fs/promises';
import {embedTexts} from '../supabase/functions/_shared/embeddings.mjs';
import {retrievalTerms} from '../supabase/functions/ask-planwise/retrieval.mjs';
import {rankRetrievalCandidates} from '../supabase/functions/ask-planwise/retrieval-ranking.mjs';
const fixture=JSON.parse(await readFile(new URL('../tests/fixtures/retrieval-relevance.json',import.meta.url),'utf8'));
const items=[...fixture.records,...fixture.queries.map(q=>({text:q.query}))],vectors=[];let characters=0;
const started=Date.now();
for(let n=0;n<items.length;n+=8)vectors.push(...await embedTexts(items.slice(n,n+8).map(r=>r.text),{env:k=>process.env[k],reserve:async count=>{characters+=count;return characters<=100000;}}));
const cosine=(a,b)=>a.reduce((s,n,i)=>s+n*b[i],0)/Math.sqrt(a.reduce((s,n)=>s+n*n,0)*b.reduce((s,n)=>s+n*n,0));
const cases=fixture.queries.map((q,i)=>{
 const terms=retrievalTerms(q.query),candidates=fixture.records.map((r,j)=>({...r,similarity:cosine(vectors[j],vectors[fixture.records.length+i])})).filter(r=>r.kind===q.kind);
 const {keyword:keywords,hybrid}=rankRetrievalCandidates(candidates,terms);
 const report=rows=>({ids:rows.slice(0,5).map(r=>r.id),hitAt1:q.expected.includes(rows[0]?.id),recallAt5:q.expected.filter(id=>rows.slice(0,5).some(r=>r.id===id)).length/q.expected.length});
 return{id:q.id,query:q.query,expected:q.expected,keyword:report(keywords),hybrid:report(hybrid),cosines:candidates.map(r=>({id:r.id,similarity:r.similarity}))};
});
const average=(method,metric)=>cases.reduce((s,c)=>s+c[method][metric],0)/cases.length;
const report={model:'@cf/baai/bge-m3',dimensions:1024,threshold:0.42,realProvider:true,at:new Date().toISOString(),elapsedMs:Date.now()-started,inputCharacters:characters,metrics:{keyword:{hitAt1:average('keyword','hitAt1'),recallAt5:average('keyword','recallAt5')},hybrid:{hitAt1:average('hybrid','hitAt1'),recallAt5:average('hybrid','recallAt5')}},cases};
await writeFile('retrieval-eval.local.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report.metrics));console.log('Saved retrieval-eval.local.json. Inspect all expected IDs and false positives before enabling production.');
