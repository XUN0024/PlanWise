export const EMBEDDING_MODEL="@cf/baai/bge-m3", EMBEDDING_DIMENSIONS=1024, INDEX_VERSION=1;
export const normalizeText=text=>String(text||"").normalize("NFKC").replace(/\r\n?/g,"\n").replace(/\0/g,"").trim();
const error=code=>Object.assign(new Error(code),{code});
export function validVector(value){return Array.isArray(value)&&value.length===1024&&value.every(n=>typeof n==="number"&&Number.isFinite(n))&&value.some(n=>n!==0);}
export function embeddingConfiguration(env){
  // Only booleans may leave this helper. Never return values, prefixes, lengths or digests.
  const present=name=>{const value=env(name);return typeof value==="string"&&value.trim().length>0;};
  const flags={enabled:env("PW_EMBEDDINGS_ENABLED")==="true",accountIdPresent:present("CLOUDFLARE_ACCOUNT_ID"),tokenPresent:present("CLOUDFLARE_EMBEDDING_API_TOKEN")};
  return{...flags,configured:flags.enabled&&flags.accountIdPresent&&flags.tokenPresent};
}
export function embeddingConfigured(env){return embeddingConfiguration(env).configured;}
export async function embedTexts(texts,{env,fetchImpl=fetch,reserve}){
  if(!embeddingConfigured(env))throw error("embedding_not_configured");
  const input=texts.map(normalizeText);
  if(!input.length||input.length>8||input.some(text=>!text||Array.from(text).length>1400))throw error("embedding_input_limit");
  if(!await reserve(input.reduce((n,text)=>n+Array.from(text).length,0)))throw error("embedding_budget_limit");
  // One attempt per reservation. Queue retries reserve again; interactive reads fall back immediately.
  let response;
  try{response=await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env("CLOUDFLARE_ACCOUNT_ID").trim())}/ai/run/${EMBEDDING_MODEL}`,{
    method:"POST",headers:{Authorization:`Bearer ${env("CLOUDFLARE_EMBEDDING_API_TOKEN").trim()}`,"Content-Type":"application/json"},body:JSON.stringify({text:input}),signal:AbortSignal.timeout(15000)});
  }catch{throw error("embedding_timeout");}
  if(!response.ok)throw error(response.status===429?"embedding_rate_limited":response.status===401||response.status===403?"embedding_auth_failed":"embedding_unavailable");
  // Bound the response: an 8 x 1024 array should be well below 1 MiB.
  if(!response.body)throw error("embedding_invalid_response");
  const reader=response.body.getReader();let size=0;const chunks=[];
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1048576){await reader.cancel();throw error("embedding_invalid_response");}chunks.push(value);}}
  catch(e){throw error(e.code==="embedding_invalid_response"?e.code:"embedding_timeout");}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  let body;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{throw error("embedding_invalid_response");}
  const vectors=body?.result?.data;
  if(body.success===false||!Array.isArray(vectors)||vectors.length!==input.length||!vectors.every(validVector))throw error("embedding_invalid_dimensions");
  return vectors;
}
export async function hashText(text,cryptoImpl=crypto){return Array.from(new Uint8Array(await cryptoImpl.subtle.digest("SHA-256",new TextEncoder().encode(text))),n=>n.toString(16).padStart(2,"0")).join("");}
export async function chunkSections(sections,cryptoImpl=crypto){
  const chunks=[];
  for(let section=0;section<sections.length;section++){
    // Offsets are Unicode code points in the ORIGINAL section (not UTF-16 indices).
    const chars=Array.from(String(sections[section].text||""));
    for(let start=0;start<chars.length;){
      let end=Math.min(start+1000,chars.length);
      if(end<chars.length){const newline=chars.slice(start+600,end).lastIndexOf("\n");if(newline>=0)end=start+600+newline+1;}
      const text=normalizeText(chars.slice(start,end).join(""));
      if(text)chunks.push({chunk_no:chunks.length,section,subtask_id:sections[section].subtask_id||null,start_offset:start,end_offset:end,text,text_hash:await hashText(text,cryptoImpl)});
      if(chunks.length>256)throw error("source_chunk_limit");
      if(end===chars.length)break;start=end-120;
    }
  }
  return chunks;
}
