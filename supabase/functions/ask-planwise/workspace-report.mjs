import { validateRetrievalCard, retrievalSources } from "./retrieval-report.mjs";
import { validateExpenseContext, validateExpenseReport, malaysiaDay } from "./expense-report.mjs";
import { validateTaskContext, validateTaskReport, taskSources } from "./task-report.mjs";
import { defaultExpenseRange, validateExpenseRange, validateExpenseRangeReport, legacyExpenseRange, rangeSources, previousExpenseRange } from "./expense-range.mjs";
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const fail=()=>{throw Object.assign(new Error("AI_SCOPE_INVALID"),{code:"AI_SCOPE_INVALID",status:400});};
const only=(v,keys)=>v&&typeof v==="object"&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));
const date=v=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
export function validateWorkspaceContext(value){
  if(!only(value,["type","version","references"])||value.type!=="workspace"||value.version!==1||!Array.isArray(value.references)||value.references.length>5)fail();
  const references=value.references.map(ref=>{
    if(!ref||typeof ref!=="object"||Array.isArray(ref))fail();
    if(ref.type==="notes"){
      if(!only(ref,["type","offset","version"])||(ref.offset!==undefined&&(!Number.isSafeInteger(ref.offset)||ref.offset<0||ref.offset>1000000))
        ||(ref.version!==undefined&&!/^[a-f0-9]{32}$/.test(ref.version))||(ref.offset>0&&!ref.version))fail();
      return{type:"notes",...(ref.offset!==undefined?{offset:ref.offset}:{}),...(ref.version!==undefined?{version:ref.version}:{})};
    }
    if(ref.type==="note"){
      if(!only(ref,["type","id","version"])||!UUID.test(ref.id||"")||typeof ref.version!=="string"||ref.version.length>64||!Number.isFinite(Date.parse(ref.version)))fail();
      return{type:"note",id:ref.id,version:ref.version};
    }
    if(ref.type==="tasks"){
      if(!only(ref,["type","taskId","status","priority","search","from","to"])||(ref.taskId!==null&&!UUID.test(ref.taskId||""))
        ||!["all","unfinished","completed"].includes(ref.status)||!["","High","Medium","Low"].includes(ref.priority)
        ||typeof ref.search!=="string"||ref.search.length>200||ref.search.includes("\0")||![ref.from,ref.to].every(v=>v===""||date(v))||(ref.from&&ref.to&&ref.from>ref.to))fail();
      return{type:"tasks",taskId:ref.taskId,status:ref.status,priority:ref.priority,search:ref.search.trim(),from:ref.from,to:ref.to};
    }
    if(ref.type==="expenses"){
      if(ref.month===undefined)return validateExpenseRange(ref);
      if(!only(ref,["type","month","category","search","smallAmount"]))fail();
      const {action,...scope}=validateExpenseContext({...ref,action:"review"});return scope;
    }
    fail();
  });
  const keys=references.map(ref=>ref.type==="note"?"note:"+ref.id:ref.type);
  if(new Set(keys).size!==keys.length||references.filter(ref=>ref.type==="note").length>3
    ||(keys.includes("notes")&&references.some(ref=>ref.type==="note")))fail();
  return{type:"workspace",version:1,references};
}
export const workspaceKey=context=>JSON.stringify(validateWorkspaceContext(context).references.slice().sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
export const defaultTasks=()=>({type:"tasks",taskId:null,status:"all",priority:"",search:"",from:"",to:""});
export const defaultExpenses=()=>defaultExpenseRange();
export const workspaceSources=cards=>{
  const sources=cards.flatMap(card=>card.type==="retrieval"?retrievalSources(card):card.type==="expense_range"?rangeSources(card.report):card.type==="expenses"?[...card.report.current.largest,...card.report.previous.largest].map(row=>({type:"expense",id:row.id,version:row.version,title:row.note,date:row.date,amount_cents:row.amount_cents}))
    :card.type==="tasks"?taskSources(card.report):card.type==="task_query"?card.rows.map(row=>({type:"task",id:row.id,title:row.title,version:row.version}))
    :card.type==="notes"?card.matches.map(row=>({type:"note",id:row.id,title:row.title,version:row.version,snippet:row.snippet})):[]);
  return sources.filter((row,index)=>sources.findIndex(item=>item.type===row.type&&item.id===row.id)===index);
};
export function validateWorkspaceResult(value,context){
  const bad=()=>{throw Object.assign(new Error("AI_WORKSPACE_DATA_INVALID"),{code:"AI_WORKSPACE_DATA_INVALID"});};
  if(!value||value.schema!=="pw-workspace-v1"||workspaceKey(value.scope)!==workspaceKey(context)||!Array.isArray(value.cards)||value.cards.length>5||!Array.isArray(value.checked)||value.checked.some(type=>!["notes","tasks","expenses"].includes(type)))bad();
  const allowed=new Set(context.references.map(ref=>ref.type==="note"?"notes":ref.type)),automatic=!allowed.size;
  if(!automatic&&value.checked.some(type=>!allowed.has(type)))bad();
  const cards=value.cards.map(card=>{
    const module=card.type==="retrieval"?card.module:card.type==="notes"?"notes":card.type==="expense_range"?"expenses":["tasks","task_query"].includes(card.type)?"tasks":card.type;
    if(!value.checked.includes(module)||(!automatic&&!allowed.has(module)))bad();
    if(card.type==="retrieval")return validateRetrievalCard(card,context);
    if(card.type==="expenses"){
      const requested=context.references.find(ref=>ref.type==="expenses");
      const actual=validateExpenseContext(card.context);
      if(requested&&["month","category","search","smallAmount"].some(key=>actual[key]!==validateExpenseContext({...requested,action:actual.action})[key]))bad();
      return{...card,context:actual,report:validateExpenseReport(card.report,actual)};
    }
    if(card.type==="expense_range"){
      const actual=validateExpenseRange(card.context,true),report=validateExpenseRangeReport(card.report,actual),ref=context.references.find(item=>item.type==="expenses");
      if(ref){
        const selected=legacyExpenseRange(ref);
        if(["category","paymentMethod","search"].some(key=>selected[key]&&selected[key]!==actual[key])||selected.smallAmount!==actual.smallAmount
          ||selected.minAmount&&(!actual.minAmount||Number(actual.minAmount)<Number(selected.minAmount))||selected.maxAmount&&(!actual.maxAmount||Number(actual.maxAmount)>Number(selected.maxAmount))
          ||selected.from&&(!actual.from||actual.from<selected.from)||selected.to&&(!actual.to||actual.to>selected.to))bad();
        if(report.previous){
          const baseline=previousExpenseRange(selected,report.scope.date_from,report.scope.as_of);
          const withinCurrent=(!selected.from||report.scope.previous_from>=selected.from)&&(!selected.to||report.scope.previous_to<=selected.to);
          const withinBaseline=baseline&&report.scope.previous_from>=baseline.from&&report.scope.previous_to<=baseline.to;
          if(!withinCurrent&&!withinBaseline)bad();
        }
      }
      return{...card,context:actual,report};
    }
    const taskRef=context.references.find(ref=>ref.type==="tasks");
    if(card.type==="tasks"){
      validateTaskContext(card.context);
      if(taskRef&&(card.context?.taskId!==taskRef.taskId||(!taskRef.taskId&&(taskRef.status!=="all"||taskRef.priority||taskRef.search||taskRef.from||taskRef.to))))bad();
      return{...card,report:validateTaskReport(card.report,card.context)};
    }
    if(card.type==="task_query"){
      if(validateWorkspaceContext({type:"workspace",version:1,references:[card.filter]}).references[0]?.type!=="tasks"||card.filter.taskId!==null)bad();
      if(taskRef&&(taskRef.taskId||["priority","search","from","to"].some(key=>card.filter?.[key]!==taskRef[key])||(taskRef.status!=="all"&&card.filter?.status!==taskRef.status)))bad();
      if(!Array.isArray(card.rows)||card.rows.length>30||!Number.isSafeInteger(card.total)||card.total<card.rows.length||!/^[a-f0-9]{32}$/.test(card.version||""))bad();
      if(new Set(card.rows.map(row=>row?.id)).size!==card.rows.length)bad();
      if(card.rows.some(row=>!UUID.test(row.id||"")||typeof row.title!=="string"||row.title.length>1200||!/^[a-f0-9]{32}$/.test(row.version||"")||typeof row.is_completed!=="boolean"||!["High","Medium","Low"].includes(row.priority)))bad();
      if(card.rows.some(row=>(card.filter.status!=="all"&&row.is_completed!==(card.filter.status==="completed"))||(card.filter.priority&&row.priority!==card.filter.priority)
        ||(row.reminder_date!==null&&!date(row.reminder_date))||(card.filter.from&&(!row.reminder_date||row.reminder_date<card.filter.from))||(card.filter.to&&(!row.reminder_date||row.reminder_date>card.filter.to))))bad();
    }else if(card.type==="notes"){
      const inventory=["overview","count"].includes(card.method),library=context.references.find(ref=>ref.type==="notes");
      if(!Array.isArray(card.matches)||card.matches.length>(inventory?10:5)||!Array.isArray(card.terms)||card.terms.length>8||!Number.isSafeInteger(card.total)||card.total<card.matches.length)bad();
      if(card.terms.some(term=>typeof term!=="string"||!term.length||Array.from(term).length>100)||!["selected","keyword","recent","overview","count"].includes(card.method))bad();
      const specified=context.references.filter(ref=>ref.type==="note");
      if((specified.length>0)!==(card.method==="selected")||(card.method==="selected"&&card.matches.length!==1)||(card.method==="keyword"&&!card.terms.length)||(card.method==="recent"&&card.terms.length))bad();
      if(card.method!=="selected"){
        if(card.libraryTotal===undefined)throw Object.assign(new Error("AI_WORKSPACE_SETUP_REQUIRED"),{code:"AI_WORKSPACE_SETUP_REQUIRED"});
        if(!Number.isSafeInteger(card.libraryTotal)||card.libraryTotal<card.total)bad();
      }
      if(inventory){
        const expectedLimit=card.method==="count"?0:10;
        if(card.terms.length||card.total!==card.libraryTotal||card.limit!==expectedLimit||card.offset!==(library?.offset||0)||!/^[a-f0-9]{32}$/.test(card.version||"")
          ||card.matches.length!==Math.min(expectedLimit,Math.max(0,card.total-card.offset))
          ||card.nextOffset!==(expectedLimit>0&&card.offset+card.matches.length<card.total?card.offset+card.matches.length:null))bad();
        if(library?.version&&library.version!==card.version)bad();
      }
      if(new Set(card.matches.map(row=>row?.id)).size!==card.matches.length)bad();
      if(card.matches.some(row=>!UUID.test(row.id||"")||typeof row.title!=="string"||row.title.length>1200||typeof row.snippet!=="string"||Array.from(row.snippet).length>1600
        ||typeof row.version!=="string"||row.version.length>64||!Number.isFinite(Date.parse(row.version))||(specified.length&&!specified.some(ref=>ref.id===row.id&&ref.version===row.version))))bad();
    }else bad();
    return card;
  });
  return{schema:"pw-workspace-v1",scope:validateWorkspaceContext(context),checked:[...new Set(value.checked)],cards};
}
