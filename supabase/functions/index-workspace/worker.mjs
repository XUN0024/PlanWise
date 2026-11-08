import { chunkSections, embedTexts, embeddingConfiguration } from "../_shared/embeddings.mjs";
export const INDEX_WORKER_VERSION="2026-11-08-runtime-diagnostics-v1";
const keyFrom=env=>{if(env("SUPABASE_SERVICE_ROLE_KEY"))return env("SUPABASE_SERVICE_ROLE_KEY");try{return JSON.parse(env("SUPABASE_SECRET_KEYS")||"{}").default;}catch{return null;}};
export function createIndexHandler({env,fetchImpl=fetch,cryptoImpl=crypto}){
 return async request=>{
  const secret=env("PW_INDEX_WORKER_SECRET");
  if(!secret||request.headers.get("Authorization")!==`Bearer ${secret}`)return Response.json({code:"UNAUTHORIZED"},{status:401});
  if(request.method!=="POST")return Response.json({code:"METHOD_NOT_ALLOWED"},{status:405});
  const key=keyFrom(env),url=env("SUPABASE_URL");
  const action=new URL(request.url).searchParams.get("action");
  if(action==="diagnose")return Response.json({workerVersion:INDEX_WORKER_VERSION,projectRef:/^https:\/\/([a-z0-9]{20})\.supabase\.co\/?$/i.exec(url||"")?.[1]||null,embedding:embeddingConfiguration(env),database:{urlPresent:!!url,serverKeyPresent:!!key}});
  if(action)return Response.json({code:"INVALID_ACTION"},{status:400});
  if(!key||!url)return Response.json({code:"SETUP_REQUIRED"},{status:503});
  const rpc=async(name,body)=>{const r=await fetchImpl(url+"/rest/v1/rpc/"+name,{method:"POST",headers:{Authorization:`Bearer ${key}`,apikey:key,"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error("index_database_failure");return r.json();};
  try{
   const jobs=await rpc("pw_search_claim",{p_limit:2});const results=[];
   for(const job of jobs){
    const identity={p_kind:job.source_type,p_id:job.source_id,p_generation:job.generation,p_lease:job.lease};
    try{
     const chunks=await chunkSections(job.sections,cryptoImpl),existing=new Map(job.existing.map(row=>[row.text_hash,JSON.parse(row.embedding)]));
     const missing=[...new Map(chunks.filter(c=>!existing.has(c.text_hash)).map(c=>[c.text_hash,c])).values()];
     // Persist partial progress. Two batches/job keep a single invocation bounded.
     let superseded=false;
     for(let offset=0;offset<Math.min(missing.length,16);offset+=8){
      const batch=missing.slice(offset,offset+8),vectors=await embedTexts(batch.map(c=>c.text),{env,fetchImpl,reserve:n=>rpc("pw_embedding_reserve",{p_owner:job.user_id,p_characters:n,p_worker:true})});
      batch.forEach((c,i)=>existing.set(c.text_hash,vectors[i]));
      if(!await rpc("pw_search_checkpoint",{...identity,p_version:job.version,p_vectors:batch.map(c=>({text_hash:c.text_hash,embedding:JSON.stringify(existing.get(c.text_hash))})),p_yield:false})){superseded=true;break;}
     }
     if(superseded){results.push({id:job.source_id,state:"superseded"});continue;}
     if(missing.length>16){await rpc("pw_search_checkpoint",{...identity,p_version:job.version,p_vectors:[],p_yield:true});results.push({id:job.source_id,state:"continuing"});continue;}
     const applied=await rpc("pw_search_complete",{...identity,p_version:job.version,p_chunks:chunks.map(c=>({...c,embedding:JSON.stringify(existing.get(c.text_hash))}))});
     results.push({id:job.source_id,state:applied?"ready":"superseded"});
    }catch(error){
     const code=/^[a-z_]{1,80}$/.test(error.code||"")?error.code:"index_processing_failed";
     await rpc("pw_search_retry",{...identity,p_error:code});results.push({id:job.source_id,state:"retry",code,...(code==="embedding_not_configured"?{configuration:embeddingConfiguration(env)}:{})});
    }
   }
   return Response.json({workerVersion:INDEX_WORKER_VERSION,processed:results.length,results});
  }catch{return Response.json({code:"INDEX_DATABASE_FAILURE"},{status:503});}
 };
}
