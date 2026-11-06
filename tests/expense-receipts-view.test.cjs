const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),Module=require("node:module"),babel=require("@babel/core");
const {JSDOM}=require("jsdom"),dom=new JSDOM('<!doctype html><body><div id="root"></div></body>',{url:"http://localhost"});
for(const key of ["window","document","navigator","HTMLElement","Node","Image"])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const React=require("react"),{act}=React,{createRoot}=require("react-dom/client"),cache=new Map();
let records=[],uploads=[],closed=0,downloaded=[],uploadImpl;
const receiptServices={
  getAttachments:async(id,user)=>{assert.equal(id,"e1");assert.equal(user,"u1");return records;},
  uploadAttachment:async options=>{uploads.push(options);return uploadImpl(options);},
  removeAttachment:async record=>{records=records.filter(row=>row.id!==record.id);},discardAttachment:async()=>{},
  downloadAttachment:async(record,user,options)=>{downloaded.push({record,user,options});return new Blob(["image"],{type:"image/png"});},
};
function load(file){
  const filename=path.resolve(__dirname,"..",file);if(cache.has(filename))return cache.get(filename);
  const {code}=babel.transformSync(fs.readFileSync(filename,"utf8"),{filename,babelrc:false,configFile:false,presets:[["@babel/preset-env",{targets:{node:"current"}}],"@babel/preset-react"]});
  const mod=new Module(filename);mod.require=name=>{
    if(name==="react-i18next")return{useTranslation:()=>({t:key=>key})};
    if(name==="../services/expenseReceiptService")return{expenseReceiptPanelServices:receiptServices};
    if(name==="../services/attachmentService")return{};
    return name.startsWith(".")?load(path.relative(path.resolve(__dirname,".."),path.resolve(path.dirname(filename),name+".jsx"))):require(name);
  };mod._compile(code,filename);cache.set(filename,mod.exports);return mod.exports;
}
const View=load("src/components/ExpenseReceipts.jsx").default;
const ready=(id="r1",extra={})=>({id,expense_id:"e1",user_id:"u1",original_name:"receipt.png",mime_type:"image/png",size_bytes:100,status:"ready",...extra});
const file=(name="receipt.pdf",size=100)=>({name,size,type:"application/pdf",lastModified:1});
const button=key=>[...document.querySelectorAll("button")].find(node=>node.textContent===key);
function drag(type,files=[],types=["Files"]){const event=new window.Event(type,{bubbles:true,cancelable:true});Object.defineProperty(event,"dataTransfer",{value:{types,files,items:[],dropEffect:""}});document.querySelector('[role="dialog"] .relative').dispatchEvent(event);}
async function mount(seed=[]){
  records=seed;uploads=[];closed=0;downloaded=[];uploadImpl=async options=>{const row=ready(options.id,{original_name:options.file.name,mime_type:options.file.type});records.push(row);return row;};
  const host=document.getElementById("root"),opener=host.appendChild(document.createElement("button"));opener.focus();const container=host.appendChild(document.createElement("div")),root=createRoot(container);
  await act(async()=>root.render(React.createElement(View,{record:{id:"e1",description:"Lunch",cents:1250,date:"2026-11-07"},userId:"u1",onClose:()=>closed++})));
  return{async close(){await act(async()=>root.unmount());assert.ok(document.activeElement===opener);container.remove();opener.remove();}};
}
test("receipt drop overlay is hidden, ignores text and appears only for file drag; valid drops use shared upload UI",async()=>{
  const ui=await mount();assert.doesNotMatch(document.body.textContent,/attachments.dropHere/);assert.ok(document.querySelector('[role="dialog"]').contains(document.activeElement));assert.equal(document.activeElement.hidden,false);
  await act(async()=>drag("dragenter",[],["text/plain"]));assert.doesNotMatch(document.body.textContent,/attachments.dropHere/);
  await act(async()=>drag("dragenter"));assert.match(document.body.textContent,/attachments.dropHere/);
  await act(async()=>drag("drop",[file()]));assert.equal(uploads.length,1);assert.equal(uploads[0].parentId,"e1");assert.equal(uploads[0].userId,"u1");
  assert.match(document.body.textContent,/receipt.pdf/);assert.doesNotMatch(document.body.textContent,/attachments.dropHere/);assert.ok(document.querySelector('[data-icon="file-pdf"]'));await ui.close();
});
test("invalid whole batches never upload and keyboard file picker uses the same validation",async()=>{
  const ui=await mount();await act(async()=>drag("drop",Array.from({length:6},()=>file())));assert.equal(uploads.length,0);assert.match(document.body.textContent,/tooMany/);
  await act(async()=>drag("drop",[file("large",15*1024*1024+1)]));assert.equal(uploads.length,0);assert.match(document.body.textContent,/tooLarge/);
  const input=document.querySelector('input[type="file"]');Object.defineProperty(input,"files",{configurable:true,value:[file("picker.pdf")]});
  await act(async()=>input.dispatchEvent(new window.Event("change",{bubbles:true})));assert.equal(uploads.length,1);assert.match(document.body.textContent,/picker.pdf/);await ui.close();
});
test("active uploads block closing, cancellation aborts workers and failed jobs retry their stable UUID",async()=>{
  const ui=await mount();let fail=true;
  uploadImpl=options=>new Promise((resolve,reject)=>{if(!fail)resolve(ready(options.id));else options.signal.addEventListener("abort",()=>reject(Error("Stopped")));});
  await act(async()=>drag("drop",[file()]));assert.equal(button("expensesPanel.receipts.close").disabled,true);
  await act(async()=>document.dispatchEvent(new window.KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true})));assert.equal(closed,0);
  await act(async()=>button("attachments.cancelUpload").click());assert.equal(uploads[0].signal.aborted,true);assert.match(document.body.textContent,/cancelled/);
  fail=false;const id=uploads[0].id;await act(async()=>button("notesPanel.retry").click());assert.equal(uploads[1].id,id);assert.equal(button("expensesPanel.receipts.close").disabled,false);await ui.close();
});
test("preview and delete confirmation trap keys in the top modal and return to the receipts window",async()=>{
  const ui=await mount([ready()]);await act(async()=>button("preview.open").click());assert.equal(downloaded.length,1);assert.equal(downloaded[0].record.expense_id,"e1");assert.ok(downloaded[0].options.signal);
  assert.equal(document.querySelectorAll('[aria-modal="true"]').length,2);
  await act(async()=>document.dispatchEvent(new window.KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true})));assert.equal(closed,0);assert.equal(document.querySelectorAll('[aria-modal="true"]').length,1);
  await act(async()=>button("notesPanel.delete").click());const modals=document.querySelectorAll('[aria-modal="true"]');assert.equal(modals.length,2);assert.notEqual(modals[0].getAttribute("aria-labelledby"),modals[1].getAttribute("aria-labelledby"));
  await act(async()=>document.dispatchEvent(new window.KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true})));assert.equal(closed,0);assert.equal(document.querySelector('[role="alertdialog"]'),null);
  await act(async()=>button("notesPanel.delete").click());await act(async()=>button("notesPanel.confirmDelete").click());assert.doesNotMatch(document.body.textContent,/receipt.png/);await ui.close();
});
