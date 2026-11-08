const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),Module=require("node:module"),babel=require("@babel/core");
const {JSDOM}=require("jsdom"),dom=new JSDOM('<!doctype html><body><div id="root"><div data-planwise-ai-slot></div><div id="host"></div></div></body>',{url:"http://localhost"});
for(const key of ["window","document","navigator","HTMLElement","Node"])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const React=require("react"),{act}=React,{createRoot}=require("react-dom/client"),cache=new Map();
let user={id:"u1"},pathname="/dashboard",calls=[],answer,noteSource=null,catalogCalls=[],fetchChoices,mountedRoot=null,navigations=[],taskCatalogCalls=[],fetchTaskChoices;
test.afterEach(async()=>{if(mountedRoot){const root=mountedRoot;mountedRoot=null;await act(async()=>root.unmount());}});
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
function load(file){
  const filename=path.resolve(__dirname,"..",file);if(cache.has(filename))return cache.get(filename);
  const {code}=babel.transformSync(fs.readFileSync(filename,"utf8"),{filename,babelrc:false,configFile:false,presets:[["@babel/preset-env",{targets:{node:"current"}}],"@babel/preset-react"]});
  const mod=new Module(filename);mod.require=name=>{
    if(name==="react-i18next")return{useTranslation:()=>({t:(key,values)=>values?.title?key+" "+values.title:values?.count!==undefined?key+" "+values.count:values?.from!==undefined?key+" "+values.from+"–"+values.to+"/"+values.total:key})};if(name==="react-router-dom")return{useLocation:()=>({pathname}),useNavigate:()=>to=>navigations.push(to)};if(name==="../contexts/AuthContext")return{useAuth:()=>({user})};
    if(name==="../services/chatService")return{sendChat:options=>{calls.push(options);return answer(options);}};
    if(name==="../services/noteService")return{getNoteChoices:userId=>{catalogCalls.push(userId);return fetchChoices(userId);}};
    if(name==="../services/taskService")return{getTaskChoices:(...args)=>{taskCatalogCalls.push(args);return fetchTaskChoices(...args);}};
    return name.startsWith(".")?load(path.relative(path.resolve(__dirname,".."),path.resolve(path.dirname(filename),/\.(mjs|jsx)$/.test(name)?name:name+".jsx"))):require(name);
  };mod._compile(code,filename);cache.set(filename,mod.exports);return mod.exports;
}
const App=load("src/components/AskPlanwise.jsx").default,quota={dailyLimit:20,dailyRemaining:19};
const {NoteAssistantProvider,useNoteAssistant}=load("src/contexts/NoteAssistantContext.jsx");
function NoteSource(){const {publish}=useNoteAssistant();React.useEffect(()=>{publish(noteSource);},[publish,noteSource]);return null;}
function Fixture(){return React.createElement(NoteAssistantProvider,{key:user?.id||"signed-out"},React.createElement(NoteSource),React.createElement(App));}
const button=key=>[...document.querySelectorAll("button")].find(node=>node.textContent===key||node.getAttribute("aria-label")===key);
async function type(value){await act(async()=>{const input=document.querySelector("textarea");Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,"value").set.call(input,value);input.dispatchEvent(new window.Event("input",{bubbles:true}));});}
async function mount(options={}){
  user={id:"u1"};pathname="/dashboard";calls=[];navigations=[];answer=async options=>({reply:"Here is a plan.",quota,sources:[],workspace:{schema:"pw-workspace-v1",scope:options.context,checked:[],cards:[]}});
  pathname=options.pathname||"/dashboard";noteSource=options.source||null;catalogCalls=[];fetchChoices=async()=>[];taskCatalogCalls=[];fetchTaskChoices=async()=>({tasks:[],hasMore:false});
  const root=createRoot(document.getElementById("host"));mountedRoot=root;await act(async()=>root.render(React.createElement(Fixture)));
  return{async render(){await act(async()=>root.render(React.createElement(Fixture)));},async close(){await act(async()=>root.unmount());if(mountedRoot===root)mountedRoot=null;}};
}
const NOTE="00000000-0000-4000-8000-000000000010",VERSION="2026-11-07T03:00:00.123456+00:00";
const click=key=>act(async()=>button(key).click());
const context=refs=>({type:"workspace",version:1,references:refs});
function overviewResult(options){
  const offset=options.context.references.find(ref=>ref.type==="notes")?.offset||0;
  const matches=Array.from({length:Math.min(10,11-offset)},(_,i)=>({id:"00000000-0000-4000-8000-"+String(offset+i+100).padStart(12,"0"),title:"Note "+(offset+i+1),version:VERSION,snippet:"Saved excerpt "+(offset+i+1)}));
  return{reply:"Overview page "+offset,quota,workspace:{schema:"pw-workspace-v1",scope:options.context,checked:["notes"],cards:[{type:"notes",method:"overview",terms:[],total:11,libraryTotal:11,offset,limit:10,nextOffset:offset===0?10:null,version:"e".repeat(32),matches}]},sources:matches.map(row=>({type:"note",...row}))};
}
const plus=()=>[...document.querySelectorAll("button")].find(node=>node.textContent.includes("＋ askPlanwise.unified.addReference"));
const tick=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,280));});
async function inputValue(node,value){await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value").set.call(node,value);node.dispatchEvent(new window.Event("input",{bubbles:true}));});}
async function picker(){await act(async()=>plus().click());}
async function check(index){await act(async()=>document.querySelectorAll('input[type="checkbox"]')[index].click());}
const note=(id=NOTE,title="Meeting",extra={})=>({id,title,updatedAt:VERSION,saved:true,dirty:false,saving:false,saveError:false,...extra});
const source=currentNote=>({userId:"u1",notes:[currentNote],currentNote,loading:false,error:false});
async function askReference(reference,title="Meeting",uid="u1"){await act(async()=>window.dispatchEvent(new window.CustomEvent("planwise:ask",{detail:{userId:uid,reference,title}})));}

test("one chat defaults to automatic on every page, keeps history across routes and has no module tabs",async()=>{
  const ui=await mount({pathname:"/notes",source:source(note())});await click("PW AI");
  assert.equal(button("askPlanwise.notes.scope"),undefined);assert.equal(button("askPlanwise.tasks.scope"),undefined);assert.match(document.body.textContent,/askPlanwise.unified.auto/);
  await type("你好");await click("askPlanwise.send");assert.deepEqual(calls[0].context,context([]));assert.match(document.body.textContent,/Here is a plan/);
  await click("askPlanwise.close");pathname="/tasks";await ui.render();await click("PW AI");assert.match(document.body.textContent,/你好|Here is a plan/);await ui.close();
});
test("note overviews show the full library count and page coverage, then load actual next-page references",async()=>{
  const ui=await mount();answer=async options=>overviewResult(options);await click("PW AI");await type("how many notes do I have and what is each of them about?");await click("askPlanwise.send");
  assert.match(document.body.textContent,/libraryTotal 11/);assert.match(document.body.textContent,/notesPage 1–10\/11/);assert.equal(document.querySelectorAll('a[href^="/notes?note="]').length,10);assert.doesNotMatch(document.body.textContent,/Keyword search/);
  await act(async()=>{button("askPlanwise.unified.moreNotes").click();button("askPlanwise.unified.moreNotes").click();});assert.equal(calls.length,2);assert.equal(calls[1].context.references[0].offset,10);assert.equal(calls[1].context.references[0].version,"e".repeat(32));
  assert.match(document.body.textContent,/notesPage 11–11\/11/);assert.match(document.body.textContent,/Overview page 0/);assert.match(document.body.textContent,/Overview page 10/);assert.equal(document.querySelectorAll('a[href^="/notes?note="]').length,11);await ui.close();
});
test("a changed library during pagination retries from page one with a new id",async()=>{
  const ui=await mount();let changed=true;answer=async options=>{if(options.context.references[0]?.offset===10&&changed){changed=false;throw Object.assign(Error("Changed"),{code:"AI_NOTES_CHANGED",retryWithNewId:true});}return overviewResult(options);};
  await click("PW AI");await type("List all my notes");await click("askPlanwise.send");await click("askPlanwise.unified.moreNotes");assert.match(document.body.textContent,/AI_NOTES_CHANGED/);
  await click("askPlanwise.retry");assert.notEqual(calls[1].requestId,calls[2].requestId);assert.deepEqual(calls[2].context.references,[{type:"notes"}]);assert.match(document.body.textContent,/notesPage 1–10\/11/);await ui.close();
});
test("zero keyword matches display a nonzero library total instead of claiming there are no notes",async()=>{
  const ui=await mount();answer=async options=>({reply:"No notes match TAI.",quota,workspace:{schema:"pw-workspace-v1",scope:options.context,checked:["notes"],cards:[{type:"notes",method:"keyword",terms:["TAI"],total:0,libraryTotal:12,matches:[]}]},sources:[]});
  await click("PW AI");await type("Find my TAI notes");await click("askPlanwise.send");assert.match(document.body.textContent,/libraryTotal 12/);assert.match(document.body.textContent,/noteMatches 0/);assert.match(document.body.textContent,/noKeywordMatch/);await ui.close();
});
test("reference picker applies multiple modules, chips are removable, and removing all restores auto without hiding old replies",async()=>{
  const ui=await mount();await click("PW AI");await type("Earlier automatic question");await click("askPlanwise.send");
  await picker();await check(0);await check(1);await click("askPlanwise.unified.apply");await type("Combine my notes and tasks");await click("askPlanwise.send");
  assert.deepEqual(calls[1].context.references.map(ref=>ref.type),["notes","tasks"]);assert.equal(calls[1].messages.length,1);assert.match(document.body.textContent,/Earlier automatic question/);
  assert.equal(document.querySelector('input[type="month"]'),null);
  const remove=()=>[...document.querySelectorAll("button")].filter(node=>(node.getAttribute("aria-label")||"").startsWith("askPlanwise.unified.removeReference"));
  await act(async()=>remove()[0].click());await act(async()=>remove()[0].click());await type("Back to auto");await click("askPlanwise.send");assert.deepEqual(calls.at(-1).context.references,[]);
  assert.match(document.body.textContent,/Combine my notes and tasks/);await ui.close();
});
test("expense conditions appear on demand, are validated, and stay on their own reference tag",async()=>{
  const ui=await mount();await click("PW AI");await picker();
  const conditions=[...document.querySelectorAll("button")].filter(node=>node.textContent==="askPlanwise.unified.conditions");await act(async()=>conditions[1].click());
  await inputValue(document.querySelectorAll('input[type="date"]')[0],"2099-01-01");await click("askPlanwise.unified.apply");assert.match(document.body.textContent,/AI_SCOPE_INVALID/);assert.equal(calls.length,0);
  await inputValue(document.querySelectorAll('input[type="date"]')[0],"2026-05-01");await inputValue(document.querySelectorAll('input[type="date"]')[1],"2026-10-31");await click("askPlanwise.unified.apply");assert.equal(document.querySelector('input[type="date"]'),null);
  await type("Analyze this period's trend");await click("askPlanwise.send");assert.equal(calls[0].context.references[0].from,"2026-05-01");assert.equal(calls[0].context.references[0].to,"2026-10-31");assert.equal(calls[0].context.references[0].type,"expenses");await ui.close();
});
test("range expense answers display the queried dates and the existing trend chart, with comparison only when supplied",async()=>{
  const range=require("./fixtures/expense-range.cjs"),ui=await mount();answer=async options=>{const ctx=range.context({from:"2026-09-01",to:"2026-10-31",granularity:"month",action:"trend"}),{owner_id,...report}=range.report(ctx);return{reply:"Multi-month explanation",quota,workspace:{schema:"pw-workspace-v1",scope:options.context,checked:["expenses"],cards:[{type:"expense_range",context:ctx,action:"trend",report}]},sources:[]};};
  await click("PW AI");await type("Analyze my expenses trend");await click("askPlanwise.send");assert.match(document.body.textContent,/2026-09-01 → 2026-10-31/);assert.match(document.body.textContent,/RM 100\.00/);assert.ok(document.querySelector('svg[aria-label="expensesPanel.statistics.trend"]'));assert.doesNotMatch(document.body.textContent,/askPlanwise.expenses.previousPeriod/);await ui.close();
});
test("a note-specific entry selects only that note, waits for autosave and sends the latest version",async()=>{
  const current=note(NOTE,"Meeting",{dirty:true}),ui=await mount({pathname:"/notes",source:source(current)});
  await askReference({type:"note",id:NOTE,version:VERSION});await type("Summarize this note");await click("askPlanwise.send");assert.equal(calls.length,0);assert.match(document.body.textContent,/waitingForSave/);
  const saved=note(NOTE,"Meeting",{updatedAt:"2026-11-07T03:01:00.123457+00:00"});noteSource=source(saved);await ui.render();assert.equal(calls.length,1);
  assert.equal(calls[0].context.references[0].version,saved.updatedAt);assert.equal(calls[0].context.references.length,1);await ui.close();
});
test("failed note saves preserve the question and cannot invoke AI",async()=>{
  const ui=await mount({pathname:"/notes",source:source(note(NOTE,"Meeting",{dirty:true,saveError:true}))});
  await askReference({type:"note",id:NOTE,version:VERSION});await type("Keep my question");await click("askPlanwise.send");assert.equal(calls.length,0);assert.match(document.body.textContent,/AI_NOTE_SAVE_REQUIRED/);assert.equal(document.querySelector("textarea").value,"Keep my question");await ui.close();
});
test("actual consulted modules, note snippets and source links are attached to their own answer",async()=>{
  const ui=await mount();answer=async options=>({reply:"Found the TAI note.",quota,workspace:{schema:"pw-workspace-v1",scope:options.context,checked:["notes"],cards:[{type:"notes",method:"keyword",terms:["TAI"],total:1,libraryTotal:12,matches:[{id:NOTE,title:"Class notes",version:VERSION,snippet:"TAI discusses retrieval."}]}]},sources:[{type:"note",id:NOTE,title:"Class notes",version:VERSION,snippet:"TAI discusses retrieval."}]});
  await click("PW AI");await type("Find my TAI notes");await click("askPlanwise.send");assert.match(document.body.textContent,/TAI discusses retrieval/);assert.match(document.body.textContent,/askPlanwise.unified.checked/);
  await act(async()=>document.querySelector('a[href^="/notes?note="]').click());assert.deepEqual(navigations,["/notes?note="+NOTE]);await click("PW AI");assert.match(document.body.textContent,/Found the TAI note/);await ui.close();
});

test("hybrid status shows fallback, pending coverage, candidate limits and actual source links without a new tab",async()=>{
  const ui=await mount();answer=async options=>({reply:"Candidate records only",quota,workspace:{schema:"pw-workspace-v1",scope:options.context,checked:["tasks"],cards:[{type:"retrieval",kind:"task",module:"tasks",method:"keyword",reason:"embedding_rate_limited",filter:{status:"unfinished",from:"2026-11-01",to:"2026-11-30"},candidateCount:35,eligibleCount:40,indexedCount:12,exhaustive:false,rows:[{id:NOTE}]}]},sources:[{type:"task",id:NOTE,title:"Prepare TAI",snippet:"Child research requirement",subtask_id:NOTE}]});
  await click("PW AI");await type("Find my preparation tasks");await click("askPlanwise.send");
  for(const text of ["askPlanwise.retrieval.keyword","askPlanwise.retrieval.candidates 35","askPlanwise.retrieval.pending","embedding_rate_limited","2026-11-01 → 2026-11-30","Child research requirement","askPlanwise.retrieval.child"])assert.ok(document.body.textContent.includes(text),text);
  assert.equal(document.querySelectorAll('[role="tab"]').length,0);assert.ok(document.querySelector('a[href^="/tasks?task="]'));await ui.close();
});
test("task entries use selected task references; stale account events and late responses are ignored",async()=>{
  const ui=await mount(),pending=deferred();answer=()=>pending.promise;
  await askReference({type:"tasks",taskId:NOTE,status:"all",priority:"",search:"",from:"",to:""},"Presentation");await type("Break this task down");await click("askPlanwise.send");assert.equal(calls[0].context.references[0].taskId,NOTE);
  user={id:"u2"};await ui.render();await act(async()=>pending.resolve({reply:"Private old-account answer",quota,sources:[]}));await askReference({type:"notes"},"old","u1");assert.equal(document.querySelector('[role="dialog"]'),null);
  await click("PW AI");assert.doesNotMatch(document.body.textContent,/Private old-account|Presentation|Break this task/);await ui.close();
});
test("stop and changed-data retry retain safe request identities and draft text",async()=>{
  const ui=await mount();let attempt=0;answer=async()=>{if(!attempt++)throw Object.assign(Error("Changed"),{code:"AI_WORKSPACE_CHANGED",retryWithNewId:true});return{reply:"Fresh answer",quota,sources:[]};};
  await click("PW AI");await type("Retry this");await click("askPlanwise.send");assert.equal(document.querySelector("textarea").value,"Retry this");await click("askPlanwise.retry");assert.notEqual(calls[0].requestId,calls[1].requestId);
  const pending=deferred();answer=options=>{options.signal.addEventListener("abort",()=>pending.reject(Object.assign(Error("Stopped"),{code:"AI_ABORTED"})));return pending.promise;};await type("Wait");await click("askPlanwise.send");await click("askPlanwise.stop");assert.equal(calls.at(-1).signal.aborted,true);assert.match(document.body.textContent,/AI_ABORTED/);await ui.close();
});
test("voice and folders are clearly front-end placeholders, while new chat resets references and history",async()=>{
  const ui=await mount();await click("PW AI");await click("askPlanwise.unified.voice");assert.match(document.body.textContent,/askPlanwise.unified.voiceHint/);
  await picker();const folder=[...document.querySelectorAll("button")].find(node=>node.textContent.includes("askPlanwise.unified.connectFolder"));assert.equal(folder.disabled,true);
  await check(0);await click("askPlanwise.unified.apply");await type("Find something");await click("askPlanwise.send");await click("askPlanwise.unified.newChat");assert.doesNotMatch(document.body.textContent,/Find something|Here is a plan/);
  await type("New question");await click("askPlanwise.send");assert.deepEqual(calls.at(-1).context.references,[]);assert.equal(calls.at(-1).messages.length,1);await ui.close();
});
test("IME, literal rendering, expand and Escape focus behavior work in the unified chat",async()=>{
  const ui=await mount();answer=async()=>({reply:'<img src=x onerror="alert(1)">',quota,sources:[]});await click("PW AI");await type("你好");
  await act(async()=>document.querySelector("textarea").dispatchEvent(new window.KeyboardEvent("keydown",{key:"Enter",isComposing:true,bubbles:true,cancelable:true})));assert.equal(calls.length,0);
  await click("askPlanwise.send");assert.equal(document.querySelector("img"),null);assert.match(document.body.textContent,/<img src=x/);
  await click("askPlanwise.unified.expand");assert.match(document.querySelector('[role="dialog"]').className,/max-w-4xl/);
  await act(async()=>document.dispatchEvent(new window.KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true})));assert.equal(document.querySelector('[role="dialog"]'),null);assert.equal(document.activeElement,button("PW AI"));await ui.close();
});
