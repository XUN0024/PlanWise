import StarterKit from "@tiptap/starter-kit";

// Keep the schema aligned with noteRichText and the read-only React renderer.
export const noteEditorExtensions = [StarterKit.configure({
  blockquote: false, code: false, codeBlock: false, heading: false,
  horizontalRule: false, strike: false, link: false, trailingNode: false,
})];
