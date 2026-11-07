import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

const noop = () => {};
const NoteAssistantContext = createContext({ source: null, publish: noop, clear: noop,
  waitForSavedNote: async () => { throw Object.assign(new Error("AI_NOTE_SAVE_REQUIRED"), { code: "AI_NOTE_SAVE_REQUIRED" }); } });

// Share only note choices and editor status with the chat UI, never note bodies.
export function noteAssistantChoice(note, state = {}) {
  return note ? {
    id: note.id, title: note.title || "", updatedAt: note.updatedAt || null,
    saved: true, dirty: false, saving: false, saveError: false, ...state,
  } : null;
}

export function NoteAssistantProvider({ children }) {
  const [source, setSource] = useState(null);
  const latest = useRef(null), listeners = useRef(new Set());
  const publish = useCallback((value) => {
    latest.current = value; setSource(value);
    for (const listener of [...listeners.current]) listener();
  }, []);
  const clear = useCallback((userId) => {
    if (latest.current?.userId === userId) publish(null);
  }, [publish]);
  const waitForSavedNote = useCallback(({ userId, noteId, signal }) => new Promise((resolve, reject) => {
    let timer;
    const finish = (error, note) => {
      clearTimeout(timer); listeners.current.delete(check); signal?.removeEventListener("abort", abort);
      if (error) reject(Object.assign(new Error(error), { code: error })); else resolve(note);
    };
    const abort = () => finish("AI_ABORTED");
    const check = () => {
      if (signal?.aborted) return abort();
      const note = latest.current?.userId === userId ? latest.current.currentNote : null;
      if (!note || note.id !== noteId) return finish("AI_NOTE_UNAVAILABLE");
      if (note.saveError || !note.title.trim()) return finish("AI_NOTE_SAVE_REQUIRED");
      if (note.saved && !note.dirty && !note.saving && note.updatedAt) finish(null, note);
    };
    listeners.current.add(check); signal?.addEventListener("abort", abort, { once: true });
    timer = setTimeout(() => finish("AI_NOTE_SAVE_REQUIRED"), 15000);
    check();
  }), []);
  useEffect(() => () => {
    latest.current = null;
    for (const listener of [...listeners.current]) listener();
  }, []);
  const value = useMemo(() => ({ source, publish, clear, waitForSavedNote }), [source, publish, clear, waitForSavedNote]);
  return <NoteAssistantContext.Provider value={value}>{children}</NoteAssistantContext.Provider>;
}

export const useNoteAssistant = () => useContext(NoteAssistantContext);
