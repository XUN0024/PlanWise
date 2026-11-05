import { supabase } from "../lib/supabase";
import { NOTE_COLORS } from "../lib/noteColors";

// Keep database names at this boundary; the existing UI uses body and points.
export const noteFromRow = (row) => ({
  id: row.id,
  title: row.title ?? "",
  body: row.content ?? "",
  // Tags are hydrated separately from tags/note_tags, never legacy notes.tags.
  tags: [],
  starred: row.starred ?? false,
  pinned: row.pinned ?? false,
  color: row.color ?? "#F59E0B",
  points: Array.isArray(row.checklist)
    ? row.checklist
      .filter((point) => point && typeof point.id === "string" && point.id.trim())
      .filter((point, index, points) => points.findIndex((item) => item.id === point.id) === index)
      .map((point) => ({
        id: point.id, text: typeof point.text === "string" ? point.text : "", done: point.done === true,
      }))
    : [],
  createdAt: row.created_at,
  updatedAt: row.updated_at ?? row.created_at,
});

// Exclude IDs, ownership and server timestamps from editable note data.
export const noteToRow = (note) => ({
  title: note.title ?? "",
  content: note.body ?? "",
  starred: !!note.starred,
  pinned: !!note.pinned,
  color: note.color ?? "#F59E0B",
  checklist: (note.points ?? []).map((point) => ({
    id: point.id, text: point.text ?? "", done: !!point.done,
  })),
});

export const getNotes = async (userId) => {
  if (!userId) throw new Error("Sign in to view notes");
  const { data, error } = await supabase
    .from("notes")
    .select("id,title,content,starred,pinned,color,checklist,created_at,updated_at")
    .eq("user_id", userId) // RLS is still the permission boundary.
    .order("updated_at", { ascending: false })
    .order("id", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(noteFromRow);
};

const noteError = (code) => Object.assign(new Error(code), { code });
const editableContent = (note) => {
  if (!note.title.trim()) throw noteError("NOTE_TITLE_REQUIRED");
  return { title: note.title.trim(), content: note.body ?? "" };
};

export const createNote = async (note, userId) => {
  if (!userId) throw noteError("NOTE_AUTH_REQUIRED");
  const payload = { ...editableContent(note), id: note.id, user_id: userId };
  const { data, error } = await supabase.from("notes").insert(payload).select().single();
  if (error?.code === "23505") {
    // A lost response may follow a successful insert. Retry with the same UUID.
    const existing = await supabase.from("notes").select("*")
      .eq("id", note.id).eq("user_id", userId).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data && existing.data.title === payload.title && existing.data.content === payload.content) {
      return noteFromRow(existing.data);
    }
    throw noteError("NOTE_CONFLICT");
  }
  if (error) throw error;
  if (!data) throw noteError("NOTE_SAVE_FAILED");
  return noteFromRow(data);
};

export const updateNote = async (note, userId, expectedUpdatedAt) => {
  if (!userId) throw noteError("NOTE_AUTH_REQUIRED");
  if (!expectedUpdatedAt) throw noteError("NOTE_CONFLICT");
  // Only title and content change in this stage. Preserve flags, tags and checklist.
  const { data, error } = await supabase.from("notes").update(editableContent(note))
    .eq("id", note.id).eq("user_id", userId).eq("updated_at", expectedUpdatedAt)
    .select().maybeSingle();
  if (error) throw error;
  if (!data) throw noteError("NOTE_CONFLICT");
  return noteFromRow(data);
};

export const deleteNote = async (note, userId) => {
  if (!userId) throw noteError("NOTE_AUTH_REQUIRED");
  if (!note.updatedAt) throw noteError("NOTE_CONFLICT");
  const { data, error } = await supabase.from("notes").delete()
    .eq("id", note.id).eq("user_id", userId).eq("updated_at", note.updatedAt)
    .select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw noteError("NOTE_CONFLICT");
};

export const updateNoteAppearance = async (note, changes, userId) => {
  if (!userId) throw noteError("NOTE_AUTH_REQUIRED");
  if (!note.updatedAt) throw noteError("NOTE_CONFLICT");
  const keys = Object.keys(changes);
  if (!keys.length || keys.some((key) => !["starred", "pinned", "color"].includes(key))
    || keys.some((key) => key === "color"
      ? !NOTE_COLORS.some((color) => color.value === changes.color)
      : typeof changes[key] !== "boolean")) {
    throw noteError("NOTE_INVALID_APPEARANCE");
  }
  const { data, error } = await supabase.from("notes").update(changes)
    .eq("id", note.id).eq("user_id", userId).eq("updated_at", note.updatedAt)
    .select().maybeSingle();
  if (error) throw error;
  if (!data) throw noteError("NOTE_CONFLICT");
  return noteFromRow(data);
};
