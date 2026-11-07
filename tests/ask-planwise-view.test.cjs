const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),Module=require("node:module"),babel=require("@babel/core");
const {JSDOM}=require("jsdom"),dom=new JSDOM('<!doctype html><body><div id="root"><div data-planwise-ai-slot></div><div id="host"></div></div></body>',{url:"http://localhost"});
for(const key of ["window","document","navigator","HTMLElement","Node"])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const React=require("react"),{act}=React,{createRoot}=require("react-dom/client"),cache=new Map();
let user={id:"u1"},pathname="/dashboard",calls=[],answer;
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
function load(file){
  const filename=path.resolve(__dirname,"..",file);if(cache.has(filename))return cache.get(filename);
  const {code}=babel.transformSync(fs.readFileSync(filename,"utf8"),{filename,babelrc:false,configFile:false,presets:[["@babel/preset-env",{targets:{node:"current"}}],"@babel/preset-react"]});
  const mod=new Module(filename);mod.require=name=>{
    if(name==="react-i18next")return{useTranslation:()=>({t:key=>key})};if(name==="react-router-dom")return{useLocation:()=>({pathname})};if(name==="../contexts/AuthContext")return{useAuth:()=>({user})};
    if(name==="../services/chatService")return{sendChat:options=>{calls.push(options);return answer(options);}};
    return name.startsWith(".")?load(path.relative(path.resolve(__dirname,".."),path.resolve(path.dirname(filename),name+".jsx"))):require(name);
  };mod._compile(code,filename);cache.set(filename,mod.exports);return mod.exports;
}
const App=load("src/components/AskPlanwise.jsx").default,quota={dailyLimit:20,dailyRemaining:19};
const button=key=>[...document.querySelectorAll("button")].find(node=>node.textContent===key||node.getAttribute("aria-label")===key);
async function type(value){await act(async()=>{const input=document.querySelector("textarea");Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,"value").set.call(input,value);input.dispatchEvent(new window.Event("input",{bubbles:true}));});}
async function mount(){
  user={id:"u1"};pathname="/dashboard";calls=[];answer=async()=>({reply:"Here is a plan.",quota});
  const root=createRoot(document.getElementById("host"));await act(async()=>root.render(React.createElement(App)));
  return{async render(){await act(async()=>root.render(React.createElement(App)));},async close(){await act(async()=>root.unmount());}};
}
test("global header opens a full-height scope-labelled panel, preserves conversation across routes and clears on account change",async()=>{
  const ui=await mount();await act(async()=>button("PW AI").click());assert.ok(document.querySelector('[role="dialog"]').className.includes("sm:max-w-md"));assert.match(document.body.textContent,/askPlanwise.scope/);
  await type("请帮我安排一天");await act(async()=>button("askPlanwise.send").click());assert.equal(calls.length,1);assert.match(document.body.textContent,/Here is a plan/);
  await act(async()=>button("askPlanwise.close").click());pathname="/notes";await ui.render();await act(async()=>button("PW AI").click());assert.match(document.body.textContent,/请帮我安排一天/);
  user={id:"u2"};await ui.render();assert.equal(document.querySelector('[role="dialog"]'),null);await act(async()=>button("PW AI").click());assert.doesNotMatch(document.body.textContent,/Here is a plan/);await ui.close();
});
test("double submit is blocked, stop aborts the request, and logout cannot show a late reply",async()=>{
  const ui=await mount(),pending=deferred();answer=options=>{options.signal.addEventListener("abort",()=>pending.reject(Object.assign(Error("Stopped"),{code:"AI_ABORTED"})));return pending.promise;};
  await act(async()=>button("PW AI").click());await type("Question");
  await act(async()=>{const form=document.querySelector("form");form.dispatchEvent(new window.Event("submit",{bubbles:true,cancelable:true}));form.dispatchEvent(new window.Event("submit",{bubbles:true,cancelable:true}));});assert.equal(calls.length,1);
  await act(async()=>button("askPlanwise.stop").click());assert.equal(calls[0].signal.aborted,true);assert.match(document.body.textContent,/AI_ABORTED/);
  answer=async()=>({reply:"Recovered",quota});await act(async()=>button("askPlanwise.retry").click());assert.equal(calls[0].requestId,calls[1].requestId);
  user=null;await ui.render();assert.equal(document.querySelector('[role="dialog"]'),null);assert.equal(button("PW AI"),undefined);await ui.close();
});
test("IME composition does not send and Shift+Enter keeps newlines; completed replies render as text",async()=>{
  const ui=await mount();answer=async()=>({reply:'<img src=x onerror="alert(1)">',quota});await act(async()=>button("PW AI").click());await type("你好");
  await act(async()=>document.querySelector("textarea").dispatchEvent(new window.KeyboardEvent("keydown",{key:"Enter",isComposing:true,bubbles:true,cancelable:true})));assert.equal(calls.length,0);
  await act(async()=>document.querySelector("textarea").dispatchEvent(new window.KeyboardEvent("keydown",{key:"Enter",shiftKey:true,bubbles:true,cancelable:true})));assert.equal(calls.length,0);
  await act(async()=>document.querySelector("textarea").dispatchEvent(new window.KeyboardEvent("keydown",{key:"Enter",bubbles:true,cancelable:true})));assert.equal(calls.length,1);assert.equal(document.querySelector("img"),null);assert.match(document.body.textContent,/<img src=x/);await ui.close();
});
test("only explicit failed attempts get a new retry id, clear affects the local conversation, and Escape restores focus",async()=>{
  const ui=await mount();let attempt=0;answer=async()=>{if(++attempt===1)throw Object.assign(Error("Provider down"),{code:"AI_PROVIDER_LIMIT",retryWithNewId:true});return{reply:"Success",quota};};
  await act(async()=>button("PW AI").click());await type("Retry me");await act(async()=>button("askPlanwise.send").click());await act(async()=>button("askPlanwise.retry").click());assert.notEqual(calls[0].requestId,calls[1].requestId);
  await act(async()=>button("askPlanwise.clear").click());assert.doesNotMatch(document.body.textContent,/Retry me|Success/);
  await act(async()=>document.dispatchEvent(new window.KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true})));assert.equal(document.querySelector('[role="dialog"]'),null);assert.ok(document.activeElement===button("PW AI"));await ui.close();
});
