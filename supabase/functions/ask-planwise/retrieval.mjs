import { embedTexts, normalizeText } from "../_shared/embeddings.mjs";
const fail=code=>Object.assign(new Error(code),{code,status:503});
import { retrievalModule } from "./retrieval-report.mjs";
export function retrievalQuery(question){return normalizeText(question).replace(/(?:的话)?呢[?？。!！]*$/," ").replace(/^(?:what about|how about)\s+/i,"").trim()||normalizeText(question);}
export function retrievalTerms(question){
 question=retrievalQuery(question);
 const quoted=[...question.matchAll(/[“"「]([^”"」]{1,100})[”"」]/g)].map(m=>normalizeText(m[1]));
 const stop=new Set("find search show list me my the a an of for to and or all both each every these those notes note tasks task expenses expense spending spent payments payment related about similar records record please which what where how many total have has i do did can you could would that this with from on in is are was were saved something".split(" "));
 const text=normalizeText(question).replace(/请|帮我|查找|寻找|找一下|找出|笔记|任务|待办|支出|账单|消费|记录|相关|类似|关于|我的|之前|以前|我|哪些|是否|有没有|用于|一些/g," ");
 const terms=[...quoted,...(text.match(/[\p{L}\p{N}_-]+/gu)||[]).filter(word=>!stop.has(word.toLowerCase()))];
 // CJK bigrams allow partial Chinese phrasing without an English-only tokenizer.
 for(const run of text.match(/[\u3400-\u9fff]{3,}/g)||[])for(let i=0;i<run.length-1;i++)terms.push(run.slice(i,i+2));
 return [...new Set(terms)].filter(t=>t.length>=2&&t.length<=100).slice(0,24);
}
export async function readHybrid(step,options,embeddingState){
 const {env=()=>undefined,fetchImpl,url,authorization,publicKey,serverKey,userId,readJson}=options;
 const rpc=async(name,body,server=false)=>{
  let response;try{response=await fetchImpl(url+"/rest/v1/rpc/"+name,{method:"POST",headers:{Authorization:server?`Bearer ${serverKey}`:authorization,apikey:server?serverKey:publicKey,"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});}catch{throw fail("AI_RETRIEVAL_LOAD_FAILED");}
  if(!response.ok)throw fail(response.status===404?"AI_RETRIEVAL_SETUP_REQUIRED":"AI_RETRIEVAL_LOAD_FAILED");
  return readJson(response,262144);
 };
 const query=retrievalQuery(options.messages.at(-1).content);
 if(!embeddingState.attempted){
  embeddingState.attempted=true;
  try{
   [embeddingState.vector]=await embedTexts([Array.from(query).slice(0,1400).join("")],{env,fetchImpl,reserve:n=>rpc("pw_embedding_reserve",{p_owner:userId,p_characters:n,p_worker:false},true)});
  }catch(error){embeddingState.reason=typeof error.code==="string"&&error.code.startsWith("embedding_")?error.code:"embedding_unavailable";}
 }
 const data=await rpc("pw_hybrid_search",{p_kind:step.kind,p_query:query,p_terms:retrievalTerms(query),p_vector:embeddingState.vector?JSON.stringify(embeddingState.vector):null,p_filter:step.filter,p_limit:8});
 if(data?.owner_id!==userId||data.kind!==step.kind)throw fail("AI_RETRIEVAL_DATA_INVALID");
 return {type:"retrieval",module:retrievalModule(step.kind),kind:step.kind,method:embeddingState.vector?"hybrid":"keyword",reason:embeddingState.reason||null,
  filter:step.filter,query,snapshot:data.snapshot,eligibleCount:data.eligible_count,indexedCount:data.indexed_count,candidateCount:data.candidate_count,
  exhaustive:false,rows:data.rows};
}
