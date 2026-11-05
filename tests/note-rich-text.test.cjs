const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const babel = require("@babel/core");
const { JSDOM } = require("jsdom");

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost", pretendToBeVisual: true });
for (const name of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "MutationObserver", "DOMParser", "getComputedStyle"])
  Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] });
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);
globalThis.cancelAnimationFrame = clearTimeout;
globalThis.innerHeight = 800;
globalThis.innerWidth = 1200;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const rect = () => ({ top: 0, left: 0, bottom: 20, right: 20, height: 20, width: 20 });
dom.window.Range.prototype.getBoundingClientRect = rect;
dom.window.Range.prototype.getClientRects = () => [rect()];
dom.window.HTMLElement.prototype.scrollIntoView = () => {};
dom.window.scrollBy = () => {};
const React = require("react");
const { act } = React;
const { createRoot } = require("react-dom/client");
const { renderToStaticMarkup } = require("react-dom/server");
const { Editor } = require("@tiptap/core");
let mountedEditor;
const cache = new Map();
function load(file) {
  const filename = path.resolve(__dirname, "..", file);
  if (cache.has(filename)) return cache.get(filename);
  const { code } = babel.transformSync(fs.readFileSync(filename, "utf8"), {
    filename, babelrc: false, configFile: false,
    presets: [["@babel/preset-env", { targets: { node: "current" } }], "@babel/preset-react"],
  });
  // Run in the host realm: Tiptap's option merging checks Object prototypes.
  const loaded = new Module(filename);
  loaded.require = (name) => {
    if (name === "react-i18next") return { useTranslation: () => ({ t: (key) => key }) };
    if (name === "@tiptap/react") return { ...require(name), useEditor(...args) {
      mountedEditor = require(name).useEditor(...args); return mountedEditor;
    } };
    if (name.startsWith(".")) return load(path.relative(path.resolve(__dirname, ".."), path.resolve(path.dirname(filename), name + ".jsx")));
    return require(name);
  };
  loaded._compile(code, filename);
  cache.set(filename, loaded.exports);
  return loaded.exports;
}
const model = load("src/lib/noteRichText.jsx");
const { noteEditorExtensions } = load("src/lib/noteEditorExtensions.jsx");
const { applyNoteFormat } = load("src/components/NoteFormatToolbar.jsx");
const NoteBody = load("src/components/NoteBody.jsx").default;
const RichEditor = load("src/components/NoteRichTextEditor.jsx").default;
const plain = (value) => JSON.parse(JSON.stringify(value));
const editorFor = (body = "Hello world") => new Editor({
  element: document.body.appendChild(document.createElement("div")), extensions: noteEditorExtensions, content: model.readNoteDocument(body),
});

test("legacy text, blank lines and HTML-looking text remain literal, without an edit on opening", () => {
  const body = '<img src=x onerror="alert(1)">\n\n中文 & text';
  const editor = editorFor(body);
  assert.equal(model.noteBodyText(body), body);
  assert.equal(model.noteBodyText(model.writeNoteDocument(editor.getJSON())), body);
  const html = renderToStaticMarkup(React.createElement(NoteBody, { body }));
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<img|<script/);
  editor.destroy();
});

test("real editor applies and removes combined bold, underline and italic on the selected text", () => {
  const editor = editorFor();
  editor.commands.setTextSelection({ from: 1, to: 6 });
  for (const name of ["bold", "underline", "italic"]) applyNoteFormat(editor, name);
  const body = model.writeNoteDocument(editor.getJSON());
  const fresh = editorFor(body);
  const text = fresh.getJSON().content[0].content;
  assert.deepEqual(plain(text[0].marks.map((mark) => mark.type).sort()), ["bold", "italic", "underline"]);
  assert.equal(text[0].text, "Hello");
  assert.equal(text[1].marks, undefined);
  const html = renderToStaticMarkup(React.createElement(NoteBody, { body }));
  assert.match(html, /<strong>Hello<\/strong>/);
  assert.match(html, /<u>/); assert.match(html, /<em>/);
  for (const name of ["bold", "underline", "italic"]) applyNoteFormat(editor, name);
  assert.equal(editor.getJSON().content[0].content[0].marks, undefined);
  assert.equal(model.writeNoteDocument(editor.getJSON()), "Hello world");
  editor.destroy(); fresh.destroy();
});

