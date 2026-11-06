const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),Module=require("node:module"),babel=require("@babel/core");
const {JSDOM}=require("jsdom"),dom=new JSDOM('<!doctype html><body><div id="root"></div></body>',{url:"http://localhost"});
for(const key of ["window","document","navigator","HTMLElement","Node"])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const React=require("react"),{act}=React,{createRoot}=require("react-dom/client"),cache=new Map();
let user={id:"u1",email:"one@example.com"};const service={};
function load(file){
  const filename=path.resolve(__dirname,"..",file);if(cache.has(filename))return cache.get(filename);
  const {code}=babel.transformSync(fs.readFileSync(filename,"utf8"),{filename,babelrc:false,configFile:false,presets:[["@babel/preset-env",{targets:{node:"current"}}],"@babel/preset-react"]});
  const mod=new Module(filename);mod.require=name=>{
    if(name==="react-i18next")return{useTranslation:()=>({t:key=>key})};
    if(name==="react-router-dom")return{Link:props=>React.createElement("a",{href:props.to},props.children),useNavigate:()=>()=>{}};
    if(name==="../contexts/AuthContext")return{useAuth:()=>({user,signOut:async()=>{}})};
    if(name==="../services/expenseService")return service;
    if(name==="./LanguageSwitcher")return{__esModule:true,default:()=>null};
    if(name==="./ExpenseReceipts")return{__esModule:true,default:()=>null};
    return name.startsWith(".")?load(path.relative(path.resolve(__dirname,".."),path.resolve(path.dirname(filename),name+".jsx"))):require(name);
  };mod._compile(code,filename);cache.set(filename,mod.exports);return mod.exports;
}
const View=load("src/components/ExpenseStatistics.jsx").default;
function data(n=2){
  const trend=Array.from({length:n},(_,i)=>({date:new Date(Date.UTC(2026,0,i+1)).toISOString().slice(0,10),count:"1",totalCents:String(i+1)}));
  const total=BigInt(n)*(BigInt(n)+1n)/2n;
  return{count:String(n),totalCents:String(total),averageCents:n?String((total+BigInt(n)/2n)/BigInt(n)):"0",granularity:"day",categories:n?[{key:"Food",count:String(n),totalCents:String(total)}]:[],methods:n?[{key:"unrecorded",count:String(n),totalCents:String(total)}]:[],trend};
}
async function mount(Component,props={}){
  const root=createRoot(document.getElementById("root"));await act(async()=>root.render(React.createElement(Component,props)));
  return{async render(next){await act(async()=>root.render(React.createElement(Component,next)));},async close(){await act(async()=>root.unmount());}};
}
const button=key=>[...document.querySelectorAll("button")].find(node=>node.textContent===key);
test("overview renders exact totals, accessible chart values, category shares and unrecorded payments",async()=>{
  const value=data();value.totalCents="9999999999999901";value.averageCents="4999999999999951";
  value.categories[0].totalCents=value.methods[0].totalCents=value.totalCents;value.trend[0].totalCents="9999999999999900";value.trend[1].totalCents="1";
  const ui=await mount(View,{data:value,granularity:"auto",onGranularityChange(){}});
  assert.match(document.body.textContent,/RM 99,999,999,999,999.01/);assert.match(document.body.textContent,/expensesPanel.notRecorded/);assert.match(document.body.textContent,/100.0%/);
  assert.equal(document.querySelectorAll("rect").length,2);assert.ok(document.querySelector("rect").getAttribute("aria-label").includes("RM 99,999,999,999,999.00"));
  assert.equal(document.querySelectorAll("tbody tr").length,2);assert.doesNotMatch(document.querySelector("svg").outerHTML,/NaN|Infinity/);await ui.close();
});
test("long trends show 60 periods at a time with navigation and zero data has real zero cards",async()=>{
  const ui=await mount(View,{data:data(130),granularity:"day",onGranularityChange(){}});
  assert.equal(document.querySelectorAll("rect").length,60);assert.match(document.body.textContent,/71–130 \/ 130/);
  await act(async()=>button("expensesPanel.statistics.earlier").click());assert.match(document.body.textContent,/11–70 \/ 130/);
  await act(async()=>button("expensesPanel.statistics.earlier").click());assert.equal(document.querySelectorAll("rect").length,10);assert.equal(button("expensesPanel.statistics.earlier").disabled,true);
  await act(async()=>button("expensesPanel.statistics.later").click());assert.match(document.body.textContent,/11–70 \/ 130/);
  await ui.render({data:data(2),granularity:"day",onGranularityChange(){}});assert.equal(document.querySelectorAll("rect").length,2);
  await ui.render({data:data(0),granularity:"auto",onGranularityChange(){}});assert.match(document.body.textContent,/RM 0.00/);assert.match(document.body.textContent,/statistics.empty/);assert.equal(document.querySelector("svg"),null);
  await ui.close();
});
test("loading/error/granularity controls never present stale or fabricated zero totals",async()=>{
  let retried=0,mode=null;const props={granularity:"auto",onGranularityChange:value=>mode=value,onRetry:()=>retried++};
  const ui=await mount(View,{...props,loading:true,data:data()});assert.equal(document.querySelectorAll("rect").length,0);assert.match(document.body.textContent,/statistics.loading/);
  await ui.render({...props,error:"expensesPanel.statistics.setupRequired"});assert.match(document.querySelector('[role="alert"]').textContent,/setupRequired/);
  await act(async()=>button("expensesPanel.retry").click());assert.equal(retried,1);
  await act(async()=>{const select=document.querySelector("select");select.value="month";select.dispatchEvent(new window.Event("change",{bubbles:true}));});assert.equal(mode,"month");await ui.close();
});
test("real Expenses layout shares filters with overview above bills; paging/sort do not re-fetch aggregates",async()=>{
  const calls=[],statCalls=[];
  Object.assign(service,{getExpenses:async(...args)=>{calls.push(args);return{items:[],hasMore:false};},getExpenseStatistics:async(...args)=>{statCalls.push(args);return data();}});
  const Page=load("src/components/Expenses.jsx").default,ui=await mount(Page);
  const main=document.querySelector("main"),filters=main.querySelector('section[aria-label="expensesPanel.filters.title"]'),overview=main.querySelector('section[aria-label="expensesPanel.statistics.title"]');
  assert.ok(filters.compareDocumentPosition(overview)&window.Node.DOCUMENT_POSITION_FOLLOWING);
  const billHeading=[...main.querySelectorAll("h2")].find(node=>node.textContent==="expensesPanel.statistics.bills");assert.ok(overview.compareDocumentPosition(billHeading)&window.Node.DOCUMENT_POSITION_FOLLOWING);
  const category=[...filters.querySelectorAll("select")].find(node=>[...node.options].some(option=>option.value==="Food"));
  await act(async()=>{category.value="Food";category.dispatchEvent(new window.Event("change",{bubbles:true}));});
  assert.equal(calls.at(-1)[2].category,"Food");assert.equal(statCalls.at(-1)[1].category,"Food");
  const count=statCalls.length,sort=[...filters.querySelectorAll("select")].find(node=>[...node.options].some(option=>option.value==="amount_asc"));
  await act(async()=>{sort.value="amount_asc";sort.dispatchEvent(new window.Event("change",{bubbles:true}));});assert.equal(statCalls.length,count);assert.equal(calls.at(-1)[2].sort,"amount_asc");
  await ui.close();
});
