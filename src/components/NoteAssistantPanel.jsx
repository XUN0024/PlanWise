import React, { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getNoteChoices } from "../services/noteService";

function NotePicker({ userId, source, selectedId, onSelect, onCancel }) {
  const { t } = useTranslation(), searchId = useId(), searchInput = useRef(null);
  const [query, setQuery] = useState(""), [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState({ loading: true, notes: [], error: false });
  const usePageNotes = !!source && !source.error;
  useEffect(() => { searchInput.current?.focus(); }, []);
  useEffect(() => {
    if (usePageNotes) return;
    let cancelled = false;
    setLoaded({ loading: true, notes: [], error: false });
    getNoteChoices(userId).then((notes) => {
      if (!cancelled) setLoaded({ loading: false, notes, error: false });
    }).catch(() => {
      if (!cancelled) setLoaded({ loading: false, notes: [], error: true });
    });
    return () => { cancelled = true; };
  }, [userId, usePageNotes, attempt]);
  const { notes, loading, error } = usePageNotes ? source : loaded;
  const matches = notes.filter((note) => (note.title || t("askPlanwise.notes.untitled")).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <section aria-label={t("askPlanwise.notes.choose")} className="rounded-xl border border-violet-200 bg-white p-4">
    <div className="flex items-center justify-between gap-3 mb-3">
      <h3 className="font-medium text-gray-900">{t("askPlanwise.notes.choose")}</h3>
      <button type="button" onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-900">{t("askPlanwise.notes.cancel")}</button>
    </div>
    <label htmlFor={searchId} className="sr-only">{t("askPlanwise.notes.search")}</label>
    <input ref={searchInput} id={searchId} value={query} onChange={(event) => setQuery(event.target.value)}
      placeholder={t("askPlanwise.notes.search")} className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
    {loading ? <p role="status" className="py-5 text-sm text-gray-500">{t("askPlanwise.notes.loading")}</p>
      : error ? <div role="alert" className="py-4 text-sm text-red-700"><p>{t("askPlanwise.notes.loadError")}</p>
        <button type="button" onClick={() => setAttempt((value) => value + 1)} className="underline mt-2">{t("askPlanwise.retry")}</button></div>
      : !notes.length ? <p role="status" className="py-5 text-sm text-gray-500">{t("askPlanwise.notes.empty")}</p>
      : !matches.length ? <p role="status" className="py-5 text-sm text-gray-500">{t("askPlanwise.notes.noResults")}</p>
      : <ul className="mt-3 max-h-64 overflow-y-auto space-y-1">
        {matches.map((note) => <li key={note.id}><button type="button" aria-label={note.title || t("askPlanwise.notes.untitled")} aria-pressed={note.id === selectedId} onClick={() => onSelect(note)}
          className={`w-full flex items-start gap-3 rounded-lg p-3 text-left text-sm hover:bg-violet-50 ${note.id === selectedId ? "bg-violet-50 text-violet-800" : "text-gray-700"}`}>
          <span aria-hidden="true" className="text-violet-500">▤</span><span className="break-words min-w-0">{note.title || t("askPlanwise.notes.untitled")}</span>
          {note.id === selectedId && <span aria-hidden="true" className="ml-auto">✓</span>}
        </button></li>)}
      </ul>}
  </section>;
}

export default function NoteAssistantPanel({ userId, source, note, onSelect, onAsk, onSummarize }) {
  const { t } = useTranslation();
  const [choosing, setChoosing] = useState(false);
  const title = note?.title?.trim() || t("askPlanwise.notes.untitled");
  const status = note?.saveError ? "saveError" : note?.saving ? "saving" : !note?.saved ? "newDraft" : note?.dirty ? "unsaved" : "saved";
  return <div className="space-y-4">
    <section aria-label={t("askPlanwise.notes.context")} className="rounded-xl border border-violet-200 bg-white p-5 shadow-sm">
      <div className="flex justify-between items-start gap-3">
        <span className="inline-flex items-center gap-2 text-xs font-medium text-violet-700"><span aria-hidden="true">▤</span>{t("askPlanwise.notes.context")}</span>
        <button type="button" onClick={() => setChoosing((value) => !value)} aria-expanded={choosing}
          className="text-xs font-medium text-violet-700 hover:underline shrink-0">{t(note ? "askPlanwise.notes.change" : "askPlanwise.notes.choose")}</button>
      </div>
      {note ? <>
        <h3 className="mt-4 text-lg font-semibold text-gray-900 break-words">{t("askPlanwise.notes.headline", { title })}</h3>
        <p role="status" className={`mt-2 text-xs ${status === "saved" ? "text-gray-500" : "text-amber-700"}`}>{t(`askPlanwise.notes.${status}`)}</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" onClick={onAsk} className="rounded-lg bg-violet-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-violet-700">{t("askPlanwise.notes.ask")}</button>
          <button type="button" onClick={onSummarize} className="rounded-lg border border-violet-200 px-3 py-2.5 text-sm font-medium text-violet-700 hover:bg-violet-50">{t("askPlanwise.notes.summarize")}</button>
        </div>
      </> : <div className="mt-4">
        <h3 className="font-medium text-gray-900">{t("askPlanwise.notes.noSelection")}</h3>
        <p className="mt-2 text-sm text-gray-500">{t("askPlanwise.notes.selectHint")}</p>
      </div>}
    </section>
    {choosing && <NotePicker userId={userId} source={source} selectedId={note?.id} onCancel={() => setChoosing(false)}
      onSelect={(choice) => { onSelect(choice); setChoosing(false); }} />}
  </div>;
}
