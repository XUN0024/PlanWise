import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { tagNameKey } from "../lib/tagModel";

export default function NoteTags({ tags = [], selectedIds = [], saved, disabled, onToggle, onCreate }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = new Set(selectedIds);
  const key = tagNameKey(search);
  const matches = tags.filter((tag) => tagNameKey(tag.name).includes(key));
  const exists = tags.some((tag) => tagNameKey(tag.name) === key);
  return <div className="mt-4" role="group" aria-label={t("notesPanel.tags")}>
    <div className="flex flex-wrap items-center gap-2">
      {tags.filter((tag) => selected.has(tag.id)).map((tag) => <span key={tag.id}
        className="inline-flex items-center gap-1 border rounded-full px-2 py-1 text-xs" style={{ color: tag.color, borderColor: tag.color }}>
        <span>#{tag.name}</span>
        <button type="button" disabled={disabled} onClick={() => onToggle(tag.id, false)}
          aria-label={t("tagsPanel.removeFromNote", { name: tag.name })} className="px-1 rounded disabled:opacity-40">×</button>
      </span>)}
      <button type="button" disabled={disabled || !saved} onClick={() => setOpen((value) => !value)}
        aria-expanded={open} className="px-2 py-1 text-sm text-blue-600 border border-dashed border-blue-300 rounded-md disabled:opacity-40">
        + {t("tagsPanel.addToNote")}
      </button>
    </div>
    {!saved && <p className="mt-2 text-xs text-gray-500">{t("tagsPanel.saveFirst")}</p>}
    {open && saved && <div className="mt-2 p-3 rounded-lg border bg-gray-50 max-w-md"
      onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false); } }}>
      <div className="flex gap-2">
        <input autoFocus aria-label={t("tagsPanel.search")} placeholder={t("tagsPanel.search")}
          value={search} onChange={(event) => setSearch(event.target.value)} className="flex-1 min-w-0 px-3 py-2 border rounded-md text-sm"
          onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} />
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-gray-500">{t("notesPanel.close")}</button>
      </div>
      <div className="mt-2 max-h-48 overflow-auto space-y-1">
        {matches.map((tag) => <button type="button" key={tag.id} role="checkbox" aria-checked={selected.has(tag.id)}
          disabled={disabled} onClick={() => onToggle(tag.id, !selected.has(tag.id))}
          className="w-full text-left text-sm flex gap-2 items-center px-2 py-2 hover:bg-white rounded-md disabled:opacity-50">
          <span aria-hidden="true">{selected.has(tag.id) ? "☑" : "☐"}</span>
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
          <span className="break-words min-w-0">{tag.name}</span>
        </button>)}
        {!matches.length && <p className="text-sm text-gray-500 p-2">{t("tagsPanel.noMatches")}</p>}
      </div>
      {key && !exists && <button type="button" disabled={disabled} className="mt-2 text-sm text-blue-600 disabled:opacity-50 break-words"
        onClick={async () => { if (await onCreate(search)) setSearch(""); }}>{t("tagsPanel.createNamed", { name: search.trim() })}</button>}
    </div>}
  </div>;
}
