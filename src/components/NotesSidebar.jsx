import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faThumbtack, faTags, faTrash, faSearch, faStar } from "@fortawesome/free-solid-svg-icons";

export default function NotesSidebar({
  notes = [], visibleNotes = notes, selectedId, onSelect,
  search = "", onSearchChange, loading = false, error = false,
  onNew, busy = false,
  onNoteContextMenu,
  tags = [], selectedTagId, onTagSelect, onManageTags, tagsLoading, tagsError,
}) {
  const { t } = useTranslation();
  const [sections, setSections] = useState({ inbox: true, pinned: true, tags: true });
  const pinned = visibleNotes.filter((note) => note.pinned);
  const toggle = (key) => setSections((value) => ({ ...value, [key]: !value[key] }));
  const list = (items) => <ul className="px-2 py-1 space-y-1">{items.map((note) =>
    <li key={note.id} className="flex items-center"
      onContextMenu={(event) => onNoteContextMenu?.(event, note.id)}
      onKeyDown={(event) => {
        if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) onNoteContextMenu?.(event, note.id);
      }}>
      <button disabled={busy} onClick={() => onSelect?.(note.id)} aria-current={selectedId === note.id ? "true" : undefined}
        className={`flex-1 min-w-0 text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 ${selectedId === note.id ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-blue-50"}`}>
        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: note.color }} />
        <span className="truncate">{note.title || t("notesPanel.untitled")}</span>
        {note.starred && <FontAwesomeIcon icon={faStar} className="w-3 h-3 text-amber-500 shrink-0" title={t("notesPanel.starred")} />}
      </button>
      {onNoteContextMenu && <button disabled={busy} aria-haspopup="menu"
        aria-label={t("notesPanel.noteActions", { title: note.title || t("notesPanel.untitled") })}
        onClick={(event) => onNoteContextMenu(event, note.id)}
        className="px-2 py-2 text-gray-500 hover:bg-gray-100 rounded-md">⋯</button>}
    </li>
  )}</ul>;
  return (
    <aside aria-label={t("notesPanel.allNotes")} className="w-full md:w-72 md:shrink-0 md:h-[calc(100vh-4rem)] bg-white border-r border-gray-200 flex flex-col">
      <div className="px-4 pt-4 pb-3 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">{t("notesPanel.allNotes")}</h2>
          <button disabled={loading || error || busy || !onNew} onClick={onNew} className="text-blue-600 text-sm flex items-center disabled:text-gray-400 disabled:cursor-not-allowed">
            <FontAwesomeIcon icon={faPlus} className="w-3 h-3 mr-1" />{t("notesPanel.new")}
          </button>
        </div>
        <div className="mt-3 relative">
          <FontAwesomeIcon icon={faSearch} className="w-3 h-3 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} disabled={loading || error || busy} onChange={(event) => onSearchChange?.(event.target.value)}
            aria-label={t("notesPanel.search")} placeholder={t("notesPanel.search")}
            className="w-full pl-8 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? <p className="p-4 text-sm text-gray-500">{t("notesPanel.loading")}</p>
          : error ? <p className="p-4 text-sm text-gray-500">{t("notesPanel.unavailable")}</p>
          : <>
            <SectionHeader title={t("notesPanel.inbox")} count={visibleNotes.length} open={sections.inbox} onToggle={() => toggle("inbox")} />
            {sections.inbox && (visibleNotes.length ? list(visibleNotes) : <p className="px-4 py-2 text-sm text-gray-500">{t(notes.length ? "notesPanel.noMatches" : "notesPanel.noNotes")}</p>)}
            <SectionHeader title={t("notesPanel.pinned")} icon={faThumbtack} count={pinned.length} open={sections.pinned} onToggle={() => toggle("pinned")} />
            {sections.pinned && (pinned.length ? list(pinned) : <p className="px-4 py-2 text-sm text-gray-500">{t("notesPanel.noPinned")}</p>)}
            <div className="flex items-center pr-3">
              <SectionHeader title={t("notesPanel.tags")} icon={faTags} count={tags.length} open={sections.tags} onToggle={() => toggle("tags")} />
              <button type="button" disabled={busy} onClick={onManageTags} className="mt-4 text-xs text-blue-600 shrink-0 disabled:opacity-40">{t("tagsPanel.manage")}</button>
            </div>
            {selectedTagId && <button type="button" disabled={busy} onClick={() => onTagSelect(null)}
              className="mx-4 my-2 text-xs text-blue-600 underline">{t("tagsPanel.clearFilter")}</button>}
            {sections.tags && (tagsLoading ? <p role="status" className="px-4 py-2 text-xs text-gray-500">{t("tagsPanel.loading")}</p>
              : tagsError ? <p className="px-4 py-2 text-xs text-red-700">{t("tagsPanel.unavailable")}</p>
              : tags.length ? <ul className="px-2 py-2 space-y-1 text-sm text-gray-600">
              {tags.map((tag) => <li key={tag.id}>
                <button type="button" disabled={busy} onClick={() => onTagSelect(tag.id)} aria-pressed={selectedTagId === tag.id}
                  className={`w-full flex items-center gap-2 px-2 py-2 rounded-md text-left ${selectedTagId === tag.id ? "bg-blue-50 text-blue-700" : "hover:bg-gray-50"}`}>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                  <span className="truncate flex-1">#{tag.name}</span><span>{tag.noteCount}</span>
                </button>
              </li>)}
            </ul> : <p className="px-4 py-2 text-sm text-gray-500">{t("notesPanel.noTags")}</p>)}
          </>}
      </div>
      <div className="px-3 py-3 border-t border-gray-100">
        <button disabled title={t("notesPanel.trashUnavailable")} className="px-3 py-2 text-sm text-gray-400 cursor-not-allowed">
          <FontAwesomeIcon icon={faTrash} className="w-3 h-3 mr-2" />{t("notesPanel.trash")}
        </button>
      </div>
    </aside>
  );
}

function SectionHeader({ title, icon, count, open, onToggle }) {
  return <button onClick={onToggle} aria-expanded={open} className="w-full px-4 py-2 mt-4 text-left text-xs font-semibold text-gray-500 flex items-center gap-2">
    {icon && <FontAwesomeIcon icon={icon} className="w-3 h-3" />}
    {title} ({count})<span className="ml-auto">{open ? "−" : "+"}</span>
  </button>;
}
