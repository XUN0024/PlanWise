import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getNoteChoices } from "../services/noteService";
import { getTaskChoices } from "../services/taskService";
import { defaultExpenses, defaultTasks, validateWorkspaceContext } from "../../supabase/functions/ask-planwise/workspace-report.mjs";
import { EXPENSE_CATEGORIES, malaysiaDay } from "../../supabase/functions/ask-planwise/expense-report.mjs";
import { legacyExpenseRange, expensePreset, EXPENSE_METHODS } from "../../supabase/functions/ask-planwise/expense-range.mjs";

export function referenceLabel(ref,labels,t){
  if(ref.type==="note")return t("askPlanwise.unified.noteTag",{title:labels["note:"+ref.id]||t("askPlanwise.notes.untitled")});
  if(ref.type==="notes")return t("askPlanwise.unified.myNotes");
  if(ref.type==="tasks")return ref.taskId?t("askPlanwise.unified.taskTag",{title:labels["task:"+ref.taskId]||t("askPlanwise.tasks.selected")}):t("askPlanwise.unified.myTasks")+" · "+t("askPlanwise.unified.status."+ref.status)+(ref.priority?" · "+t("askPlanwise.tasks.priority."+ref.priority):"")+(ref.search?" · "+ref.search:"")+(ref.from||ref.to?" · "+ref.from+"–"+ref.to:"");
  const range=ref.month?ref.month:ref.from||ref.to?(ref.from||"…")+" → "+(ref.to||"…"):t("askPlanwise.expensesRange.allDates");
  return t("askPlanwise.unified.myExpenses")+" · "+range+" · "+(ref.category?t("expensesPanel.categories."+ref.category):t("expensesPanel.filters.allCategories"))+(ref.search?" · "+ref.search:"");
}
export default function AssistantReferences({userId,references,labels,source,initial,onApply,onCancel}){
  const {t}=useTranslation(),[refs,setRefs]=useState(references),[names,setNames]=useState(labels),[section,setSection]=useState(initial||""),[query,setQuery]=useState("");
  const [choices,setChoices]=useState({loading:false,rows:[],error:false,more:false}),[attempt,setAttempt]=useState(0),[error,setError]=useState(false);
  const [expensePeriod,setExpensePeriod]=useState(()=>{const ref=references.find(item=>item.type==="expenses");return ref&&(ref.month||ref.from||ref.to)?"custom":"all";});
  const set=ref=>{setError(false);setRefs(items=>[...items.filter(item=>ref.type==="note"?item.type!=="notes"&&!(item.type==="note"&&item.id===ref.id):ref.type==="notes"?!["note","notes"].includes(item.type):item.type!==ref.type),ref]);};
  const toggle=(type,checked)=>{setError(false);if(!checked)setRefs(items=>items.filter(ref=>type==="notes"?!["note","notes"].includes(ref.type):ref.type!==type));else set(type==="notes"?{type:"notes"}:type==="tasks"?defaultTasks():defaultExpenses());};
  useEffect(()=>{
    if(!["note","task"].includes(section))return;
    let cancelled=false;const controller=new AbortController();setChoices({loading:true,rows:[],error:false,more:false});
    const timer=setTimeout(async()=>{
      try{
        if(section==="note"){
          const rows=source&&!source.loading&&!source.error?source.notes:await getNoteChoices(userId);
          if(!cancelled)setChoices({loading:false,rows,error:false,more:false});
        }else{
          const data=await getTaskChoices(userId,query,controller.signal);
          if(!cancelled)setChoices({loading:false,rows:data.tasks,error:false,more:data.hasMore});
        }
      }catch{if(!cancelled)setChoices({loading:false,rows:[],error:true,more:false});}
    },section==="task"?250:0);
    return()=>{cancelled=true;clearTimeout(timer);controller.abort();};
  },[section,userId,section==="task"?query:"",attempt,source]);
  const task=refs.find(ref=>ref.type==="tasks")||defaultTasks(),expense=legacyExpenseRange(refs.find(ref=>ref.type==="expenses")||defaultExpenses());
  const matches=section==="note"?choices.rows.filter(row=>(row.title||"").toLowerCase().includes(query.toLowerCase())):choices.rows;
  const input="w-full rounded-lg border border-gray-200 p-2 text-sm bg-white";
  return <section aria-label={t("askPlanwise.unified.chooseReferences")} className="p-4 space-y-5">
    <div className="flex justify-between items-center"><h3 className="font-semibold">{t("askPlanwise.unified.chooseReferences")}</h3><button type="button" onClick={onCancel} className="text-sm text-gray-500">{t("askPlanwise.notes.cancel")}</button></div>
    <p className="text-xs text-gray-500">{t("askPlanwise.unified.scopeHelp")}</p>
    <h4 className="text-xs font-semibold text-gray-500 uppercase">{t("askPlanwise.unified.applicationData")}</h4>
    {["notes","tasks","expenses"].map(type=><div key={type} className="rounded-xl border bg-white p-3 space-y-3">
      <div className="flex justify-between gap-3 items-center"><label className="flex gap-2 text-sm"><input type="checkbox" checked={refs.some(ref=>ref.type===type||(type==="notes"&&ref.type==="note"))} onChange={event=>toggle(type,event.target.checked)}/>{t("askPlanwise.unified."+({notes:"myNotes",tasks:"myTasks",expenses:"myExpenses"}[type]))}</label>
        <button type="button" onClick={()=>{if(type!=="notes"&&!refs.some(ref=>ref.type===type))toggle(type,true);setSection(type==="notes"?"note":type==="tasks"?"tasks":"expenses");setQuery("");}} className="text-xs text-violet-700 underline">{t(type==="notes"?"askPlanwise.notes.choose":"askPlanwise.unified.conditions")}</button></div>
      {type==="notes"&&refs.filter(ref=>ref.type==="note").map(ref=><p key={ref.id} className="text-xs text-violet-700">{referenceLabel(ref,names,t)} <button type="button" aria-label={t("askPlanwise.unified.removeReference",{title:referenceLabel(ref,names,t)})} onClick={()=>setRefs(items=>items.filter(item=>item!==ref))}>×</button></p>)}
      {type==="tasks"&&section==="tasks"&&<div className="space-y-3">
        <p className="text-xs text-gray-500">{t("askPlanwise.unified.reminderHint")}</p>
        <button type="button" onClick={()=>{setSection("task");setQuery("");}} className="text-sm text-violet-700 underline">{t("askPlanwise.tasks.choose")}</button>
        {task.taskId?<p className="text-sm">{referenceLabel(task,names,t)} <button type="button" onClick={()=>set(defaultTasks())} className="underline">{t("askPlanwise.tasks.all")}</button></p>:<>
          <label className="block text-xs">{t("askPlanwise.unified.taskStatus")}<select value={task.status} onChange={event=>set({...task,status:event.target.value})} className={input}>{["all","unfinished","completed"].map(status=><option key={status} value={status}>{t("askPlanwise.unified.status."+status)}</option>)}</select></label>
          <label className="block text-xs">{t("askPlanwise.unified.priority")}<select value={task.priority} onChange={event=>set({...task,priority:event.target.value})} className={input}><option value="">{t("askPlanwise.unified.anyPriority")}</option>{["High","Medium","Low"].map(priority=><option key={priority}>{priority}</option>)}</select></label>
          <label className="block text-xs">{t("askPlanwise.unified.taskKeyword")}<input value={task.search} maxLength={200} onChange={event=>set({...task,search:event.target.value})} className={input}/></label>
          <div className="grid grid-cols-2 gap-2">{["from","to"].map(key=><label key={key} className="block text-xs">{t("expensesPanel.filters."+(key==="from"?"dateFrom":"dateTo"))}<input type="date" value={task[key]} onChange={event=>set({...task,[key]:event.target.value})} className={input}/></label>)}</div>
        </>}
      </div>}
      {type==="expenses"&&section==="expenses"&&<div className="space-y-3">
        <label className="block text-xs">{t("expensesPanel.filters.dateRange")}<select value={expensePeriod} onChange={event=>{const value=event.target.value;setExpensePeriod(value);if(value!=="custom")set({...expense,...expensePreset(value)});}} className={input}>
          {["all","this_month","last_month","last_3_months","this_quarter","this_year","custom"].map(key=><option key={key} value={key}>{t("askPlanwise.expensesRange.presets."+key)}</option>)}
        </select></label>
        <div className="grid grid-cols-2 gap-2">{["from","to"].map(key=><label key={key} className="block text-xs">{t("expensesPanel.filters."+(key==="from"?"dateFrom":"dateTo"))}<input type="date" min="1900-01-01" value={expense[key]} onChange={event=>{setExpensePeriod("custom");set({...expense,[key]:event.target.value});}} className={input}/></label>)}</div>
        <label className="block text-xs">{t("expensesPanel.statistics.granularity")}<select value={expense.granularity} onChange={event=>set({...expense,granularity:event.target.value})} className={input}>{["auto","day","month"].map(key=><option key={key} value={key}>{t("expensesPanel.statistics.units."+key)}</option>)}</select></label>
        <label className="block text-xs">{t("askPlanwise.expensesRange.comparison")}<select value={expense.comparison} onChange={event=>set({...expense,comparison:event.target.value,compareFrom:"",compareTo:""})} className={input}>{["none","previous","custom"].map(key=><option key={key} value={key}>{t("askPlanwise.expensesRange.comparisons."+key)}</option>)}</select></label>
        {expense.comparison==="custom"&&<div className="grid grid-cols-2 gap-2">{["compareFrom","compareTo"].map(key=><label key={key} className="block text-xs">{t("askPlanwise.expensesRange."+key)}<input type="date" min="1900-01-01" value={expense[key]} onChange={event=>set({...expense,[key]:event.target.value})} className={input}/></label>)}</div>}
        <label className="block text-xs">{t("askPlanwise.expenses.category")}<select value={expense.category} onChange={event=>set({...expense,category:event.target.value})} className={input}><option value="">{t("expensesPanel.filters.allCategories")}</option>{EXPENSE_CATEGORIES.map(category=><option key={category}>{category}</option>)}</select></label>
        <label className="block text-xs">{t("askPlanwise.expenses.search")}<input value={expense.search} maxLength={1000} onChange={event=>set({...expense,search:event.target.value})} className={input}/></label>
        <label className="block text-xs">{t("askPlanwise.expenses.smallAmount")}<input inputMode="decimal" value={expense.smallAmount} onChange={event=>set({...expense,smallAmount:event.target.value})} className={input}/></label>
        <details><summary className="text-xs text-violet-700 cursor-pointer">{t("askPlanwise.expensesRange.moreFilters")}</summary><div className="mt-3 space-y-3">
          <label className="block text-xs">{t("expensesPanel.paymentMethod")}<select value={expense.paymentMethod} onChange={event=>set({...expense,paymentMethod:event.target.value})} className={input}><option value="">{t("expensesPanel.filters.allMethods")}</option>{EXPENSE_METHODS.map(key=><option key={key} value={key}>{t(key==="unrecorded"?"expensesPanel.notRecorded":"expensesPanel.paymentMethods."+key)}</option>)}</select></label>
          {["minAmount","maxAmount"].map(key=><label key={key} className="block text-xs">{t("expensesPanel.filters."+key)}<input inputMode="decimal" value={expense[key]} onChange={event=>set({...expense,[key]:event.target.value})} className={input}/></label>)}
        </div></details>
      </div>}
    </div>)}
    {["note","task"].includes(section)&&<div className="rounded-xl border bg-white p-3 space-y-3">
      <label className="sr-only" htmlFor="assistant-ref-search">{t(section==="note"?"askPlanwise.notes.search":"askPlanwise.tasks.search")}</label>
      <input autoFocus id="assistant-ref-search" value={query} onChange={event=>setQuery(event.target.value)} placeholder={t(section==="note"?"askPlanwise.notes.search":"askPlanwise.tasks.search")} className={input}/>
      {choices.loading?<p role="status">{t("askPlanwise.tasks.loading")}</p>:choices.error?<div role="alert"><p>{t("askPlanwise.tasks.loadError")}</p><button onClick={()=>setAttempt(value=>value+1)} className="underline">{t("askPlanwise.retry")}</button></div>:!matches.length?<p>{t("askPlanwise.tasks.noResults")}</p>:<ul className="max-h-52 overflow-y-auto space-y-1">{matches.map(row=><li key={row.id}><button type="button" disabled={section==="note"&&(!row.updatedAt||row.saved===false)} onClick={()=>{
        if(section==="note"){set({type:"note",id:row.id,version:row.updatedAt});setNames(items=>({...items,["note:"+row.id]:row.title}));}
        else{set({...defaultTasks(),taskId:row.id});setNames(items=>({...items,["task:"+row.id]:row.title}));}
        setSection(section==="note"?"":"tasks");
      }} className="w-full rounded-lg text-left text-sm p-2 hover:bg-violet-50 disabled:opacity-40">{row.title||t("askPlanwise.notes.untitled")}</button></li>)}</ul>}
      {choices.more&&<p className="text-xs text-gray-500">{t("askPlanwise.tasks.more")}</p>}
    </div>}
    <div className="border-t pt-3 space-y-2"><h4 className="text-xs font-semibold text-gray-500">{t("askPlanwise.unified.computerData")}</h4><p className="text-xs text-gray-500">{t("askPlanwise.unified.folderHint")}</p><button type="button" disabled title={t("askPlanwise.unified.folderHint")} className="rounded-lg border px-3 py-2 text-sm opacity-50">＋ {t("askPlanwise.unified.connectFolder")}</button></div>
    {error&&<p role="alert" className="text-sm text-red-700">{t("askPlanwise.errors.AI_SCOPE_INVALID")}</p>}
    <button type="button" onClick={()=>{try{const context=validateWorkspaceContext({type:"workspace",version:1,references:refs});if(context.references.some(ref=>ref.type==="expenses"&&(ref.month?ref.month>malaysiaDay().slice(0,7):ref.from>malaysiaDay()||ref.compareFrom>malaysiaDay())))throw Error();onApply(context.references,names);}catch{setError(true);}}} className="w-full rounded-lg bg-violet-600 text-white py-2.5">{t("askPlanwise.unified.apply")}</button>
  </section>;
}
