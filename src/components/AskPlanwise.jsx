import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import { sendChat } from "../services/chatService";
import { buildChatMessages, CHAT_MESSAGE_LIMIT, chatErrorKey } from "../lib/chatModel";

function ChatPanel({turns,draft,setDraft,busy,quota,onSend,onRetry,onStop,onClear,onClose,openerRef}) {
  const {t}=useTranslation(), titleId=useId(),panel=useRef(null),input=useRef(null),bottom=useRef(null),close=useRef(onClose);
  close.current=onClose;
  useEffect(()=>{
    const previous=document.activeElement,root=document.getElementById("root"),inert=root?.inert,overflow=document.body.style.overflow;
    if(root)root.inert=true;document.body.style.overflow="hidden";input.current?.focus();
    const key=event=>{
      if([...document.querySelectorAll('[aria-modal="true"]')].at(-1)!==panel.current)return;
      if(event.key==="Escape"){event.preventDefault();close.current();}
      if(event.key==="Tab"){
        const nodes=[...panel.current.querySelectorAll("button,textarea")].filter(node=>!node.disabled),first=nodes[0],last=nodes.at(-1);
        if(event.shiftKey&&(document.activeElement===first||!panel.current.contains(document.activeElement))){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&(document.activeElement===last||!panel.current.contains(document.activeElement))){event.preventDefault();first?.focus();}
      }
    };
    document.addEventListener("keydown",key,true);
    return()=>{document.removeEventListener("keydown",key,true);document.body.style.overflow=overflow;if(root)root.inert=inert;const target=openerRef.current||previous;if(target?.isConnected)target.focus();};
  },[]);
  useEffect(()=>{bottom.current?.scrollIntoView?.({block:"end",behavior:"smooth"});},[turns,busy]);
  return createPortal(<div className="fixed inset-0 z-[80] bg-black/25 flex justify-end" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
    <aside ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} className="h-full w-full sm:max-w-md bg-gray-50 shadow-2xl flex flex-col">
      <header className="bg-white border-b p-4 flex items-start justify-between gap-3">
        <div><h2 id={titleId} className="text-lg font-semibold text-gray-900">PW AI</h2><span className="inline-block mt-1 rounded-full bg-violet-50 text-violet-700 px-2 py-1 text-xs">{t("askPlanwise.scope")}</span></div>
        <button type="button" onClick={onClose} aria-label={t("askPlanwise.close")} className="rounded-lg px-3 py-2 text-gray-600 hover:bg-gray-100">✕</button>
      </header>
      <p className="px-4 py-3 text-xs text-gray-500 border-b bg-white">{t("askPlanwise.scopeHint")}</p>
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-5" aria-label={t("askPlanwise.conversation")}>
        {!turns.length&&<div className="text-sm text-gray-600 rounded-xl bg-white border p-5"><p className="font-medium text-gray-900 mb-2">{t("askPlanwise.welcome")}</p><p>{t("askPlanwise.welcomeHint")}</p></div>}
        {turns.map((turn,index)=><div key={turn.id} className="space-y-3">
          <div className="ml-8 bg-violet-600 text-white rounded-xl p-3 text-sm whitespace-pre-wrap break-words"><span className="sr-only">{t("askPlanwise.you")}: </span>{turn.question}</div>
          {turn.status==="completed"&&<div className="mr-5 bg-white border rounded-xl p-3 text-sm text-gray-800 whitespace-pre-wrap break-words"><span className="sr-only">PW AI: </span>{turn.answer}</div>}
          {turn.status==="pending"&&<p role="status" className="text-sm text-gray-500">{t("askPlanwise.thinking")}</p>}
          {turn.status==="failed"&&<div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700"><p>{t(chatErrorKey(turn.error))}</p>
            {index===turns.length-1&&<button disabled={busy} type="button" onClick={()=>onRetry(turn)} className="underline mt-2 disabled:opacity-40">{t("askPlanwise.retry")}</button>}
          </div>}
        </div>)}<div ref={bottom}/>
      </div>
      <footer className="border-t bg-white p-4">
        <div className="flex justify-between items-center gap-3 text-xs text-gray-500 mb-3">
          <span>{quota?t("askPlanwise.quota",{remaining:quota.dailyRemaining,limit:quota.dailyLimit}):t("askPlanwise.quotaHint")}</span>
          <button type="button" disabled={busy||!turns.length} onClick={onClear} className="underline disabled:opacity-40">{t("askPlanwise.clear")}</button>
        </div>
        <form onSubmit={event=>{event.preventDefault();onSend();}}>
          <label htmlFor={titleId+"-input"} className="sr-only">{t("askPlanwise.input")}</label>
          <textarea ref={input} id={titleId+"-input"} rows={3} maxLength={CHAT_MESSAGE_LIMIT} value={draft} onChange={event=>setDraft(event.target.value)}
            onKeyDown={event=>{if(event.key==="Enter"&&!event.shiftKey&&!event.nativeEvent.isComposing&&!event.isComposing){event.preventDefault();if(!busy)onSend();}}}
            placeholder={t("askPlanwise.placeholder")} className="w-full resize-none border rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"/>
          <div className="flex items-center justify-between mt-2"><span className="text-xs text-gray-400">{draft.length}/{CHAT_MESSAGE_LIMIT} · GLM-4.7-Flash</span>
            {busy?<button type="button" onClick={onStop} className="rounded-lg border px-4 py-2 text-sm">{t("askPlanwise.stop")}</button>
              :<button type="submit" disabled={!draft.trim()} className="rounded-lg bg-violet-600 text-white px-4 py-2 text-sm disabled:opacity-40">{t("askPlanwise.send")}</button>}
          </div>
        </form>
        <p className="text-xs text-gray-400 mt-3">{t("askPlanwise.memoryHint")}</p>
      </footer>
    </aside>
  </div>,document.body);
}
export function AskPlanwiseSession({userId}) {
  const {t}=useTranslation(),location=useLocation(),[slot,setSlot]=useState(null),[open,setOpen]=useState(false);
  const [turns,setTurns]=useState([]),[draft,setDraft]=useState(""),[busy,setBusy]=useState(false),[quota,setQuota]=useState(null);
  const active=useRef(null),alive=useRef(true),trigger=useRef(null);
  useEffect(()=>{setSlot(document.querySelector("[data-planwise-ai-slot]"));},[location.pathname]);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;active.current?.controller.abort();active.current=null;};},[]);
  const run=async(turn,retrying=false)=>{
    if(active.current)return;
    const controller=new AbortController(),operation={controller,id:turn.id};active.current=operation;setBusy(true);
    setTurns(items=>retrying?items.map(item=>item.id===turn.id?{...turn,status:"pending",error:null}:item):[...items,turn]);
    try {
      const result=await sendChat({userId,requestId:turn.requestId,messages:turn.messages,signal:controller.signal});
      if(!alive.current||active.current!==operation||controller.signal.aborted)return;
      setQuota(result.quota);setTurns(items=>items.map(item=>item.id===turn.id?{...item,status:"completed",answer:result.reply,error:null}:item));
    } catch(error) {
      if(!alive.current||active.current!==operation)return;
      if(error.quota)setQuota(error.quota);
      setTurns(items=>items.map(item=>item.id===turn.id?{...item,status:"failed",error:{code:error.code},retryWithNewId:error.retryWithNewId===true}:item));
    } finally {if(alive.current&&active.current===operation){active.current=null;setBusy(false);}}
  };
  const send=()=>{
    if(active.current||!draft.trim())return;
    let messages;try{messages=buildChatMessages(turns,draft);}catch{return;}
    const requestId=crypto.randomUUID();run({id:requestId,requestId,question:draft.trim(),messages,status:"pending"});setDraft("");
  };
  return <>
    {slot&&createPortal(<button ref={trigger} type="button" aria-label="PW AI" title="PW AI" onClick={()=>setOpen(true)} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-violet-600 text-white px-3 py-2 text-sm hover:bg-violet-700"><span aria-hidden="true">✦</span><span className="hidden sm:inline">PW AI</span></button>,slot)}
    {open&&<ChatPanel openerRef={trigger} turns={turns} draft={draft} setDraft={setDraft} busy={busy} quota={quota} onSend={send}
      onRetry={turn=>run({...turn,requestId:turn.retryWithNewId?crypto.randomUUID():turn.requestId},true)} onStop={()=>active.current?.controller.abort()}
      onClear={()=>{setTurns([]);setDraft("");}} onClose={()=>setOpen(false)}/>}
  </>;
}
export default function AskPlanwise(){const {user}=useAuth();return user?.id?<AskPlanwiseSession key={user.id} userId={user.id}/>:null;}
