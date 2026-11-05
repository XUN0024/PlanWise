import { NOTE_COLORS } from "./noteColors";

export const tagName = (value) => typeof value === "string" ? value.trim() : "";
export const tagNameKey = (value) => tagName(value).toLowerCase();
export function validateTag(name, color = "#3B82F6") {
  const value = tagName(name);
  if (!value || Array.from(value).length > 100) throw Object.assign(new Error("TAG_INVALID_NAME"), { code: "TAG_INVALID_NAME" });
  if (!NOTE_COLORS.some((item) => item.value === color)) throw Object.assign(new Error("TAG_INVALID_COLOR"), { code: "TAG_INVALID_COLOR" });
  return { name: value, color };
}

export function notesWithTags(notes, state) {
  const tagMap = new Map(state.tags.map((tag) => [tag.id, tag]));
  const byNote = new Map();
  for (const link of state.links) {
    if (!tagMap.has(link.tagId)) continue;
    if (!byNote.has(link.noteId)) byNote.set(link.noteId, new Set());
    byNote.get(link.noteId).add(link.tagId);
  }
  return notes.map((note) => {
    const tagIds = [...(byNote.get(note.id) || [])];
    return { ...note, tagIds, tags: tagIds.map((id) => tagMap.get(id).name) };
  });
}

export function tagsWithCounts(state, noteIds = null) {
  return state.tags.map((tag) => ({ ...tag,
    noteCount: new Set(state.links.filter((link) => link.tagId === tag.id && (!noteIds || noteIds.has(link.noteId))).map((link) => link.noteId)).size,
  })).sort((a, b) => a.name.localeCompare(b.name));
}

export const tagErrorKey = (error) => {
  const code = error?.code || "";
  const message = error?.message || "";
  if (["PGRST202", "PGRST205", "42P01", "42883"].includes(code)) return "tagsPanel.setupRequired";
  if (code === "23505") return "tagsPanel.duplicate";
  if (/TAG_INVALID_NAME/.test(code + message)) return "tagsPanel.invalidName";
  if (/TAG_INVALID_COLOR/.test(code + message)) return "tagsPanel.invalidColor";
  if (/TAG_CONFLICT|TAG_NOT_FOUND|TAG_NOTE_NOT_FOUND/.test(message)) return "tagsPanel.conflict";
  return "tagsPanel.writeError";
};
