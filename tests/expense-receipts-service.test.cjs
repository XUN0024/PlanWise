const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),babel=require("@babel/core");
const file=(size=100)=>({name:"receipt.pdf",type:"application/pdf",size,lastModified:1});
function backend(){
  const rows=new Map(),objects=new Set(),calls=[],clients=[],cache=new Map(),expenses=new Map([["e1",{id:"e1",user_id:"u1",updated_at:"v1"}]]);
  let user="u1",failTransfer=false,failComplete=false,failRemove=false,stall=false;
  const supabase={auth:{getSession:async()=>({data:{session:{user:{id:user},access_token:"test-token"}}})},from(table){
    const source=table==="expenses"?expenses:rows;assert.ok(["expenses","expense_attachments"].includes(table));
    let action="select",payload,filters=[];
    const query={select(){return this;},eq(key,value){filters.push([key,value]);return this;},order(){return this;},insert(value){action="insert";payload=value;return this;},delete(){action="delete";return this;},
      async run(single){
        calls.push({table,action,filters,payload});
        if(action==="insert"){
          if(rows.has(payload.id))return{error:{code:"23505"}};
          const record={...payload,status:"pending",storage_path:`${payload.user_id}/${payload.expense_id}/${payload.id}/file`};rows.set(record.id,record);return{data:record};
        }
        const data=[...source.values()].filter(row=>row.user_id===user&&filters.every(([key,value])=>row[key]===value));
        if(action==="delete"){
          if(table==="expense_attachments"&&data.some(row=>objects.has(row.storage_path)))return{error:Error("Storage object remains")};
          if(table==="expenses"&&data.some(row=>[...rows.values()].some(a=>a.expense_id===row.id)))return{error:Error("Foreign key")};
          data.forEach(row=>source.delete(row.id));
        }
        return{data:single?data[0]||null:data};
      },single(){return this.run(true);},maybeSingle(){return this.run(true);},then(yes,no){return this.run(false).then(yes,no);}};return query;
  },storage:{from(bucket){assert.equal(bucket,"expense-receipts");return{
    async upload(object,f,options){calls.push({action:"bytes",bucket,object,options});if(failTransfer)return{error:Error("Offline")};objects.add(object);return{};},
    async remove(paths){calls.push({action:"removeBytes",paths});if(failRemove)return{error:Error("Remove failed")};paths.forEach(p=>objects.delete(p));return{};},
    async download(object){calls.push({action:"download",object});return{data:{object}};},
  };}},async rpc(name,params){
    assert.equal(name,"complete_expense_attachment");calls.push({action:"complete",params});const row=rows.get(params.p_attachment_id);
    if(!objects.has(row.storage_path))return{error:{code:"22023",message:"File has not finished uploading"}};
    if(failComplete)return{error:Error("Confirmation offline")};const ready={...row,status:"ready"};rows.set(row.id,ready);return{data:ready};
  }};
  class Upload{
    constructor(f,options){this.options=options;this.file=f;calls.push({action:"tus",options});}
    async findPreviousUploads(){return[];}
    start(){this.options.onBeforeRequest({setHeader(){}}).then(()=>{if(stall)return;if(failTransfer)this.options.onError(Error("Offline"));else{objects.add(this.options.metadata.objectName);this.options.onProgress(this.file.size,this.file.size);this.options.onSuccess();}}).catch(this.options.onError);}
    async abort(){calls.push({action:"abort"});}
  }
  function load(filePath){
    const filename=path.resolve(__dirname,"..",filePath);if(cache.has(filename))return cache.get(filename);
    const{code}=babel.transformSync(fs.readFileSync(filename,"utf8"),{filename,configFile:false,babelrc:false,presets:[["@babel/preset-env",{targets:{node:"current"}}],"@babel/preset-react"]});
    const module={exports:{}};vm.runInNewContext(code,{module,exports:module.exports,URL,AbortController,setTimeout,clearTimeout,
      process:{env:{REACT_APP_SUPABASE_URL:"https://test.supabase.co",REACT_APP_SUPABASE_ANON_KEY:"public-test-key"}},
      require(name){
        if(name==="../lib/supabase")return{supabase};if(name==="tus-js-client")return{Upload};
        if(name==="@supabase/supabase-js")return{createClient:(url,key,options)=>{clients.push(options);return{storage:supabase.storage};}};
        return load(path.relative(path.resolve(__dirname,".."),path.resolve(path.dirname(filename),name+".jsx")));
      }});cache.set(filename,module.exports);return module.exports;
  }
  return{service:load("src/services/expenseReceiptService.jsx"),expenseService:load("src/services/expenseService.jsx"),rows,objects,expenses,calls,clients,
    setUser:value=>user=value,failTransfer:value=>failTransfer=value,failComplete:value=>failComplete=value,failRemove:value=>failRemove=value,stall:()=>stall=true};
}
const options=(size=100)=>({file:file(size),expenseId:"e1",userId:"u1",id:"r1"});
test("receipt upload uses expense FK, private bucket and shared standard/resumable transports",async()=>{
  for(const size of [100,7*1024*1024]){
    const back=backend(),ready=await back.service.uploadExpenseReceipt(options(size));assert.equal(ready.expense_id,"e1");assert.equal(ready.status,"ready");assert.equal(ready.storage_path,"u1/e1/r1/file");
    const upload=back.calls.find(call=>["bytes","tus"].includes(call.action));assert.equal(upload.action,size>6*1024*1024?"tus":"bytes");
    if(upload.action==="tus"){assert.equal(upload.options.metadata.bucketName,"expense-receipts");assert.match(await upload.options.fingerprint(),/u1:e1:r1/);}else assert.equal(upload.options.upsert,false);
    assert.equal((await back.service.getExpenseReceipts("e1","u1")).length,1);
  }
});
test("lost completion retries the same reservation and never overwrites/reuploads committed bytes",async()=>{
  const back=backend();back.failComplete(true);await assert.rejects(back.service.uploadExpenseReceipt(options()),error=>error.attachmentStage==="confirmation");
  back.failComplete(false);await back.service.uploadExpenseReceipt(options());assert.equal(back.rows.size,1);assert.equal(back.calls.filter(call=>call.action==="bytes").length,1);
  await back.service.uploadExpenseReceipt(options());assert.equal(back.calls.filter(call=>call.action==="bytes").length,1);
  await assert.rejects(back.service.uploadExpenseReceipt({...options(),file:{...file(),size:101}}),error=>error.code==="ATTACHMENT_CONFLICT");
});
test("transfer failure retains a retryable pending receipt and refresh can read it",async()=>{
  const back=backend();back.failTransfer(true);await assert.rejects(back.service.uploadExpenseReceipt(options()),error=>error.attachmentStage==="transfer");
  assert.equal((await back.service.getExpenseReceipts("e1","u1"))[0].status,"pending");
  back.failTransfer(false);assert.equal((await back.service.uploadExpenseReceipt(options())).status,"ready");assert.equal(back.rows.size,1);
});
test("download/cleanup scope is checked and cancelling an active large upload aborts transport",async()=>{
  const back=backend(),ready=await back.service.uploadExpenseReceipt(options());
  await assert.rejects(back.service.downloadExpenseReceipt({...ready,user_id:"u2"},"u1"),error=>error.code==="ATTACHMENT_AUTH");
  await assert.rejects(back.service.removeExpenseReceipt({...ready,storage_path:"elsewhere"},"u1"),error=>error.code==="ATTACHMENT_AUTH");
  assert.equal((await back.service.downloadExpenseReceipt(ready,"u1")).object,ready.storage_path);
  back.setUser("u2");await assert.rejects(back.service.getExpenseReceipts("e1","u1"),error=>error.code==="ATTACHMENT_AUTH");
  const pending=backend(),controller=new AbortController();pending.stall();const upload=pending.service.uploadExpenseReceipt({...options(7*1024*1024),signal:controller.signal});
  await new Promise(setImmediate);controller.abort();await assert.rejects(upload,error=>error.code==="ATTACHMENT_CANCELLED");assert.ok(pending.calls.some(call=>call.action==="abort"));
});
test("single-receipt delete stops on Storage failure; retry deletes bytes before metadata",async()=>{
  const back=backend(),ready=await back.service.uploadExpenseReceipt(options());back.failRemove(true);
  await assert.rejects(back.service.removeExpenseReceipt(ready,"u1"));assert.equal(back.rows.size,1);assert.equal(back.objects.size,1);
  back.failRemove(false);await back.service.removeExpenseReceipt(ready,"u1");assert.equal(back.rows.size,0);assert.equal(back.objects.size,0);
  assert.ok(back.calls.findIndex(call=>call.action==="removeBytes")<back.calls.findIndex(call=>call.action==="delete"));
});
test("expense deletion verifies version first and keeps the expense if receipt cleanup fails",async()=>{
  const back=backend();await back.service.uploadExpenseReceipt(options());
  await assert.rejects(back.expenseService.deleteExpense({id:"e1",updatedAt:"old"},"u1"),error=>error.code==="EXPENSE_CONFLICT");assert.equal(back.objects.size,1);
  back.failRemove(true);await assert.rejects(back.expenseService.deleteExpense({id:"e1",updatedAt:"v1"},"u1"),error=>error.code==="EXPENSE_RECEIPT_CLEANUP_FAILED");assert.equal(back.expenses.size,1);
  back.failRemove(false);await back.expenseService.deleteExpense({id:"e1",updatedAt:"v1"},"u1");assert.equal(back.rows.size,0);assert.equal(back.objects.size,0);assert.equal(back.expenses.size,0);
  const deletions=back.calls.filter(call=>call.action==="delete");assert.equal(deletions.at(-1).table,"expenses");
});
test("receipt is optional: deleting an expense without receipts succeeds and batch limits are validated before writes",async()=>{
  const back=backend();await back.expenseService.deleteExpense({id:"e1",updatedAt:"v1"},"u1");assert.equal(back.expenses.size,0);
  await assert.rejects(back.service.uploadExpenseReceipt(options(15*1024*1024+1)),error=>error.code==="ATTACHMENT_TOO_LARGE");assert.equal(back.rows.size,0);
});
