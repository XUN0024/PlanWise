import React from "react";
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBold, faUnderline, faItalic, faListOl, faListUl } from "@fortawesome/free-solid-svg-icons";

export const NOTE_FORMATS = [
  { name: "bold", command: "toggleBold", icon: faBold },
  { name: "underline", command: "toggleUnderline", icon: faUnderline },
  { name: "italic", command: "toggleItalic", icon: faItalic },
  { name: "orderedList", command: "toggleOrderedList", icon: faListOl },
  { name: "bulletList", command: "toggleBulletList", icon: faListUl },
];

export function applyNoteFormat(editor, name) {
  const format = NOTE_FORMATS.find((item) => item.name === name);
  if (editor && format && editor.isEditable) editor.chain().focus()[format.command]().run();
}

export default function NoteFormatToolbar({ editor, onFormat, disabled = false }) {
  const { t } = useTranslation();
  return <div role="group" aria-label={t("notesPanel.formatting")} className="flex flex-wrap items-center gap-1 mt-4">
    {NOTE_FORMATS.map(({ name, icon }) => <button key={name} type="button"
      aria-label={t(`notesPanel.format.${name}`)} title={t(`notesPanel.format.${name}`)}
      aria-pressed={editor?.isActive(name) || false} disabled={disabled || (!editor && !onFormat)}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onFormat ? onFormat(name) : applyNoteFormat(editor, name)}
      className={`w-9 h-9 rounded-md border text-sm disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${editor?.isActive(name) ? "bg-blue-100 border-blue-300 text-blue-700" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-100"}`}>
      <FontAwesomeIcon icon={icon} />
    </button>)}
  </div>;
}
