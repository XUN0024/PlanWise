import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import { useNoteAssistant } from "../contexts/NoteAssistantContext";
import AssistantReferences, { referenceLabel } from "./AssistantReferences";
import { ExpenseInsightCard, expenseMoney } from "./ExpenseAssistantPanel";
import ExpenseRangeCard from "./ExpenseRangeCard";
import { TaskInsightCard } from "./TaskAssistantPanel";
import { validateWorkspaceContext, workspaceKey, defaultTasks } from "../../supabase/functions/ask-planwise/workspace-report.mjs";
import { sendChat } from "../services/chatService";
import { buildChatMessages, CHAT_MESSAGE_LIMIT, chatErrorKey } from "../lib/chatModel";

const href=source=>(source.type==="task"?"/tasks?task=":source.type==="expense"?"/expenses?expense=":"/notes?note=")+encodeURIComponent(source.id);
function Results({turn,onOpen,onMore,busy}) {
  const {t}=useTranslation();
  return <>
    {turn.workspace?.cards.map((card,index)=>card.type==="expense_range"?<ExpenseRangeCard key={index} report={card.report} action={card.action}/>:card.type==="expenses"?<ExpenseInsightCard key={index} report={card.report} action={card.action}/>
      :card.type==="retrieval"?<section key={index} className="rounded-xl border bg-violet-50 p-3 text-sm space-y-1" aria-label={t("askPlanwise.retrieval.title")}>
        <p className="font-medium">{t("askPlanwise.unified."+({notes:"myNotes",tasks:"myTasks",expenses:"myExpenses"}[card.module]))} · {t("askPlanwise.retrieval."+card.method)}</p>
        <p>{t("askPlanwise.retrieval.candidates",{count:card.candidateCount,shown:card.rows.length})}</p>
        <p className="text-xs text-gray-600">{t("askPlanwise.retrieval.coverage",{indexed:card.indexedCount,total:card.eligibleCount})}</p>
        <p className="text-xs text-gray-600">{card.kind==="task"&&(card.filter.from||card.filter.to)?t("askPlanwise.retrieval.reminder")+": ":""}{[card.filter.from&&card.filter.from+" → "+(card.filter.to||"…"),!card.filter.from&&card.filter.to&&"… → "+card.filter.to,card.filter.category,card.filter.priority,card.filter.status!=="all"&&card.filter.status,card.filter.paymentMethod,card.filter.search,card.filter.minAmount&&"≥ RM "+card.filter.minAmount,card.filter.maxAmount&&"≤ RM "+card.filter.maxAmount].filter(Boolean).join(" · ")||t("askPlanwise.retrieval.all")}</p>
        {card.reason&&<p role="status" className="text-xs text-amber-800">{t("askPlanwise.retrieval.degraded")} · {t("askPlanwise.retrieval.reasons."+card.reason)}</p>}
        {card.indexedCount<card.eligibleCount&&<p className="text-xs text-amber-800">{t("askPlanwise.retrieval.pending")}</p>}
        {!card.rows.length&&<p className="text-xs">{t("askPlanwise.retrieval.empty")}</p>}
        <p className="text-xs text-gray-500">{t(card.kind==="expense"?"askPlanwise.retrieval.expenses":"askPlanwise.retrieval.excerpts")}</p>
      </section>:card.type==="tasks"?<TaskInsightCard key={index} report={card.report} action={card.action}/>
      :card.type==="task_query"?<section key={index} className="rounded-xl border bg-violet-50 p-3 text-sm"><p>{t("askPlanwise.unified.taskMatches",{count:card.total})}</p>{card.total>card.rows.length&&<p className="text-xs text-gray-500">{t("askPlanwise.unified.taskLimit")}</p>}
        <ul className="mt-2 space-y-1">{card.rows.map(row=><li key={row.id}>{row.is_completed?"✓":"○"} {row.title} · {t("askPlanwise.tasks.priority."+row.priority)}{row.reminder_date?" · "+row.reminder_date:""}</li>)}</ul></section>:null)}
    <div className="mr-3 rounded-xl bg-white border p-4 text-sm text-gray-800">
      <p className="whitespace-pre-wrap break-words">{turn.answer}</p>
      {turn.workspace&&<p className="mt-3 text-xs text-gray-500">{t("askPlanwise.unified.checked")}: {turn.workspace.checked.length?turn.workspace.checked.map(type=>t("askPlanwise.unified."+({notes:"myNotes",tasks:"myTasks",expenses:"myExpenses"}[type]))).join(" · "):t("askPlanwise.unified.noLookup")}</p>}
      {turn.workspace?.cards.filter(card=>card.type==="notes").map((card,index)=><section key={index} className="mt-3 rounded-lg bg-violet-50 p-3 text-xs text-gray-600 space-y-2">
        {card.method==="selected"?<p>{t("askPlanwise.unified.specifiedNote")}</p>:<>
          <p className="font-medium text-violet-900">{t("askPlanwise.unified.libraryTotal",{count:card.libraryTotal})}</p>
          {["overview","count"].includes(card.method)?card.method==="overview"&&<p>{t("askPlanwise.unified.notesPage",{from:card.matches.length?card.offset+1:0,to:card.offset+card.matches.length,total:card.libraryTotal})}</p>
            :<p>{t("askPlanwise.unified.noteMatches",{count:card.total})} · {t(card.terms.length?"askPlanwise.unified.keywordSearch":"askPlanwise.unified.recentNotes")}</p>}
          {card.method==="keyword"&&!card.total&&card.libraryTotal>0&&<p>{t("askPlanwise.unified.noKeywordMatch")}</p>}
          {card.nextOffset!=null&&<button type="button" disabled={busy} onClick={()=>onMore(card)} className="text-violet-700 underline disabled:opacity-40">{t("askPlanwise.unified.moreNotes")}</button>}
        </>}
      </section>)}
      {turn.sources?.map(source=><a key={source.type+source.id} href={href(source)} onClick={event=>{if(event.button===0&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey){event.preventDefault();onOpen(source);}}} className="block mt-3 rounded-lg border p-3 text-violet-700 hover:bg-violet-50">
        <span className="text-xs font-medium">{t(source.type==="task"?"askPlanwise.tasks.source":source.type==="expense"?"askPlanwise.expenses.source":"askPlanwise.notes.source",{title:source.title||t("askPlanwise.notes.untitled")})} ↗</span>
        {source.snippet&&<span className="mt-1 block text-xs text-gray-600 whitespace-pre-wrap break-words">{source.snippet}</span>}
        {source.subtask_id&&<span className="block text-xs text-gray-500">{t("askPlanwise.retrieval.child")}</span>}
        {source.type==="expense"&&<span className="block text-xs text-gray-500">{source.date} · {expenseMoney(source.amount_cents)}</span>}
      </a>)}
    </div>
  </>;
}
export function AskPlanwiseSession({userId}) {
  const {t}=useTranslation(),location=useLocation(),navigate=useNavigate(),titleId=useId();
  const {source,waitForSavedNote}=useNoteAssistant();
  const [slot,setSlot]=useState(null),[open,setOpen]=useState(false),[expanded,setExpanded]=useState(false),[picker,setPicker]=useState(null);
  const [references,setReferences]=useState([]),[labels,setLabels]=useState({}),[turns,setTurns]=useState([]),[draft,setDraft]=useState(""),[busy,setBusy]=useState(false),[quota,setQuota]=useState(null),[voiceHint,setVoiceHint]=useState(false);
  const panel=useRef(null),input=useRef(null),bottom=useRef(null),trigger=useRef(null),active=useRef(null),alive=useRef(true),latest=useRef({});
  latest.current={source,references,picker};
  useEffect(()=>{setSlot(document.querySelector("[data-planwise-ai-slot]"));},[location.pathname]);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;active.current?.controller.abort();active.current=null;};},[]);
  useEffect(()=>{
    const ask=event=>{
      const data=event.detail;if(data?.userId!==userId)return;
      try{
        const ref=data.reference,context=validateWorkspaceContext({type:"workspace",version:1,references:[ref]});
        setReferences(context.references);setLabels(items=>({...items,[ref.type==="note"?"note:"+ref.id:"task:"+ref.taskId]:data.title||""}));setPicker(null);setOpen(true);
      }catch{}
    };
    window.addEventListener("planwise:ask",ask);return()=>window.removeEventListener("planwise:ask",ask);
  },[userId]);
  useEffect(()=>{
    if(!open)return;
    const previous=document.activeElement,root=document.getElementById("root"),inert=root?.inert,overflow=document.body.style.overflow;
    if(root)root.inert=true;document.body.style.overflow="hidden";input.current?.focus();
    const key=event=>{
      if(event.key==="Escape"){event.preventDefault();if(latest.current.picker!==null)setPicker(null);else setOpen(false);}
      if(event.key==="Tab"){
        const nodes=[...panel.current.querySelectorAll("button,textarea,input,select,a[href]")].filter(node=>!node.matches(":disabled")),first=nodes[0],last=nodes.at(-1);
        if(event.shiftKey&&(document.activeElement===first||!panel.current.contains(document.activeElement))){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&(document.activeElement===last||!panel.current.contains(document.activeElement))){event.preventDefault();first?.focus();}
      }
    };
    document.addEventListener("keydown",key,true);
    return()=>{document.removeEventListener("keydown",key,true);document.body.style.overflow=overflow;if(root)root.inert=inert;const target=trigger.current||previous;if(target?.isConnected)target.focus();};
  },[open]);
  useEffect(()=>{bottom.current?.scrollIntoView?.({block:"end",behavior:"smooth"});},[turns,busy]);
  const run=async(turn,retrying=false)=>{
    if(active.current)return;
    const controller=new AbortController(),operation={controller};active.current=operation;setBusy(true);
    setTurns(items=>retrying?items.map(item=>item.id===turn.id?{...turn,status:"pending",error:null}:item):[...items,turn]);
    try{
      const refs=[];
      for(const ref of turn.context.references){
        const current=latest.current.source?.userId===userId?latest.current.source.currentNote:null;
        if(ref.type==="note"&&current?.id===ref.id){
          setTurns(items=>items.map(item=>item.id===turn.id?{...item,phase:"saving"}:item));
          const saved=await waitForSavedNote({userId,noteId:ref.id,signal:controller.signal});
          refs.push({...ref,version:saved.updatedAt});
        }else refs.push(ref);
      }
      if(!alive.current||active.current!==operation)return;
      if(controller.signal.aborted)throw Object.assign(new Error("AI_ABORTED"),{code:"AI_ABORTED"});
      const context=validateWorkspaceContext({...turn.context,references:refs});
      const prepared={...turn,context,phase:"model"};
      if(workspaceKey(context)!==workspaceKey(turn.context)){
        prepared.messages=buildChatMessages([],turn.question);
        setReferences(items=>items.map(ref=>refs.find(item=>item.type==="note"&&ref.type==="note"&&item.id===ref.id)||ref));
      }
      setTurns(items=>items.map(item=>item.id===turn.id?prepared:item));
      const result=await sendChat({userId,requestId:prepared.requestId,messages:prepared.messages,context,signal:controller.signal});
      if(!alive.current||active.current!==operation)return;
      if(controller.signal.aborted)throw Object.assign(new Error("AI_ABORTED"),{code:"AI_ABORTED"});
      setQuota(result.quota);setTurns(items=>items.map(item=>item.id===turn.id?{...item,status:"completed",answer:result.reply,sources:result.sources||[],workspace:result.workspace,error:null}:item));
    }catch(error){
      if(!alive.current||active.current!==operation)return;
      if(error.quota)setQuota(error.quota);
      setTurns(items=>items.map(item=>item.id===turn.id?{...item,status:"failed",error:{code:error.code},retryWithNewId:error.retryWithNewId===true}:item));setDraft(value=>value||turn.question);
    }finally{if(alive.current&&active.current===operation){active.current=null;setBusy(false);}}
  };
  const send=(text=draft)=>{
    if(active.current||picker!==null||!text.trim())return;
    try{
      const context=validateWorkspaceContext({type:"workspace",version:1,references});
      const messages=buildChatMessages(turns.filter(turn=>workspaceKey(turn.context)===workspaceKey(context)),text),requestId=crypto.randomUUID();
      run({id:requestId,requestId,question:text.trim(),messages,context,labels:{...labels},status:"pending"});setDraft("");
    }catch{}
  };
  const moreNotes=(turn,card)=>{
    if(active.current||card.nextOffset==null)return;
    const context=validateWorkspaceContext({...turn.context,references:[{type:"notes",offset:card.nextOffset,version:card.version}]}),question=t("askPlanwise.unified.continueNotes"),requestId=crypto.randomUUID();
    setReferences([{type:"notes"}]);
    run({id:requestId,requestId,question,context,labels:turn.labels||{},messages:buildChatMessages([],question),status:"pending"});
  };
  const retry=turn=>{
    const restart=turn.error?.code==="AI_NOTES_CHANGED";
    const context=restart?{...turn.context,references:turn.context.references.map(ref=>ref.type==="notes"?{type:"notes"}:ref)}:turn.context;
    run({...turn,context,messages:restart?buildChatMessages([],turn.question):turn.messages,requestId:restart||turn.retryWithNewId?crypto.randomUUID():turn.requestId},true);
  };
  return <>
    {slot&&createPortal(<button ref={trigger} type="button" aria-label="PW AI" title="PW AI" onClick={()=>setOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 text-white px-3 py-2 text-sm"><span aria-hidden="true">✦</span><span className="hidden sm:inline">PW AI</span></button>,slot)}
    {open&&createPortal(<div className="fixed inset-0 z-[80] bg-black/25 flex justify-end" onMouseDown={event=>{if(event.target===event.currentTarget)setOpen(false);}}>
      <aside ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} className={["h-full w-full bg-gray-50 shadow-2xl flex flex-col",expanded?"sm:max-w-4xl":"sm:max-w-md"].join(" ")}>
        <header className="bg-white border-b p-4 flex justify-between items-center gap-3">
          <h2 id={titleId} className="text-lg font-semibold">PW AI</h2>
          <div className="flex gap-1 text-sm text-gray-600">
            <button type="button" disabled={busy} onClick={()=>{setTurns([]);setDraft("");setReferences([]);setLabels({});setPicker(null);setVoiceHint(false);}} className="rounded-lg px-2 py-2 disabled:opacity-40">{t("askPlanwise.unified.newChat")}</button>
            <button type="button" onClick={()=>setExpanded(value=>!value)} aria-label={t(expanded?"askPlanwise.unified.collapse":"askPlanwise.unified.expand")} className="rounded-lg px-2 py-2">{expanded?"↙":"↗"}</button>
            <button type="button" onClick={()=>setOpen(false)} aria-label={t("askPlanwise.close")} className="rounded-lg px-2 py-2">✕</button>
          </div>
        </header>
        <div className="flex-1 min-h-0 overflow-y-auto" aria-label={t("askPlanwise.conversation")}>
          {picker!==null?<AssistantReferences key={picker} userId={userId} references={references} labels={labels} source={source?.userId===userId?source:null} initial={picker} onCancel={()=>setPicker(null)} onApply={(refs,names)=>{setReferences(refs);setLabels(names);setPicker(null);input.current?.focus();}}/>
          :<div className="p-4 space-y-5">
            {!turns.length&&<div className="rounded-xl border bg-white p-5 text-sm space-y-3">
              <h3 className="font-medium">{t("askPlanwise.welcome")}</h3><p className="text-gray-500">{t("askPlanwise.unified.welcome")}</p>
              <div className="flex flex-wrap gap-2">{["focus","expenses","findNotes"].map(key=><button key={key} type="button" disabled={busy} onClick={()=>send(t("askPlanwise.unified.prompts."+key))} className="rounded-full border px-3 py-1.5 text-xs text-violet-700">{t("askPlanwise.unified.shortcuts."+key)}</button>)}</div>
            </div>}
            {turns.map((turn,index)=><div key={turn.id} className="space-y-3">
              <div className="ml-8 rounded-xl bg-violet-600 text-white p-3 text-sm whitespace-pre-wrap break-words">{turn.question}</div>
              <p className="text-xs text-gray-400">{t("askPlanwise.unified.requestScope")}: {turn.context.references.length?turn.context.references.map(ref=>referenceLabel(ref,turn.labels||labels,t)).join(" · "):t("askPlanwise.unified.auto")}</p>
              {turn.status==="completed"&&<Results turn={turn} busy={busy} onMore={card=>moreNotes(turn,card)} onOpen={source=>{setOpen(false);navigate(href(source));}}/>}
              {turn.status==="pending"&&<p role="status" className="text-sm text-gray-500">{t(turn.phase==="saving"?"askPlanwise.notes.waitingForSave":"askPlanwise.thinking")}</p>}
              {turn.status==="failed"&&<div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700"><p>{t(chatErrorKey(turn.error))}</p>{index===turns.length-1&&<button type="button" disabled={busy} onClick={()=>retry(turn)} className="underline mt-2">{t("askPlanwise.retry")}</button>}</div>}
            </div>)}<div ref={bottom}/>
          </div>}
        </div>
        <footer className="border-t bg-white p-4 space-y-3">
          <div className="flex flex-wrap gap-2 items-center text-xs">
            <span className="text-gray-500">{t("askPlanwise.unified.referenceScope")}: {!references.length&&t("askPlanwise.unified.auto")}</span>
            {references.map((ref,index)=><span key={ref.type+(ref.id||"")} className="inline-flex max-w-full items-center rounded-full bg-violet-50 text-violet-800">
              <button type="button" disabled={busy} onClick={()=>setPicker(ref.type==="note"?"note":ref.type)} className="px-2 py-1 truncate max-w-64">{referenceLabel(ref,labels,t)}</button>
              <button type="button" disabled={busy} aria-label={t("askPlanwise.unified.removeReference",{title:referenceLabel(ref,labels,t)})} onClick={()=>setReferences(items=>items.filter((_,i)=>i!==index))} className="px-2 py-1">×</button>
            </span>)}
            <button type="button" disabled={busy} onClick={()=>setPicker("")} className="rounded-full border px-2 py-1 text-violet-700 disabled:opacity-40">＋ {t("askPlanwise.unified.addReference")}</button>
          </div>
          <form onSubmit={event=>{event.preventDefault();send();}}>
            <label htmlFor={titleId+"-input"} className="sr-only">{t("askPlanwise.input")}</label>
            <textarea ref={input} id={titleId+"-input"} rows={3} maxLength={CHAT_MESSAGE_LIMIT} value={draft} onChange={event=>setDraft(event.target.value)}
              onKeyDown={event=>{if(event.key==="Enter"&&!event.shiftKey&&!event.nativeEvent.isComposing&&!event.isComposing){event.preventDefault();if(!busy)send();}}}
              placeholder={t("askPlanwise.unified.placeholder")} className="w-full resize-none rounded-xl border p-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"/>
            <div className="flex justify-between items-center mt-2 gap-2">
              <span className="text-xs text-gray-400">{draft.length}/{CHAT_MESSAGE_LIMIT}</span>
              <div className="flex gap-2"><button type="button" aria-label={t("askPlanwise.unified.voice")} title={t("askPlanwise.unified.voiceHint")} onClick={()=>setVoiceHint(value=>!value)} className="rounded-lg border px-3 py-2 text-sm">🎙</button>
                {busy?<button type="button" onClick={()=>active.current?.controller.abort()} className="rounded-lg border px-4 py-2 text-sm">{t("askPlanwise.stop")}</button>:<button type="submit" disabled={!draft.trim()||picker!==null} className="rounded-lg bg-violet-600 text-white px-4 py-2 text-sm disabled:opacity-40">{t("askPlanwise.send")}</button>}
              </div>
            </div>
          </form>
          {voiceHint&&<p role="status" className="text-xs text-gray-500">{t("askPlanwise.unified.voiceHint")}</p>}
          <p className="text-xs text-gray-400">{quota?t("askPlanwise.quota",{remaining:quota.dailyRemaining,limit:quota.dailyLimit}):t("askPlanwise.quotaHint")} · {t("askPlanwise.unified.readOnly")}</p>
        </footer>
      </aside>
    </div>,document.body)}
  </>;
}
export default function AskPlanwise(){const {user}=useAuth();return user?.id?<AskPlanwiseSession key={user.id} userId={user.id}/>:null;}
