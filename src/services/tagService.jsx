import { supabase } from "../lib/supabase";
import { validateTag } from "../lib/tagModel";

function stateFromResponse(data, userId) {
  if (!data || !Array.isArray(data.tags) || !Array.isArray(data.links)
    || data.tags.some((tag) => tag.user_id !== userId)) throw new Error("Invalid tag response");
  return {
    tags: data.tags.map((tag) => ({ id: tag.id, name: tag.name, color: tag.color, updatedAt: tag.updated_at })),
    links: data.links.map((link) => ({ noteId: link.note_id, tagId: link.tag_id })),
  };
}
async function call(userId, name, args) {
  if (!userId) throw new Error("TAG_AUTH_REQUIRED");
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (sessionData?.session?.user?.id !== userId) throw new Error("TAG_AUTH_REQUIRED");
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return stateFromResponse(data, userId);
}
export const getTagState = (userId) => call(userId, "get_note_tag_state");
export const createTag = (userId, name, color = "#3B82F6", noteId = null) => {
  const clean = validateTag(name, color);
  return call(userId, "change_note_tag", { p_action: noteId ? "create_attach" : "create",
    p_note_id: noteId, p_name: clean.name, p_color: clean.color });
};
export const setNoteTag = (userId, noteId, tagId, selected) => call(userId, "change_note_tag", {
  p_action: selected ? "attach" : "detach", p_note_id: noteId, p_tag_id: tagId,
});
export const updateTag = (userId, tag, name, color) => {
  const clean = validateTag(name, color);
  return call(userId, "change_note_tag", { p_action: "update", p_tag_id: tag.id,
    p_name: clean.name, p_color: clean.color, p_expected_updated_at: tag.updatedAt });
};
export const deleteTag = (userId, tag) => call(userId, "change_note_tag", {
  p_action: "delete", p_tag_id: tag.id, p_expected_updated_at: tag.updatedAt,
});
