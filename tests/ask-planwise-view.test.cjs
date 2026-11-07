const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),Module=require("node:module"),babel=require("@babel/core");
const {JSDOM}=require("jsdom"),dom=new JSDOM('<!doctype html><body><div id="root"><div data-planwise-ai-slot></div><div id="host"></div></div></body>',{url:"http://localhost"});
for(const key of ["window","document","navigator","HTMLElement","Node"])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const React=require("react"),{act}=React,{createRoot}=require("react-dom/client"),cache=new Map();
let user={id:"u1"},pathname="/dashboard",calls=[],answer,noteSource=null,catalogCalls=[],fetchChoices,mountedRoot=null,navigations=[];
test.afterEach(async()=>{if(mountedRoot){const root=mountedRoot;mountedRoot=null;await act(async()=>root.unmount());}});
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
function load(file){
  const filename=path.resolve(__dirname,"..",file);if(cache.has(filename))return cache.get(filename);
  const {code}=babel.transformSync(fs.readFileSync(filename,"utf8"),{filename,babelrc:false,configFile:false,presets:[["@babel/preset-env",{targets:{node:"current"}}],"@babel/preset-react"]});
  const mod=new Module(filename);mod.require=name=>{
    if(name==="react-i18next")return{useTranslation:()=>({t:(key,values)=>values?.title?key+" "+values.title:key})};if(name==="react-router-dom")return{useLocation:()=>({pathname}),useNavigate:()=>to=>navigations.push(to)};if(name==="../contexts/AuthContext")return{useAuth:()=>({user})};
    if(name==="../services/chatService")return{sendChat:options=>{calls.push(options);return answer(options);}};
    if(name==="../services/noteService")return{getNoteChoices:userId=>{catalogCalls.push(userId);return fetchChoices(userId);}};
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
  user={id:"u1"};pathname="/dashboard";calls=[];navigations=[];answer=async options=>({reply:"Here is a plan.",quota,sources:options.context?[{type:"note",id:options.context.noteId,version:options.context.version,title:"Source note"}]:[]});
  pathname=options.pathname||"/dashboard";noteSource=options.source||null;catalogCalls=[];fetchChoices=async()=>[];
  const root=createRoot(document.getElementById("host"));mountedRoot=root;await act(async()=>root.render(React.createElement(Fixture)));
  return{async render(){await act(async()=>root.render(React.createElement(Fixture)));},async close(){await act(async()=>root.unmount());if(mountedRoot===root)mountedRoot=null;}};
}
test("global header opens a full-height scope-labelled panel, preserves conversation across routes and clears on account change",async()=>{
  const ui=await mount();await act(async()=>button("PW AI").click());assert.ok(document.querySelector('[role="dialog"]').className.includes("sm:max-w-md"));assert.match(document.body.textContent,/askPlanwise.scope/);
  await type("请帮我安排一天");await act(async()=>button("askPlanwise.send").click());assert.equal(calls.length,1);assert.match(document.body.textContent,/Here is a plan/);
  await act(async()=>button("askPlanwise.close").click());pathname="/notes";await ui.render();await act(async()=>button("PW AI").click());
  await act(async()=>button("askPlanwise.scope").click());assert.match(document.body.textContent,/请帮我安排一天/);
  user={id:"u2"};await ui.render();assert.equal(document.querySelector('[role="dialog"]'),null);await act(async()=>button("PW AI").click());assert.doesNotMatch(document.body.textContent,/Here is a plan/);await ui.close();
});

const note=(id,title,extra={})=>({id,title,updatedAt:"2026-11-07T03:00:00.123456+00:00",saved:true,dirty:false,saving:false,saveError:false,...extra});
const source=(currentNote,notes=[])=>({userId:"u1",notes,currentNote,loading:false,error:false});
async function search(value){await act(async()=>{const input=document.querySelector('input');Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value").set.call(input,value);input.dispatchEvent(new window.Event("input",{bubbles:true}));});}
async function changeInput(node,value){await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value").set.call(node,value);node.dispatchEvent(new window.Event("input",{bubbles:true}));});}

test("the open note is automatic, summary requests carry its version, sources open the note, and ordinary chat stays separate",async()=>{
  const current=note("a","Project meeting"),ui=await mount({pathname:"/notes",source:source(current,[current])});
  await act(async()=>button("PW AI").click());assert.match(document.body.textContent,/Project meeting/);assert.match(document.body.textContent,/askPlanwise.notes.saved/);
  await act(async()=>button("askPlanwise.notes.summarize").click());assert.match(document.querySelector("textarea").value,/summaryPrompt.*Project meeting/);
  assert.equal(button("askPlanwise.send").disabled,false);assert.equal(calls.length,0);
  await act(async()=>button("askPlanwise.send").click());assert.equal(calls.length,1);assert.equal(calls[0].context.action,"summarize");
  assert.equal(calls[0].context.noteId,"a");assert.equal(calls[0].context.version,current.updatedAt);assert.equal(catalogCalls.length,0);
  assert.match(document.body.textContent,/Here is a plan/);assert.match(document.body.textContent,/source Source note/);
  await act(async()=>document.querySelector('a[href="/notes?note=a"]').click());assert.deepEqual(navigations,["/notes?note=a"]);
  await act(async()=>button("PW AI").click());
  await type("Private question about this note");
  noteSource=source(note("a","Edited title",{dirty:true,saving:true}),[current]);await ui.render();
  assert.match(document.body.textContent,/Edited title/);assert.match(document.body.textContent,/askPlanwise.notes.saving/);
  assert.equal(document.querySelector("textarea").value,"Private question about this note");
  await act(async()=>button("askPlanwise.notes.ask").click());assert.equal(document.activeElement,document.querySelector("textarea"));
  await act(async()=>button("askPlanwise.close").click());await act(async()=>button("PW AI").click());assert.equal(document.querySelector("textarea").value,"Private question about this note");
  await act(async()=>button("askPlanwise.scope").click());assert.equal(document.querySelector("textarea").value,"");
  await type("An ordinary question");await act(async()=>button("askPlanwise.send").click());assert.equal(calls.length,2);
  assert.deepEqual(calls[1].messages,[{role:"user",content:"An ordinary question"}]);assert.equal(Object.hasOwn(calls[1],"context"),false);
  await ui.close();
});

test("note send waits for autosave, uses its new version, and ignores the old version's conversation",async()=>{
  const a=note("a","Meeting"),ui=await mount({pathname:"/notes",source:source(a,[a])});
  await act(async()=>button("PW AI").click());await type("First question");await act(async()=>button("askPlanwise.send").click());assert.equal(calls.length,1);
  noteSource=source(note("a","Meeting",{dirty:true}),[a]);await ui.render();await type("Question after my edit");
  await act(async()=>button("askPlanwise.send").click());assert.equal(calls.length,1);assert.match(document.body.textContent,/waitingForSave/);
  const saved=note("a","Meeting",{updatedAt:"2026-11-07T03:01:00.123457+00:00"});noteSource=source(saved,[saved]);await ui.render();
  assert.equal(calls.length,2);assert.equal(calls[1].context.version,saved.updatedAt);assert.equal(calls[1].messages.length,1);
  assert.doesNotMatch(document.body.textContent,/First question/);assert.match(document.body.textContent,/versionChanged/);
  await ui.close();
});

test("failed saves and cancellation preserve the question and cannot call the model",async()=>{
  const a=note("a","Draft",{dirty:true}),ui=await mount({pathname:"/notes",source:source(a,[a])});
  await act(async()=>button("PW AI").click());await type("Keep my question");await act(async()=>button("askPlanwise.send").click());
  noteSource=source(note("a","Draft",{dirty:true,saveError:true}),[a]);await ui.render();
  assert.equal(calls.length,0);assert.match(document.body.textContent,/AI_NOTE_SAVE_REQUIRED/);assert.equal(document.querySelector("textarea").value,"Keep my question");
  noteSource=source(a,[a]);await ui.render();await act(async()=>button("askPlanwise.retry").click());
  await act(async()=>button("askPlanwise.stop").click());assert.equal(calls.length,0);assert.match(document.body.textContent,/AI_ABORTED/);
  await ui.close();
});

test("note conversations and retries stay bound to their own note ID and version",async()=>{
  const a=note("a","Alpha"),b=note("b","Beta"),ui=await mount({pathname:"/notes",source:source(a,[a,b])});
  let attempt=0;answer=async options=>{if(++attempt===1)throw Object.assign(Error("Offline"),{code:"AI_NETWORK"});return{reply:"Answer for "+options.context.noteId,quota,sources:[]};};
  await act(async()=>button("PW AI").click());await type("Alpha private question");await act(async()=>button("askPlanwise.send").click());
  await act(async()=>button("askPlanwise.retry").click());assert.equal(calls[0].requestId,calls[1].requestId);assert.deepEqual(calls[0].context,calls[1].context);
  await act(async()=>button("askPlanwise.notes.change").click());await act(async()=>button("Beta").click());assert.doesNotMatch(document.body.textContent,/Alpha private question|Answer for a/);
  await type("Beta question");await act(async()=>button("askPlanwise.send").click());assert.equal(calls.at(-1).messages.length,1);
  await act(async()=>button("askPlanwise.notes.change").click());await act(async()=>button("Alpha").click());assert.match(document.body.textContent,/Answer for a/);assert.doesNotMatch(document.body.textContent,/Beta question/);
  await ui.close();
});

test("users can search and override the note, keep separate drafts, and automatically follow a newly opened note",async()=>{
  const a=note("a","Alpha"),b=note("b","Beta"),c=note("c","Gamma");
  const ui=await mount({pathname:"/notes",source:source(a,[a,b,c])});await act(async()=>button("PW AI").click());await type("Question for Alpha");
  await act(async()=>button("askPlanwise.notes.change").click());await search("missing");assert.match(document.body.textContent,/askPlanwise.notes.noResults/);
  await search("beta");await act(async()=>button("Beta").click());assert.match(document.body.textContent,/headline Beta/);assert.equal(document.querySelector("textarea").value,"");
  await type("Question for Beta");await act(async()=>button("askPlanwise.close").click());await act(async()=>button("PW AI").click());
  assert.match(document.body.textContent,/headline Beta/);assert.equal(document.querySelector("textarea").value,"Question for Beta");
  await act(async()=>button("askPlanwise.notes.change").click());await act(async()=>button("Alpha").click());assert.equal(document.querySelector("textarea").value,"Question for Alpha");
  noteSource=source(c,[a,b,c]);await ui.render();assert.match(document.body.textContent,/headline Gamma/);assert.equal(document.querySelector("textarea").value,"");
  noteSource=source(null,[]);await ui.render();assert.match(document.body.textContent,/askPlanwise.notes.noSelection/);assert.equal(document.querySelector("textarea").disabled,true);
  assert.equal(calls.length,0);await ui.close();
});

test("unselected and empty accounts have a picker, and a new unsaved draft is labelled without a model call",async()=>{
  const ui=await mount({pathname:"/notes",source:source(null,[])});await act(async()=>button("PW AI").click());
  assert.match(document.body.textContent,/askPlanwise.notes.noSelection/);await act(async()=>button("askPlanwise.notes.choose").click());assert.match(document.body.textContent,/askPlanwise.notes.empty/);
  noteSource=source(note("new","",{saved:false,dirty:true}),[]);await ui.render();assert.match(document.body.textContent,/askPlanwise.notes.newDraft/);assert.match(document.body.textContent,/askPlanwise.notes.untitled/);
  noteSource=source(note("new","Draft",{saved:false,saveError:true}),[]);await ui.render();assert.match(document.body.textContent,/askPlanwise.notes.saveError/);
  assert.equal(calls.length,0);assert.equal(catalogCalls.length,0);await ui.close();
});

test("other pages load note choices with retry and ignore late catalog results after account change",async()=>{
  const ui=await mount();await act(async()=>button("PW AI").click());await act(async()=>button("askPlanwise.notes.scope").click());
  fetchChoices=async()=>{throw Error("Offline");};await act(async()=>button("askPlanwise.notes.choose").click());assert.match(document.body.textContent,/askPlanwise.notes.loadError/);
  const pending=deferred();fetchChoices=()=>pending.promise;await act(async()=>button("askPlanwise.retry").click());assert.match(document.body.textContent,/askPlanwise.notes.loading/);
  user={id:"u2"};await ui.render();await act(async()=>pending.resolve([note("old","Private old-account note")]));
  await act(async()=>button("PW AI").click());assert.doesNotMatch(document.body.textContent,/Private old-account note/);assert.deepEqual(catalogCalls,["u1","u1"]);
  assert.equal(calls.length,0);await ui.close();
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

test("Expenses tab runs review/comparison with exact figures, explicit scope and navigable expense sources",async()=>{
  const fixture=require("./fixtures/expense-insight.cjs"),ui=await mount({pathname:"/expenses"});
  answer=async options=>{const {owner_id,...report}=fixture.report();report.scope.search=options.context.search||null;return{reply:options.context.action==="review"?"Review explanation":"Comparison explanation",quota,report,
    sources:report.current.largest.map(row=>({type:"expense",id:row.id,version:row.version,title:row.note,date:row.date,amount_cents:row.amount_cents}))};};
  await act(async()=>button("PW AI").click());assert.equal(button("askPlanwise.expenses.scope").getAttribute("aria-pressed"),"true");
  await changeInput(document.querySelector('input[type="month"]'),"2026-10");assert.equal(calls.length,0);
  await act(async()=>button("askPlanwise.expenses.analyzeSelected").click());assert.equal(calls.length,1);assert.equal(calls[0].context.type,"expenses");assert.equal(calls[0].context.action,"review");
  assert.match(document.body.textContent,/RM 60\.00/);assert.match(document.body.textContent,/Review explanation/);assert.match(document.body.textContent,/2026-10-01 → 2026-10-31/);
  await act(async()=>button("askPlanwise.expenses.compare").click());assert.equal(calls.length,2);assert.equal(calls[1].context.action,"compare");assert.equal(calls[1].messages.length,1);
  assert.match(document.body.textContent,/RM 40\.00/);assert.match(document.body.textContent,/RM 20\.00/);assert.match(document.body.textContent,/50\.00%/);assert.match(document.body.textContent,/Comparison explanation/);
  const link=document.querySelector('a[href^="/expenses?expense="]');await act(async()=>link.click());assert.ok(navigations[0].startsWith("/expenses?expense="));
  await ui.close();
});

test("expense questions stay separate from general/note chat and invalid filters cannot send",async()=>{
  const ui=await mount();await act(async()=>button("PW AI").click());await type("General draft");
  await act(async()=>button("askPlanwise.expenses.scope").click());assert.equal(document.querySelector("textarea").value,"");
  await changeInput(document.querySelector('input[type="month"]'),"2099-01");await type("Do not send this invalid scope");
  await act(async()=>document.querySelector("form").dispatchEvent(new window.Event("submit",{bubbles:true,cancelable:true})));assert.equal(calls.length,0);assert.match(document.body.textContent,/AI_EXPENSE_INPUT_INVALID/);
  await act(async()=>button("askPlanwise.scope").click());assert.equal(document.querySelector("textarea").value,"General draft");
  await act(async()=>button("askPlanwise.notes.scope").click());assert.doesNotMatch(document.body.textContent,/Do not send this invalid scope/);
  await ui.close();
});

test("late expense report results cannot survive an account switch",async()=>{
  const ui=await mount({pathname:"/expenses"}),pending=deferred();answer=()=>pending.promise;
  await act(async()=>button("PW AI").click());await changeInput(document.querySelector('input[type="month"]'),"2026-10");await type("Private expense question");
  await act(async()=>button("askPlanwise.send").click());assert.equal(calls.length,1);assert.equal(calls[0].context.type,"expenses");
  user={id:"u2"};await ui.render();await act(async()=>pending.resolve({reply:"Private old-account analysis",quota,report:require("./fixtures/expense-insight.cjs").report(),sources:[]}));
  await act(async()=>button("PW AI").click());assert.doesNotMatch(document.body.textContent,/Private old-account analysis|Private expense question|RM 60\.00/);await ui.close();
});
