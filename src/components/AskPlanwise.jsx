import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import { useNoteAssistant } from "../contexts/NoteAssistantContext";
import NoteAssistantPanel from "./NoteAssistantPanel";
import ExpenseAssistantPanel, { ExpenseInsightCard, expenseMoney } from "./ExpenseAssistantPanel";
import { expenseContextKey, malaysiaDay, validateExpenseContext } from "../../supabase/functions/ask-planwise/expense-report.mjs";
import { sendChat } from "../services/chatService";
import { buildChatMessages, CHAT_MESSAGE_LIMIT, chatErrorKey } from "../lib/chatModel";

function ChatPanel({turns,draft,setDraft,busy,quota,onSend,onRetry,onStop,onClear,onClose,openerRef,
  userId,noteMode,note,notesSource,onChooseNote,onGeneralChat,onNoteMode,onOpenSource,versionChanged,
  expenseMode,expenseScope,onExpenseMode,onExpenseScopeChange,onExpenseRun,expenseError}) {
  const {t}=useTranslation(), titleId=useId(),panel=useRef(null),input=useRef(null),bottom=useRef(null),close=useRef(onClose);
  close.current=onClose;
  useEffect(()=>{
    const previous=document.activeElement,root=document.getElementById("root"),inert=root?.inert,overflow=document.body.style.overflow;
    if(root)root.inert=true;document.body.style.overflow="hidden";
    if(input.current && !input.current.disabled)input.current.focus();else panel.current?.querySelector("button")?.focus();
    const key=event=>{
      if([...document.querySelectorAll('[aria-modal="true"]')].at(-1)!==panel.current)return;
      if(event.key==="Escape"){event.preventDefault();close.current();}
      if(event.key==="Tab"){
        const nodes=[...panel.current.querySelectorAll("button,textarea,input,a[href]")].filter(node=>!node.matches(":disabled")),first=nodes[0],last=nodes.at(-1);
        if(event.shiftKey&&(document.activeElement===first||!panel.current.contains(document.activeElement))){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&(document.activeElement===last||!panel.current.contains(document.activeElement))){event.preventDefault();first?.focus();}
      }
    };
    document.addEventListener("keydown",key,true);
    return()=>{document.removeEventListener("keydown",key,true);document.body.style.overflow=overflow;if(root)root.inert=inert;const target=openerRef.current||previous;if(target?.isConnected)target.focus();};
  },[]);
  useEffect(() => { if(noteMode && note)input.current?.focus(); }, [noteMode,note?.id]);
  useEffect(()=>{bottom.current?.scrollIntoView?.({block:"end",behavior:"smooth"});},[turns,busy]);
  return createPortal(<div className="fixed inset-0 z-[80] bg-black/25 flex justify-end" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
    <aside ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} className="h-full w-full sm:max-w-md bg-gray-50 shadow-2xl flex flex-col">
      <header className="bg-white border-b p-4 flex items-start justify-between gap-3">
        <div><h2 id={titleId} className="text-lg font-semibold text-gray-900">PW AI</h2><span className="inline-block mt-1 rounded-full bg-violet-50 text-violet-700 px-2 py-1 text-xs">{t(expenseMode?"askPlanwise.expenses.scope":noteMode ? "askPlanwise.notes.scope" : "askPlanwise.scope")}</span></div>
        <button type="button" onClick={onClose} aria-label={t("askPlanwise.close")} className="rounded-lg px-3 py-2 text-gray-600 hover:bg-gray-100">✕</button>
      </header>
      <div role="group" aria-label={t("askPlanwise.notes.mode")} className="flex gap-2 px-4 py-3 bg-white border-b">
        <button type="button" disabled={busy} aria-pressed={!noteMode&&!expenseMode} onClick={onGeneralChat}
          className={`flex-1 rounded-lg px-2 py-2 text-sm disabled:opacity-50 ${!noteMode&&!expenseMode ? "bg-violet-100 text-violet-800 font-medium" : "text-gray-500 hover:bg-gray-50"}`}>{t("askPlanwise.scope")}</button>
        <button type="button" disabled={busy} aria-pressed={noteMode} onClick={onNoteMode}
          className={`flex-1 rounded-lg px-3 py-2 text-sm disabled:opacity-50 ${noteMode ? "bg-violet-100 text-violet-800 font-medium" : "text-gray-500 hover:bg-gray-50"}`}>{t("askPlanwise.notes.scope")}</button>
        <button type="button" disabled={busy} aria-pressed={expenseMode} onClick={onExpenseMode}
          className={`flex-1 rounded-lg px-2 py-2 text-sm disabled:opacity-50 ${expenseMode ? "bg-violet-100 text-violet-800 font-medium" : "text-gray-500 hover:bg-gray-50"}`}>{t("askPlanwise.expenses.scope")}</button>
      </div>
      {!noteMode&&!expenseMode && <p className="px-4 py-3 text-xs text-gray-500 border-b bg-white">{t("askPlanwise.scopeHint")}</p>}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-5" aria-label={t("askPlanwise.conversation")}>
        {expenseMode&&<ExpenseAssistantPanel scope={expenseScope} onChange={onExpenseScopeChange} onRun={onExpenseRun} busy={busy}/>}
        {expenseMode&&expenseError&&<p role="alert" className="text-sm text-red-700">{t(chatErrorKey({code:expenseError}))}</p>}
        {noteMode && <fieldset disabled={busy} className="min-w-0"><NoteAssistantPanel key={note?.id || "unselected"} userId={userId} source={notesSource} note={note} onSelect={onChooseNote}
          onAsk={() => input.current?.focus()} onSummarize={() => {
            setDraft(t("askPlanwise.notes.summaryPrompt", { title: note?.title?.trim() || t("askPlanwise.notes.untitled") }), "summarize");
            input.current?.focus();
          }} /></fieldset>}
        {noteMode && versionChanged && <p role="status" className="text-xs text-amber-700">{t("askPlanwise.notes.versionChanged")}</p>}
        {!noteMode&&!expenseMode && !turns.length&&<div className="text-sm text-gray-600 rounded-xl bg-white border p-5"><p className="font-medium text-gray-900 mb-2">{t("askPlanwise.welcome")}</p><p>{t("askPlanwise.welcomeHint")}</p></div>}
        {turns.map((turn,index)=><div key={turn.id} className="space-y-3">
          <div className="ml-8 bg-violet-600 text-white rounded-xl p-3 text-sm whitespace-pre-wrap break-words"><span className="sr-only">{t("askPlanwise.you")}: </span>{turn.question}</div>
          {turn.status==="completed"&&turn.report&&<ExpenseInsightCard report={turn.report} action={turn.context.action}/>}
          {turn.status==="completed"&&<div className="mr-5 bg-white border rounded-xl p-3 text-sm text-gray-800 whitespace-pre-wrap break-words"><span className="sr-only">PW AI: </span>{turn.answer}
            {turn.context?.type==="expenses"&&!!turn.sources?.length&&<p className="mt-3 text-xs text-gray-500">{t("askPlanwise.expenses.exampleSources")}</p>}
            {turn.sources?.map(source => <a key={source.id} href={(source.type==="expense"?"/expenses?expense=":"/notes?note=")+encodeURIComponent(source.id)} className="block mt-3 border-t pt-2 text-xs text-violet-700 hover:underline"
              onClick={event => { if(event.button===0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey){event.preventDefault();onOpenSource(source);} }}>
              {t(source.type==="expense"?"askPlanwise.expenses.source":"askPlanwise.notes.source",{title:source.title || t("askPlanwise.notes.untitled")})} ↗
              {source.type==="expense"&&<span className="block text-gray-500">{source.date} · {expenseMoney(source.amount_cents)}</span>}</a>)}
          </div>}
          {turn.status==="pending"&&<p role="status" className="text-sm text-gray-500">{t(turn.phase === "saving" ? "askPlanwise.notes.waitingForSave" : "askPlanwise.thinking")}</p>}
          {turn.status==="failed"&&<div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700"><p>{t(chatErrorKey(turn.error))}</p>
            {index===turns.length-1&&<button disabled={busy} type="button" onClick={()=>onRetry(turn)} className="underline mt-2 disabled:opacity-40">{t("askPlanwise.retry")}</button>}
          </div>}
        </div>)}<div ref={bottom}/>
      </div>
      <footer className="border-t bg-white p-4">
        <div className="flex justify-between items-center gap-3 text-xs text-gray-500 mb-3">
          <span>{quota?t("askPlanwise.quota",{remaining:quota.dailyRemaining,limit:quota.dailyLimit}):t("askPlanwise.quotaHint")}</span>
          <button type="button" disabled={busy||(!draft && !turns.length)} onClick={onClear} className="underline disabled:opacity-40">{t("askPlanwise.clear")}</button>
        </div>
        <form onSubmit={event=>{event.preventDefault();onSend();}}>
          <label htmlFor={titleId+"-input"} className="sr-only">{t("askPlanwise.input")}</label>
          <textarea ref={input} id={titleId+"-input"} rows={3} maxLength={CHAT_MESSAGE_LIMIT} value={draft} onChange={event=>setDraft(event.target.value)}
            disabled={noteMode && !note} aria-describedby={noteMode ? titleId+"-note-hint" : undefined}
            onKeyDown={event=>{if(event.key==="Enter"&&!event.shiftKey&&!event.nativeEvent.isComposing&&!event.isComposing){event.preventDefault();if(!busy)onSend();}}}
            placeholder={expenseMode?t("askPlanwise.expenses.placeholder"):noteMode ? t(note ? "askPlanwise.notes.placeholder" : "askPlanwise.notes.selectFirst", { title: note?.title?.trim() || t("askPlanwise.notes.untitled") }) : t("askPlanwise.placeholder")} className="w-full resize-none border rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:bg-gray-50"/>
          <div className="flex items-center justify-between mt-2"><span className="text-xs text-gray-400">{draft.length}/{CHAT_MESSAGE_LIMIT} · GLM-4.7-Flash</span>
            {busy?<button type="button" onClick={onStop} className="rounded-lg border px-4 py-2 text-sm">{t("askPlanwise.stop")}</button>
              :<button type="submit" disabled={!draft.trim() || (noteMode && !note)} aria-describedby={noteMode ? titleId+"-note-hint" : undefined} className="rounded-lg bg-violet-600 text-white px-4 py-2 text-sm disabled:opacity-40">{t("askPlanwise.send")}</button>}
          </div>
        </form>
        <p id={titleId+"-note-hint"} className="text-xs text-gray-400 mt-3">{t(expenseMode?"askPlanwise.expenses.scopeHint":noteMode ? "askPlanwise.notes.scopeHint" : "askPlanwise.memoryHint")}</p>
      </footer>
    </aside>
  </div>,document.body);
}
export function AskPlanwiseSession({userId}) {
  const {t}=useTranslation(),location=useLocation(),[slot,setSlot]=useState(null),[open,setOpen]=useState(false);
  const [turns,setTurns]=useState([]),[draft,setDraft]=useState(""),[busy,setBusy]=useState(false),[quota,setQuota]=useState(null);
  const navigate = useNavigate();
  const { source: publishedSource, waitForSavedNote } = useNoteAssistant();
  const notesSource = location.pathname === "/notes" && publishedSource?.userId === userId ? publishedSource : null;
  const contextKey = location.pathname + ":" + (notesSource?.currentNote?.id || "none");
  const [scopeChoice, setScopeChoice] = useState(null), [noteDrafts, setNoteDrafts] = useState({});
  const choice = scopeChoice?.contextKey === contextKey ? scopeChoice : null;
  const mode=choice?.kind || (location.pathname==="/notes"?"note":location.pathname==="/expenses"?"expenses":"chat");
  const noteMode=mode==="note",expenseMode=mode==="expenses";
  const [expenseScope,setExpenseScope]=useState(()=>({type:"expenses",action:"review",month:malaysiaDay().slice(0,7),smallAmount:"20.00",search:"",category:""}));
  const [expenseDrafts,setExpenseDrafts]=useState({}),[expenseError,setExpenseError]=useState(null);
  let expenseKey;try{expenseKey=expenseContextKey(expenseScope);}catch{expenseKey=JSON.stringify(expenseScope);}
  const setExpenseDraft=text=>setExpenseDrafts(items=>({...items,[expenseKey]:text}));
  let note = notesSource?.currentNote || null;
  if (choice?.kind === "note" && choice.note) {
    note = notesSource?.currentNote?.id === choice.note.id ? notesSource.currentNote
      : notesSource && !notesSource.loading && !notesSource.error
        ? notesSource.notes.find((item) => item.id === choice.note.id) || null : choice.note;
  }
  if (!noteMode) note = null;
  const noteDraftKey = note?.id || "unselected";
  const setNoteDraft = (text, action = "ask") => setNoteDrafts((items) => ({ ...items, [noteDraftKey]: { text, action } }));
  const isVisibleTurn = (turn) => expenseMode?turn.context?.type==="expenses"&&expenseContextKey(turn.context)===expenseKey:noteMode ? !!note && !!turn.context && turn.context.noteId === note.id
    && (turn.context.version === note?.updatedAt || (turn.status === "pending" && turn.phase === "saving")) : !turn.context;
  const visibleTurns = turns.filter(isVisibleTurn);
  const versionChanged = noteMode && !!note && turns.some(turn => turn.context && turn.context.noteId === note.id && turn.context.version !== note.updatedAt && turn.status !== "pending");
  const active=useRef(null),alive=useRef(true),trigger=useRef(null);
  useEffect(()=>{setSlot(document.querySelector("[data-planwise-ai-slot]"));},[location.pathname]);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;active.current?.controller.abort();active.current=null;};},[]);
  const run=async(turn,retrying=false)=>{
    if(active.current)return;
    const controller=new AbortController(),operation={controller,id:turn.id};active.current=operation;setBusy(true);
    setTurns(items=>retrying?items.map(item=>item.id===turn.id?{...turn,status:"pending",error:null}:item):[...items,turn]);
    try {
      let prepared = turn;
      if (turn.context?.type==="note" && !turn.submitted) {
        const saved = notesSource?.currentNote?.id === turn.context.noteId
          ? await waitForSavedNote({userId,noteId:turn.context.noteId,signal:controller.signal}) : turn.noteSnapshot;
        if(!alive.current||active.current!==operation||controller.signal.aborted)return;
        if (!saved?.saved || saved.dirty || saved.saving || saved.saveError || !saved.updatedAt)
          throw Object.assign(new Error("AI_NOTE_SAVE_REQUIRED"),{code:"AI_NOTE_SAVE_REQUIRED"});
        prepared = {...turn, phase:"model",submitted:true,context:{...turn.context,version:saved.updatedAt},
          messages:turn.context.version === saved.updatedAt ? turn.messages : buildChatMessages([],turn.question)};
        setTurns(items=>items.map(item=>item.id===turn.id?prepared:item));
      }
      if(controller.signal.aborted)throw Object.assign(new Error("AI_ABORTED"),{code:"AI_ABORTED"});
      const result=await sendChat({userId,requestId:prepared.requestId,messages:prepared.messages,signal:controller.signal,...(prepared.context?{context:prepared.context}:{})});
      if(!alive.current||active.current!==operation||controller.signal.aborted)return;
      setQuota(result.quota);setTurns(items=>items.map(item=>item.id===turn.id?{...item,status:"completed",answer:result.reply,sources:result.sources||[],report:result.report,error:null}:item));
    } catch(error) {
      if(!alive.current||active.current!==operation)return;
      if(error.quota)setQuota(error.quota);
      setTurns(items=>items.map(item=>item.id===turn.id?{...item,status:"failed",error:{code:error.code},retryWithNewId:error.retryWithNewId===true}:item));
      if(turn.context?.type==="note")setNoteDrafts(items=>items[turn.context.noteId]?.text?items:{...items,[turn.context.noteId]:{text:turn.question,action:turn.context.action}});
      if(turn.context?.type==="expenses")setExpenseDrafts(items=>items[expenseContextKey(turn.context)]?items:{...items,[expenseContextKey(turn.context)]:turn.question});
    } finally {if(alive.current&&active.current===operation){active.current=null;setBusy(false);}}
  };
  const sendExpense=(text,action=expenseScope.action,clearDraft=false)=>{
    if(active.current||!text.trim())return;
    try{
      const context=validateExpenseContext({...expenseScope,action});
      if(context.month>malaysiaDay().slice(0,7))throw Object.assign(new Error("AI_EXPENSE_INPUT_INVALID"),{code:"AI_EXPENSE_INPUT_INVALID"});
      const key=expenseContextKey(context),messages=buildChatMessages(turns.filter(turn=>turn.context?.type==="expenses"&&expenseContextKey(turn.context)===key),text);
      setExpenseScope(context);setExpenseError(null);
      const requestId=crypto.randomUUID();run({id:requestId,requestId,question:text.trim(),messages,status:"pending",context});
      if(clearDraft)setExpenseDrafts(items=>({...items,[key]:""}));
    }catch(error){setExpenseError(error.code||"AI_EXPENSE_INPUT_INVALID");}
  };
  const send=()=>{
    if(expenseMode){sendExpense(expenseDrafts[expenseKey]||"",expenseScope.action,true);return;}
    const text=noteMode ? noteDrafts[noteDraftKey]?.text || "" : draft;
    if(active.current||!text.trim()||(noteMode&&!note))return;
    const waiting=noteMode && (!note.saved || note.dirty || note.saving);
    let messages;try{messages=buildChatMessages(waiting?[]:visibleTurns,text);}catch{return;}
    const context=noteMode?{type:"note",noteId:note.id,version:note.updatedAt,action:noteDrafts[noteDraftKey]?.action || "ask"}:null;
    const requestId=crypto.randomUUID();run({id:requestId,requestId,question:text.trim(),messages,status:"pending",phase:waiting?"saving":"model",context,noteSnapshot:note});
    if(noteMode)setNoteDraft("");else setDraft("");
  };
  return <>
    {slot&&createPortal(<button ref={trigger} type="button" aria-label="PW AI" title="PW AI" onClick={()=>setOpen(true)} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-violet-600 text-white px-3 py-2 text-sm hover:bg-violet-700"><span aria-hidden="true">✦</span><span className="hidden sm:inline">PW AI</span></button>,slot)}
    {open&&<ChatPanel openerRef={trigger} turns={visibleTurns} draft={expenseMode?expenseDrafts[expenseKey]||"":noteMode ? noteDrafts[noteDraftKey]?.text || "" : draft} setDraft={expenseMode?setExpenseDraft:noteMode ? setNoteDraft : setDraft} busy={busy} quota={quota} onSend={send}
      userId={userId} noteMode={noteMode} note={note} notesSource={notesSource}
      versionChanged={versionChanged} onOpenSource={source=>{setOpen(false);navigate((source.type==="expense"?"/expenses?expense=":"/notes?note=")+encodeURIComponent(source.id));}}
      expenseMode={expenseMode} expenseScope={expenseScope} expenseError={expenseError}
      onExpenseMode={()=>setScopeChoice({contextKey,kind:"expenses"})}
      onExpenseScopeChange={updates=>{setExpenseScope(value=>({...value,...updates}));setExpenseError(null);}}
      onExpenseRun={action=>sendExpense(t(action==="compare"?"askPlanwise.expenses.comparePrompt":"askPlanwise.expenses.reviewPrompt"),action)}
      onChooseNote={(selected) => setScopeChoice({ contextKey, kind: "note", note: selected })}
      onGeneralChat={() => setScopeChoice({ contextKey, kind: "chat" })}
      onNoteMode={() => { if(!noteMode)setScopeChoice({ contextKey, kind: "note", note: notesSource?.currentNote || null }); }}
      onRetry={turn=>run({...turn,requestId:turn.retryWithNewId?crypto.randomUUID():turn.requestId},true)} onStop={()=>active.current?.controller.abort()}
      onClear={() => {
        setTurns(items=>items.filter(item=>!isVisibleTurn(item)));
        if(expenseMode)setExpenseDraft("");else if(noteMode)setNoteDraft("");else setDraft("");
      }} onClose={()=>setOpen(false)}/>}
  </>;
}
export default function AskPlanwise(){const {user}=useAuth();return user?.id?<AskPlanwiseSession key={user.id} userId={user.id}/>:null;}
