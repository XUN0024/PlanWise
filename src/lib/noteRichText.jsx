// Versioned JSON lives in the existing notes.content text column. Legacy text
// stays literal (including HTML-looking text); no saved HTML is ever executed.
export const RICH_TEXT_PREFIX = "planwise-richtext:v1:";
const MARKS = ["bold", "italic", "underline"];

export function normalizeNoteDocument(value) {
  let count = 0;
  const node = (item, parent, depth = 0) => {
    if (!item || typeof item !== "object" || depth > 64 || ++count > 20000) throw Error("Invalid note document");
    const allowed = parent === null ? ["doc"] : parent === "doc" || parent === "listItem"
      ? ["paragraph", "bulletList", "orderedList"] : ["bulletList", "orderedList"].includes(parent)
        ? ["listItem"] : parent === "paragraph" ? ["text", "hardBreak"] : [];
    if (!allowed.includes(item.type)) throw Error("Unsupported note node");
    if (item.type === "text") {
      if (typeof item.text !== "string" || !item.text.length) throw Error("Invalid text");
      const marks = MARKS.filter((type) => item.marks?.some((mark) => mark?.type === type)).map((type) => ({ type }));
      return { type: "text", text: item.text, ...(marks.length ? { marks } : {}) };
    }
    if (item.type === "hardBreak") return { type: "hardBreak" };
    if (item.content !== undefined && !Array.isArray(item.content)) throw Error("Invalid note children");
    const content = (item.content || []).map((child) => node(child, item.type, depth + 1));
    if (item.type === "listItem" && content[0]?.type !== "paragraph") throw Error("Invalid list item");
    if (["doc", "bulletList", "orderedList"].includes(item.type) && !content.length) throw Error("Empty block");
    const attrs = item.type === "orderedList" ? {
      start: Number.isInteger(item.attrs?.start) && item.attrs.start > 0 && item.attrs.start <= 1000000 ? item.attrs.start : 1,
    } : undefined;
    return { type: item.type, ...(attrs ? { attrs } : {}), ...(content.length ? { content } : {}) };
  };
  return node(value, null);
}

export function readNoteDocument(body = "") {
  if (body.startsWith(RICH_TEXT_PREFIX)) {
    try { return normalizeNoteDocument(JSON.parse(body.slice(RICH_TEXT_PREFIX.length))); } catch { /* Preserve invalid legacy content as literal text. */ }
  }
  return {
    type: "doc", content: body.split("\n").map((text) => ({
      type: "paragraph", ...(text ? { content: [{ type: "text", text }] } : {}),
    })),
  };
}

export function writeNoteDocument(document) {
  const normalized = normalizeNoteDocument(document);
  // Preserve the legacy representation for plain paragraphs, including after
  // undoing formatting, so reverting an edit can return to a clean draft.
  if (normalized.content.every((node) => node.type === "paragraph"
    && (node.content || []).every((child) => child.type === "text" && !child.marks?.length))) {
    const plain = normalized.content.map((node) => (node.content || []).map((child) => child.text).join("")).join("\n");
    if (!plain.startsWith(RICH_TEXT_PREFIX)) return plain;
  }
  return RICH_TEXT_PREFIX + JSON.stringify(normalized);
}

export function noteBodyText(body = "") {
  if (!body.startsWith(RICH_TEXT_PREFIX)) return body;
  const text = (node) => node.type === "text" ? node.text : node.type === "hardBreak" ? "\n"
    : (node.content || []).map(text).join(node.type === "paragraph" ? "" : "\n");
  return text(readNoteDocument(body));
}
