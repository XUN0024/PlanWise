const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),Module=require("node:module"),babel=require("@babel/core");
const {JSDOM}=require("jsdom"),dom=new JSDOM('<!doctype html><body><div id="root"></div></body>',{url:"http://localhost"});
for(const name of ["window","document","navigator","HTMLElement","Node"])Object.defineProperty(globalThis,name,{configurable:true,value:dom.window[name]});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const React=require("react"),{act}=React,{createRoot}=require("react-dom/client"),cache=new Map();
function load(file){
  const filename=path.resolve(__dirname,"..",file);if(cache.has(filename))return cache.get(filename);
  const {code}=babel.transformSync(fs.readFileSync(filename,"utf8"),{filename,babelrc:false,configFile:false,presets:[["@babel/preset-env",{targets:{node:"current"}}],"@babel/preset-react"]});
  const mod=new Module(filename);mod.require=name=>name==="react-i18next"?{useTranslation:()=>({t:key=>key})}:name.startsWith(".")?load(path.relative(path.resolve(__dirname,".."),path.resolve(path.dirname(filename),name+".jsx"))):require(name);
  mod._compile(code,filename);cache.set(filename,mod.exports);return mod.exports;
}
const Filters=load("src/components/ExpenseFilters.jsx").default,{DEFAULT_EXPENSE_FILTERS}=load("src/lib/expenseQuery.jsx");
const field=key=>[...document.querySelectorAll("label")].find(node=>node.textContent.startsWith("expensesPanel."+key)).querySelector("input,select");
async function change(input,value){await act(async()=>{if(input.tagName==="INPUT")Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value").set.call(input,value);else input.value=value;input.dispatchEvent(new window.Event(input.tagName==="INPUT"?"input":"change",{bubbles:true}));});}
async function mount(){
  const root=createRoot(document.getElementById("root"));let filters={...DEFAULT_EXPENSE_FILTERS},resets=0;
  function Harness(props){const[value,setValue]=React.useState(filters);return React.createElement(Filters,{filters:value,onChange:updates=>{filters={...value,...updates};setValue(filters);},onReset:()=>{resets++;filters={...DEFAULT_EXPENSE_FILTERS};setValue(filters);},...props});}
  await act(async()=>root.render(React.createElement(Harness)));
  return{get filters(){return filters;},get resets(){return resets;},async render(props){await act(async()=>root.render(React.createElement(Harness,props)));},async close(){await act(async()=>root.unmount());}};
}
test("filter controls expose all planned choices, custom inclusive dates, zero amounts and reset",async()=>{
  const ui=await mount();assert.equal(field("filters.sort").value,"date_desc");
  assert.equal(field("filters.dateRange").options.length,5);assert.equal(field("paymentMethod").options.length,8);
  assert.equal(document.querySelectorAll('input[type="date"]').length,0);
  await change(field("filters.dateRange"),"custom");assert.equal(document.querySelectorAll('input[type="date"]').length,2);
  for(const [key,value] of [["filters.dateFrom","2026-11-01"],["filters.dateTo","2026-11-07"],["filters.minAmount","0"],["filters.maxAmount","20.10"],["filters.search","午餐 10%_*"],["category","Food"],["paymentMethod","unrecorded"],["filters.sort","amount_asc"]])await change(field(key),value);
  assert.deepEqual(ui.filters,{...DEFAULT_EXPENSE_FILTERS,datePreset:"custom",dateFrom:"2026-11-01",dateTo:"2026-11-07",minAmount:"0",maxAmount:"20.10",search:"午餐 10%_*",category:"Food",paymentMethod:"unrecorded",sort:"amount_asc"});
  await act(async()=>document.querySelector("button").click());assert.equal(ui.resets,1);assert.deepEqual(ui.filters,{...DEFAULT_EXPENSE_FILTERS});
  assert.equal(document.querySelectorAll('input[type="date"]').length,0);await ui.close();
});
test("invalid filters announce errors and an active write disables the controls including reset",async()=>{
  const ui=await mount();await ui.render({error:"expensesPanel.filters.amountRangeInvalid",disabled:true});
  assert.equal(document.querySelector("fieldset").disabled,true);assert.match(document.querySelector('[role="alert"]').textContent,/amountRangeInvalid/);
  await act(async()=>document.querySelector("button").click());assert.equal(ui.resets,0);
  await ui.render({disabled:false,error:null});assert.equal(document.querySelector('[role="alert"]'),null);await ui.close();
});
