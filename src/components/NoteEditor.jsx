import React from "react";
import { useTranslation } from "react-i18next";
import NoteRichTextEditor from "./NoteRichTextEditor";

export default function NoteEditor({ draft, isNew, dirty, busy, saving, saved, error, onChange, onSave, onCancel, onDelete, initialFormat, actionsBusy = false, tagControls, saveDisabled = false }) {
  const { t } = useTranslation();
  return (
    <section aria-label={t(isNew ? "notesPanel.new" : "notesPanel.edit")} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="h-2" style={{ backgroundColor: draft.color }} />
      <form onSubmit={onSave} className="p-6">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <h1 className="text-xl font-semibold">{t(isNew ? "notesPanel.new" : "notesPanel.edit")}</h1>
          <div className="flex gap-3 text-sm">
            {!isNew && onDelete && <button type="button" disabled={busy || actionsBusy} onClick={onDelete} className="text-red-600">{t("notesPanel.delete")}</button>}
            <button type="button" disabled={busy || actionsBusy} onClick={onCancel} className="text-gray-500">{t("notesPanel.close")}</button>
          </div>
        </div>
        <div className="flex justify-end mt-2">
          <p role="status" aria-live="polite" className="text-sm text-gray-500">
            {t(busy ? "notesPanel.saving" : dirty || isNew ? "notesPanel.unsaved" : saved ? "notesPanel.saved" : "notesPanel.noChanges")}
          </p>
        </div>
        {error && <p role="alert" className="text-red-700 mb-4">{t(error)}</p>}
        <fieldset disabled={busy && !saving} className="space-y-5 disabled:opacity-60">
          <NoteRichTextEditor key={draft.id} body={draft.body} initialFormat={initialFormat}
            disabled={busy && !saving} onChange={(body) => onChange({ body })}>
          <label className="block text-sm font-medium text-gray-700 mt-5">
            {t("notesPanel.title")}
            <input autoFocus required value={draft.title} onChange={(event) => onChange({ title: event.target.value })}
              className="mt-2 w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </label>
          {tagControls}
          </NoteRichTextEditor>
          <div className="flex justify-end gap-3">
            <button type="submit" disabled={busy || saveDisabled || (!dirty && !isNew)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50">{t("notesPanel.save")}</button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