test("lists toggle between numbered, bulleted and paragraphs and survive persistence with nested items", () => {
  const editor = editorFor("First\nSecond");
  editor.commands.selectAll();
  applyNoteFormat(editor, "orderedList");
  assert.equal(editor.getJSON().content[0].type, "orderedList");
  assert.equal(editor.getJSON().content[0].content.length, 2);
  const body = model.writeNoteDocument(editor.getJSON());
  const fresh = editorFor(body);
  assert.match(renderToStaticMarkup(React.createElement(NoteBody, { body })), /<ol start="1"><li>/);
  assert.equal(model.noteBodyText(body), "First\nSecond", JSON.stringify(editor.getJSON()));
  fresh.commands.selectAll();
  applyNoteFormat(fresh, "bulletList");
  assert.equal(fresh.getJSON().content[0].type, "bulletList");
  // Place the second item inside the first, then round-trip its structure.
  fresh.commands.setTextSelection(12);
  assert.equal(fresh.commands.sinkListItem("listItem"), true);
  const nested = model.readNoteDocument(model.writeNoteDocument(fresh.getJSON()));
  assert.equal(nested.content[0].content[0].content[1].type, "bulletList");
  applyNoteFormat(editor, "orderedList");
  assert.equal(editor.getJSON().content[0].type, "paragraph");
  editor.destroy(); fresh.destroy();
});

test("rendering strips unknown mark attributes and never injects saved HTML, links or script nodes", () => {
  const doc = { type: "doc", content: [{ type: "paragraph", content: [{
    type: "text", text: "<script>alert(1)</script>", marks: [{ type: "bold", attrs: { onclick: "bad()" } }, { type: "link", attrs: { href: "javascript:bad()" } }],
  }] }] };
  const body = model.RICH_TEXT_PREFIX + JSON.stringify(doc);
  const html = renderToStaticMarkup(React.createElement(NoteBody, { body }));
  assert.match(html, /<strong>&lt;script&gt;/);
  assert.doesNotMatch(html, /onclick|javascript:|<script|<a /);
  for (const invalid of [model.RICH_TEXT_PREFIX + "{invalid", model.RICH_TEXT_PREFIX + JSON.stringify({ type: "script" })]) {
    assert.equal(model.noteBodyText(invalid), invalid);
    assert.doesNotThrow(() => editorFor(invalid).destroy());
  }
});

test("mounted toolbar preserves selection, updates toggle states and does not reset cursor/history on save", async () => {
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  let body = "Hello world", changes = 0;
  function Harness({ disabled = false }) {
    const [value, setValue] = React.useState(body);
    return React.createElement(RichEditor, { body: value, disabled, onChange(next) {
      body = next; changes++; setValue(next);
    } });
  }
  await act(async () => root.render(React.createElement(Harness)));
  assert.equal(changes, 0, "opening legacy text must not cause autosave");
  await act(async () => mountedEditor.commands.setTextSelection({ from: 1, to: 6 }));
  const bold = host.querySelector('[aria-label="notesPanel.format.bold"]');
  await act(async () => {
    const down = new window.MouseEvent("mousedown", { bubbles: true, cancelable: true });
    bold.dispatchEvent(down);
    assert.equal(down.defaultPrevented, true);
    bold.click();
  });
  assert.equal(changes, 1);
  assert.equal(bold.getAttribute("aria-pressed"), "true");
  assert.equal(mountedEditor.state.selection.from, 1);
  assert.equal(mountedEditor.state.selection.to, 6);
  const instance = mountedEditor;
  await act(async () => root.render(React.createElement(Harness)));
  assert.equal(mountedEditor, instance);
  assert.equal(changes, 1, "save acknowledgement must not emit another edit");
  await act(async () => mountedEditor.commands.undo());
  assert.equal(mountedEditor.getJSON().content[0].content[0].marks, undefined);
  assert.equal(changes, 2);
  await act(async () => root.render(React.createElement(Harness, { disabled: true })));
  assert.equal(mountedEditor.isEditable, false);
  const before = changes;
  await act(async () => bold.click());
  assert.equal(changes, before);
  await act(async () => root.unmount());
  host.remove();
});

test("opening from a reading toolbar starts the requested list and file drops stay with attachments", async () => {
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  const changes = [];
  await act(async () => root.render(React.createElement(RichEditor, {
    body: "Paragraph", initialFormat: "bulletList", onChange: (value) => changes.push(value),
  })));
  assert.equal(mountedEditor.getJSON().content[0].type, "bulletList");
  assert.equal(changes.length, 1);
  assert.equal(mountedEditor.options.editorProps.handleDrop(null, { dataTransfer: { types: ["Files"] } }), true);
  assert.equal(mountedEditor.options.editorProps.handleDrop(null, { dataTransfer: { types: ["text/plain"] } }), false);
  await act(async () => root.unmount());
  host.remove();
});
