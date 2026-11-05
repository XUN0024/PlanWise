import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { NOTE_COLORS } from "../lib/noteColors";
import { tagNameKey } from "../lib/tagModel";

function Colors({ value, onChange, disabled }) {
  const { t } = useTranslation();
  return <div role="group" aria-label={t("tagsPanel.color")} className="flex flex-wrap gap-2">
    {NOTE_COLORS.map((color) => <button key={color.value} type="button" disabled={disabled}
      aria-label={t(`notesPanel.colors.${color.name}`)} aria-pressed={value === color.value}
      onClick={() => onChange(color.value)} style={{ backgroundColor: color.value }}
      className={`w-6 h-6 rounded-full border-2 ${value === color.value ? "border-gray-900 ring-2 ring-offset-1 ring-gray-300" : "border-white"}`} />)}
  </div>;
}

export default function TagManagerModal({ tags = [], busy = false, disabled = false, unavailable = false, loading, error, onReload, onClose, onCreate, onUpdate, onDelete }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [color, setColor] = useState("#3B82F6");
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const panel = useRef(null);
  const locked = busy || disabled || loading || unavailable;
  const close = useRef();
  close.current = () => { if (!busy) { if (deleting) setDeleting(null); else onClose(); } };
  useEffect(() => {
    const previous = document.activeElement;
    panel.current?.querySelector("input,button")?.focus();
    const keyboard = (event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close.current(); }
      if (event.key === "Tab") {
        const controls = [...panel.current.querySelectorAll('button:not(:disabled),input:not(:disabled)')];
        const first = controls[0], last = controls[controls.length - 1];
        if (!first) { event.preventDefault(); panel.current.focus(); }
        else if (event.shiftKey && (document.activeElement === first || !panel.current.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !panel.current.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", keyboard, true);
    return () => { document.removeEventListener("keydown", keyboard, true); previous?.isConnected && previous.focus(); };
  }, []);
  useEffect(() => { panel.current?.querySelector("input,button:not(:disabled)")?.focus(); }, [!!deleting]);
  const duplicate = tags.some((tag) => tagNameKey(tag.name) === tagNameKey(name));
  return <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
    <section ref={panel} tabIndex={-1} role={deleting ? "alertdialog" : "dialog"} aria-modal="true" aria-labelledby="tag-manager-title"
      className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
      <header className="p-5 border-b flex justify-between gap-3">
        <h2 id="tag-manager-title" className="text-lg font-semibold">{t(deleting ? "tagsPanel.deleteTitle" : "tagsPanel.manage")}</h2>
        <button type="button" disabled={busy} onClick={() => close.current()} className="text-sm text-gray-500">{t("notesPanel.close")}</button>
      </header>
      <div className="p-5 overflow-y-auto">
        {error && <div role="alert" className="mb-4 text-sm text-red-700">
          <p>{t(error)}</p><button type="button" disabled={busy || disabled || loading} onClick={() => { setEditing(null); setDeleting(null); onReload(); }} className="underline mt-2">{t("notesPanel.retry")}</button>
        </div>}
        {deleting ? <>
          <p className="break-words font-medium">#{deleting.name}</p>
          <p className="text-sm text-gray-600 mt-3">{t("tagsPanel.deleteBody", { count: deleting.noteCount })}</p>
          <div className="mt-5 flex justify-end gap-3">
            <button type="button" disabled={busy} onClick={() => setDeleting(null)}>{t("notesPanel.cancel")}</button>
            <button type="button" disabled={locked} className="text-red-600" onClick={async () => {
              if (await onDelete(deleting)) setDeleting(null);
            }}>{t(busy ? "notesPanel.deleting" : "notesPanel.confirmDelete")}</button>
          </div>
        </> : <>
          <input aria-label={t("tagsPanel.search")} placeholder={t("tagsPanel.search")} value={search}
            onChange={(event) => setSearch(event.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
          <form className="my-4 p-3 bg-gray-50 border rounded-lg space-y-3" onSubmit={async (event) => {
            event.preventDefault(); if (locked || duplicate) return;
            if (await onCreate(name, color)) { setName(""); setColor("#3B82F6"); }
          }}>
            <label className="block text-sm">{t("tagsPanel.new")}
              <input value={name} disabled={locked} onChange={(event) => setName(event.target.value)}
                className="mt-2 w-full px-3 py-2 border rounded-md" aria-label={t("tagsPanel.name")} />
            </label>
            <Colors value={color} onChange={setColor} disabled={locked} />
            {duplicate && <p className="text-xs text-red-700">{t("tagsPanel.duplicate")}</p>}
            <button type="submit" disabled={locked || !name.trim() || duplicate} className="px-3 py-2 text-sm bg-blue-600 text-white rounded-md disabled:opacity-40">{t(busy ? "tagsPanel.saving" : "tagsPanel.create")}</button>
          </form>
          {loading ? <p role="status">{t("tagsPanel.loading")}</p> : <ul className="divide-y border rounded-lg">
            {tags.filter((tag) => tagNameKey(tag.name).includes(tagNameKey(search))).map((tag) => <li key={tag.id} className="p-3">
              {editing?.id === tag.id ? <form className="space-y-3" onSubmit={async (event) => {
                event.preventDefault(); if (locked) return;
                if (await onUpdate(editing, editing.name, editing.color)) setEditing(null);
              }}>
                <input autoFocus disabled={locked} aria-label={t("tagsPanel.rename")} value={editing.name}
                  onChange={(event) => setEditing({ ...editing, name: event.target.value })} className="w-full border rounded px-3 py-2 text-sm" />
                <Colors value={editing.color} onChange={(next) => setEditing({ ...editing, color: next })} disabled={locked} />
                <div className="flex gap-3 text-sm">
                  <button type="submit" disabled={locked || !editing.name.trim()} className="text-blue-600">{t("notesPanel.save")}</button>
                  <button type="button" disabled={busy} onClick={() => setEditing(null)}>{t("notesPanel.cancel")}</button>
                </div>
              </form> : <div className="flex gap-3 items-center text-sm">
                <span style={{ backgroundColor: tag.color }} className="w-3 h-3 rounded-full shrink-0" />
                <div className="flex-1 min-w-0"><p className="break-words">{tag.name}</p><p className="text-xs text-gray-500">{t("tagsPanel.noteCount", { count: tag.noteCount })}</p></div>
                <button type="button" disabled={locked} onClick={() => setEditing({ ...tag })} className="text-blue-600">{t("tagsPanel.rename")}</button>
                <button type="button" disabled={locked} onClick={() => setDeleting({ ...tag })} className="text-red-600">{t("notesPanel.delete")}</button>
              </div>}
            </li>)}
            {!tags.some((tag) => tagNameKey(tag.name).includes(tagNameKey(search))) && <li className="p-5 text-sm text-gray-500">{t("tagsPanel.noMatches")}</li>}
          </ul>}
        </>}
      </div>
    </section>
  </div>;
}
