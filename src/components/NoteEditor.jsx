import React from "react";
import { useTranslation } from "react-i18next";

export default function NoteEditor({ draft, isNew, dirty, busy, saving, saved, error, onChange, onSave, onCancel }) {
  const { t } = useTranslation();
  return (
    <section aria-label={t(isNew ? "notesPanel.new" : "notesPanel.edit")} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="h-2" style={{ backgroundColor: draft.color }} />
      <form onSubmit={onSave} className="p-6">
        <div className="flex justify-between items-center gap-3 mb-5">
          <h1 className="text-xl font-semibold">{t(isNew ? "notesPanel.new" : "notesPanel.edit")}</h1>
          <p role="status" aria-live="polite" className="text-sm text-gray-500">
            {t(busy ? "notesPanel.saving" : dirty || isNew ? "notesPanel.unsaved" : saved ? "notesPanel.saved" : "notesPanel.noChanges")}
          </p>
        </div>
        {error && <p role="alert" className="text-red-700 mb-4">{t(error)}</p>}
        <fieldset disabled={busy && !saving} className="space-y-5 disabled:opacity-60">
          <label className="block text-sm font-medium text-gray-700">
            {t("notesPanel.title")}
            <input autoFocus required value={draft.title} onChange={(event) => onChange({ title: event.target.value })}
              className="mt-2 w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            {t("notesPanel.body")}
            <textarea rows={14} value={draft.body} onChange={(event) => onChange({ body: event.target.value })}
              className="mt-2 w-full border border-gray-300 rounded-lg px-3 py-2 resize-y focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </label>
          <div className="flex justify-end gap-3">
            <button type="button" disabled={busy} onClick={onCancel} className="px-4 py-2 border rounded-lg">{t("notesPanel.cancel")}</button>
            <button type="submit" disabled={busy || (!dirty && !isNew)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50">{t("notesPanel.save")}</button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
