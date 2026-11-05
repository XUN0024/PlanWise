import React, { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { noteEditorExtensions } from "../lib/noteEditorExtensions";
import { readNoteDocument, writeNoteDocument } from "../lib/noteRichText";
import NoteFormatToolbar, { applyNoteFormat } from "./NoteFormatToolbar";

export default function NoteRichTextEditor({ body, disabled, initialFormat, onChange, children }) {
  const { t } = useTranslation();
  const change = useRef(onChange);
  change.current = onChange;
  const initialApplied = useRef(false);
  const editor = useEditor({
    extensions: noteEditorExtensions,
    content: readNoteDocument(body),
    immediatelyRender: false,
    editable: !disabled,
    editorProps: {
      attributes: { role: "textbox", "aria-multiline": "true", "aria-label": t("notesPanel.body"), class: "note-rich-text min-h-80 px-3 py-3 focus:outline-none" },
      // File drops belong to NoteAttachments, never the text editor.
      handleDrop: (_view, event) => Array.from(event.dataTransfer?.types || []).includes("Files"),
    },
    onUpdate: ({ editor: current }) => change.current(writeNoteDocument(current.getJSON())),
  });
  // Subscribe to transactions for accurate toggle states on cursor/selection moves.
  useEditorState({ editor, selector: ({ editor: current }) => current ? {
    bold: current.isActive("bold"), underline: current.isActive("underline"), italic: current.isActive("italic"),
    orderedList: current.isActive("orderedList"), bulletList: current.isActive("bulletList"),
  } : null });
  useEffect(() => { editor?.setEditable(!disabled, false); }, [editor, disabled]);
  useEffect(() => {
    if (!editor) return;
    const document = readNoteDocument(body);
    // Don't replace selection/history when parent renders or an autosave finishes.
    if (writeNoteDocument(editor.getJSON()) !== writeNoteDocument(document)) {
      editor.commands.setContent(document, { emitUpdate: false });
    }
  }, [editor, body]);
  useEffect(() => {
    if (!editor || !initialFormat || initialApplied.current) return;
    initialApplied.current = true;
    editor.commands.focus("end");
    applyNoteFormat(editor, initialFormat);
  }, [editor, initialFormat]);
  return <div>
    <NoteFormatToolbar editor={editor} disabled={disabled || !editor} />
    {children}
    <div className="mt-5">
      <p className="text-sm font-medium text-gray-700 mb-2">{t("notesPanel.body")}</p>
      <div className="border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 bg-white text-sm text-gray-700">
        <EditorContent editor={editor} />
      </div>
    </div>
  </div>;
}
