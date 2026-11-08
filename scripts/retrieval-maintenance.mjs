// Server/admin terminal only. No credentials are printed or persisted.
// node scripts/retrieval-maintenance.mjs backfill|reindex|retry|drain
import { readFile,writeFile } from 'node:fs/promises';
const mode=process.argv[2],env=process.env,url=env.SUPABASE_URL?.replace(/\/$/,''),key=env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key||!['backfill','reindex','retry','drain'].includes(mode))throw new Error('Set server SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY; choose backfill/reindex/retry/drain.');
const rpc=async(name,body)=>{const r=await fetch(url+'/rest/v1/rpc/'+name,{method:'POST',headers:{Authorization:`Bearer ${key}`,apikey:key,'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw new Error(`Database request failed (${r.status})`);return r.json();};
if(mode==='backfill'||mode==='reindex'){
 const file=`.pw-${mode}-cursor.json`;let cursor='';try{cursor=JSON.parse(await readFile(file,'utf8')).cursor||'';}catch{}
 for(;;){const page=await rpc('pw_search_backfill',{p_after:cursor,p_limit:100,p_force:mode==='reindex'});cursor=page.cursor;await writeFile(file,JSON.stringify({cursor,done:page.done}));console.log(`Enqueued ${page.processed}; done=${page.done}`);if(page.done)break;}
}else if(mode==='retry')console.log(`Reset ${await rpc('pw_search_reset_failed',{})} failed jobs (max 200).`);
else{
 if(!env.PW_INDEX_WORKER_SECRET)throw new Error('Set PW_INDEX_WORKER_SECRET in this admin terminal.');
 for(let n=0;n<100;n++){
  const r=await fetch(url+'/functions/v1/index-workspace',{method:'POST',headers:{Authorization:`Bearer ${env.PW_INDEX_WORKER_SECRET}`,'Content-Type':'application/json'},body:'{}'});
  if(!r.ok)throw new Error(`Worker request failed (${r.status})`);const page=await r.json();console.log(JSON.stringify(page));
  if(!page.processed||page.results.some(job=>job.state==='retry'))break;
 }
}
