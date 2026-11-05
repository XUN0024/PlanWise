import React from "react";
import { readNoteDocument } from "../lib/noteRichText";

// Render only supported nodes and marks, letting React escape all text.
export default function NoteBody({ body, fallback }) {
  const render = (node, key) => {
    if (node.type === "text") return <React.Fragment key={key}>{(node.marks || []).reduce((child, mark) =>
      React.createElement({ bold: "strong", italic: "em", underline: "u" }[mark.type], null, child), node.text)}</React.Fragment>;
    if (node.type === "hardBreak") return <br key={key} />;
    const tag = { doc: "div", paragraph: "p", bulletList: "ul", orderedList: "ol", listItem: "li" }[node.type];
    return React.createElement(tag, { key, ...(node.type === "orderedList" ? { start: node.attrs.start } : {}) },
      node.content?.map((child, index) => render(child, index)) || <br />);
  };
  return <div className="note-rich-text text-sm text-gray-700 leading-relaxed">{body ? render(readNoteDocument(body), "body") : fallback}</div>;
}
