const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),Module=require("node:module"),babel=require("@babel/core");
const {JSDOM}=require("jsdom");
const dom=new JSDOM('<!doctype html><body><div id="root"></div></body>',{url:"http://localhost"});
for(const name of ["window","document","navigator","HTMLElement","Node"])Object.defineProperty(globalThis,name,{configurable:true,value:dom.window[name]});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const React=require("react"),{act}=React,{createRoot}=require("react-dom/client");
const cache=new Map();
function load(file){
  const filename=path.resolve(__dirname,"..",file);if(cache.has(filename))return cache.get(filename);
  const{code}=babel.transformSync(fs.readFileSync(filename,"utf8"),{filename,babelrc:false,configFile:false,presets:[["@babel/preset-env",{targets:{node:"current"}}],"@babel/preset-react"]});
  const loaded=new Module(filename);loaded.require=(name)=>{
    if(name==="react-i18next")return{useTranslation:()=>({t:key=>key})};
    if(name.startsWith("."))return load(path.relative(path.resolve(__dirname,".."),path.resolve(path.dirname(filename),name+".jsx")));
    return require(name);
  };loaded._compile(code,filename);cache.set(filename,loaded.exports);return loaded.exports;
}
const Editor=load("src/components/ExpenseEditor.jsx").default;
const Dialog=load("src/components/ExpenseDialog.jsx").default;
const initial={id:"e1",description:"Lunch",amount:"12.50",date:"2026-11-06",category:"Food",currency:"MYR"};
async function type(input,value){await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value").set.call(input,value);input.dispatchEvent(new window.Event("input",{bubbles:true}));});}
async function mountEditor(extra={}){
  const host=document.getElementById("root"),opener=host.appendChild(document.createElement("button"));opener.focus();
  const container=host.appendChild(document.createElement("div")),root=createRoot(container);let draft={...initial},closed=0,saved=[];
  function Harness(props){const[value,setValue]=React.useState(draft);return React.createElement(Editor,{draft:value,isNew:false,onChange:updates=>{draft={...value,...updates};setValue(draft);},onSave:event=>{event.preventDefault();saved.push({...draft});},onClose:()=>closed++,onReload(){},...props});}
  await act(async()=>root.render(React.createElement(Harness,extra)));
  return{get draft(){return draft;},get closed(){return closed;},saved,
    async render(props){await act(async()=>root.render(React.createElement(Harness,props)));},
    async close(){await act(async()=>root.unmount());assert.ok(document.activeElement===opener,"focus returns to opener");container.remove();opener.remove();}};
}
test("real editor sends entered fields, shows fixed MYR/RM and retains values after a failed save",async()=>{
  const ui=await mountEditor();
  assert.match(document.querySelector('[role="dialog"]').textContent,/MYR \(RM\)/);
  const inputs=document.querySelectorAll("input");assert.equal(inputs.length,3);assert.ok(document.activeElement===inputs[0],"description receives focus");
  await type(inputs[0],"午餐");await type(inputs[1],"0.29");await type(inputs[2],"2024-02-29");
  const category=document.querySelector("select");await act(async()=>{category.value="Bills";category.dispatchEvent(new window.Event("change",{bubbles:true}));});
  await act(async()=>document.querySelector("form").dispatchEvent(new window.Event("submit",{bubbles:true,cancelable:true})));
  assert.equal(ui.saved[0].amount,"0.29");assert.equal(ui.saved[0].date,"2024-02-29");assert.equal(ui.saved[0].category,"Bills");
  await ui.render({error:"expensesPanel.saveError"});
  assert.equal(document.querySelectorAll("input")[0].value,"午餐");assert.match(document.querySelector('[role="alert"]').textContent,/saveError/);
  await ui.close();assert.notEqual(document.getElementById("root").inert,true);
});
test("busy editor locks fields and Escape; focus stays inside the dialog and returns to its opener",async()=>{
  const ui=await mountEditor({busy:true});
  assert.equal(document.querySelector("fieldset").disabled,true);
  await act(async()=>document.dispatchEvent(new window.KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true})));assert.equal(ui.closed,0);
  await ui.render({busy:false});const controls=[...document.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled)')].filter(node=>document.querySelector('[role="dialog"]').contains(node));
  controls.at(-1).focus();await act(async()=>document.dispatchEvent(new window.KeyboardEvent("keydown",{key:"Tab",bubbles:true,cancelable:true})));
  assert.ok(document.activeElement===controls[0],`Tab wraps: active=${document.activeElement.tagName}/${document.activeElement.type}, expected=${controls[0]?.tagName}/${controls[0]?.type}, list=${controls.map(node=>node.tagName+"/"+node.type).join(",")}`);
  await act(async()=>document.dispatchEvent(new window.KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true})));assert.equal(ui.closed,1);
  await ui.close();
});
test("confirmation dialog exposes alertdialog semantics and Escape uses its current close callback",async()=>{
  const host=document.createElement("div");document.body.appendChild(host);const root=createRoot(host);let closed=0;
  await act(async()=>root.render(React.createElement(Dialog,{role:"alertdialog",title:"Confirm deletion",onClose:()=>closed++},React.createElement("button",null,"Cancel"))));
  assert.equal(document.querySelector('[role="alertdialog"]').getAttribute("aria-modal"),"true");
  await act(async()=>document.dispatchEvent(new window.KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true})));assert.equal(closed,1);
  await act(async()=>root.unmount());host.remove();
});
