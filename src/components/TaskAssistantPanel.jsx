import React, { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getTaskChoices } from "../services/taskService";

export default function TaskAssistantPanel({userId,scope,choice,busy,onSelect,onFocus,onBreakdown}) {
  const {t}=useTranslation(),searchId=useId(),searchInput=useRef(null);
  const [choosing,setChoosing]=useState(false),[query,setQuery]=useState(""),[attempt,setAttempt]=useState(0);
  const [catalog,setCatalog]=useState({loading:true,tasks:[],hasMore:false,error:false});
  useEffect(()=>{if(choosing)searchInput.current?.focus();},[choosing]);
  useEffect(()=>{
    if(!choosing)return;
    const controller=new AbortController();let cancelled=false;
    setCatalog({loading:true,tasks:[],hasMore:false,error:false});
    const timer=setTimeout(()=>getTaskChoices(userId,query,controller.signal).then(result=>{
      if(!cancelled)setCatalog({...result,loading:false,error:false});
    }).catch(()=>{if(!cancelled)setCatalog({loading:false,tasks:[],hasMore:false,error:true});}),250);
    return()=>{cancelled=true;clearTimeout(timer);controller.abort();};
  },[choosing,query,userId,attempt]);
  const selected=scope.action==="breakdown";
  return <fieldset disabled={busy} className="space-y-3 min-w-0">
    <section className="rounded-xl border border-violet-200 bg-white p-4 space-y-3" aria-label={t("askPlanwise.tasks.context")}>
      <h3 className="font-semibold text-gray-900">{t("askPlanwise.tasks.title")}</h3>
      <p className="text-xs text-gray-500">{t("askPlanwise.tasks.intro")}</p>
      <div className="flex gap-2">
        <button type="button" aria-pressed={!selected} onClick={()=>{onSelect(null);setChoosing(false);}} className={`rounded-lg border px-3 py-2 text-sm ${!selected?"bg-violet-50 border-violet-300 text-violet-800":"text-gray-600"}`}>{t("askPlanwise.tasks.all")}</button>
        <button type="button" aria-pressed={selected} aria-expanded={choosing} onClick={()=>setChoosing(value=>!value)} className={`rounded-lg border px-3 py-2 text-sm ${selected?"bg-violet-50 border-violet-300 text-violet-800":"text-gray-600"}`}>{t("askPlanwise.tasks.choose")}</button>
      </div>
      {selected&&<p className="text-sm font-medium break-words">{choice?.title||t("askPlanwise.tasks.selected")}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={()=>{setChoosing(false);onFocus();}} className="rounded-lg bg-violet-600 text-white px-3 py-2.5 text-sm disabled:opacity-50">{t("askPlanwise.tasks.focus")}</button>
        <button type="button" disabled={!selected||busy} onClick={onBreakdown} className="rounded-lg border border-violet-200 text-violet-700 px-3 py-2.5 text-sm disabled:opacity-40">{t("askPlanwise.tasks.breakdown")}</button>
      </div>
      <p className="text-xs text-gray-500">{t(selected?"askPlanwise.tasks.breakdownHint":"askPlanwise.tasks.focusHint")}</p>
    </section>
    {choosing&&<section className="rounded-xl border bg-white p-4 space-y-3" aria-label={t("askPlanwise.tasks.choose")}>
      <label htmlFor={searchId} className="sr-only">{t("askPlanwise.tasks.search")}</label>
      <input ref={searchInput} id={searchId} value={query} maxLength={200} onChange={event=>setQuery(event.target.value)} placeholder={t("askPlanwise.tasks.search")} className="w-full rounded-lg border p-2 text-sm"/>
      {catalog.loading?<p role="status" className="text-sm text-gray-500">{t("askPlanwise.tasks.loading")}</p>
        :catalog.error?<div role="alert" className="text-sm text-red-700"><p>{t("askPlanwise.tasks.loadError")}</p><button type="button" onClick={()=>setAttempt(value=>value+1)} className="underline mt-2">{t("askPlanwise.retry")}</button></div>
        :!catalog.tasks.length?<p role="status" className="text-sm text-gray-500">{t(query.trim()?"askPlanwise.tasks.noResults":"askPlanwise.tasks.empty")}</p>
        :<ul className="max-h-56 overflow-y-auto space-y-1">{catalog.tasks.map(task=><li key={task.id}>
          <button type="button" aria-pressed={scope.taskId===task.id} onClick={()=>{onSelect(task);setChoosing(false);}} className="w-full rounded-lg p-2 text-left text-sm hover:bg-violet-50">
            <span className="block break-words">{task.title}</span><span className="text-xs text-gray-500">{t(task.is_completed?"askPlanwise.tasks.done":"askPlanwise.tasks.unfinished")} · {t("askPlanwise.tasks.priority."+(task.priority||"Medium"))}</span>
          </button>
        </li>)}</ul>}
      {catalog.hasMore&&<p className="text-xs text-gray-500">{t("askPlanwise.tasks.more")}</p>}
    </section>}
  </fieldset>;
}

export function TaskInsightCard({report,action}) {
  const {t}=useTranslation(),summary=report.summary;
  return <section className="rounded-xl border border-violet-100 bg-violet-50 p-3 text-sm space-y-2" aria-label={t("askPlanwise.tasks.facts")}>
    <p className="font-medium text-violet-900">{t(action==="focus"?"askPlanwise.tasks.focus":"askPlanwise.tasks.preview")}</p>
    <p className="text-xs text-gray-500">{report.as_of} · {t("askPlanwise.tasks.savedOnly")}</p>
    <p>{t("askPlanwise.tasks.counts",summary)}</p>
    <p className="text-xs">{t("askPlanwise.tasks.subtaskCounts",{completed:summary.subtasks_completed,total:summary.subtasks_total})}</p>
    {action==="focus"&&<>
      <p className="text-xs text-gray-600">{t("askPlanwise.tasks.ranking")}</p>
      {!report.tasks.length?<p>{t("askPlanwise.tasks.noUnfinished")}</p>:<ol className="list-decimal pl-5 space-y-1">{report.tasks.map(task=><li key={task.id} className="break-words">{task.title} <span className="text-xs text-gray-500">· {t("askPlanwise.tasks.priority."+task.priority)}{task.reminder_date?" · "+t("askPlanwise.tasks.reminder")+" "+task.reminder_date:""}</span>
        {(task.omitted_subtasks>0||task.text_truncated)&&<span className="block text-xs text-amber-700">{t("askPlanwise.tasks.partial")}</span>}
      </li>)}</ol>}
    </>}
    {action==="breakdown"&&<p className="text-xs text-violet-700">{t("askPlanwise.tasks.notSaved")}</p>}
  </section>;
}
