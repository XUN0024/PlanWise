const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), Module = require("node:module");
const babel = require("@babel/core");
const { JSDOM } = require("jsdom");
const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', { url: "http://localhost" });
for (const name of ["window", "document", "navigator", "HTMLElement", "Node", "Image"])
  Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLElement.prototype.scrollIntoView = () => {};
dom.window.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {} });
dom.window.HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,YQ==";
const React = require("react"), { act } = React, { createRoot } = require("react-dom/client");
let download, api, rendered = [], downloads = [], printCalls = [], revoked = [], requestedOptions;
const fakePage = (number) => ({ getViewport: ({ scale }) => ({ width: 600 * scale, height: 800 * scale }), render: () => {
  rendered.push(number); return { promise: Promise.resolve(), cancel() {} };
} });
const pdf = { numPages: 3, getPage: async (n) => fakePage(n) };
const cache = new Map();
function load(file) {
  const filename = path.resolve(__dirname, "..", file);
  if (cache.has(filename)) return cache.get(filename);
  let source = fs.readFileSync(filename, "utf8");
  if (file.endsWith("pdfPreview.jsx")) source = source.replace(/GlobalWorkerOptions.workerSrc = .*?;/, "");
  const { code } = babel.transformSync(source, { filename, babelrc: false, configFile: false,
    presets: [["@babel/preset-env", { targets: { node: "current" } }], "@babel/preset-react"] });
  const loaded = new Module(filename);
  loaded.require = (name) => {
    if (name === "react-i18next") return { useTranslation: () => ({ t: (key) => key }) };
    if (name === "../services/attachmentService") return { downloadAttachment: (...args) => download(...args) };
    if (name === "pdfjs-dist/legacy/build/pdf.mjs") return { GlobalWorkerOptions: {}, getDocument: (options) => { requestedOptions = options; return { promise: Promise.resolve(pdf), destroy: async () => {} }; } };
    if (name.startsWith(".")) return load(path.relative(path.resolve(__dirname, ".."), path.resolve(path.dirname(filename), name + ".jsx")));
    return require(name);
  };
  loaded._compile(code, filename); cache.set(filename, loaded.exports); return loaded.exports;
}
const helpers = load("src/lib/previewFiles.jsx");
api = load("src/lib/pdfPreview.jsx");
const Preview = load("src/components/AttachmentPreview.jsx").default;
const native = require("../public/attachment-preview.cjs");
const record = { id: "file", note_id: "note", user_id: "user", original_name: "文件.pdf", mime_type: "application/pdf", status: "ready" };
const file = new Blob(["pdf bytes"], { type: "application/pdf" });
let urls = 0;
URL.createObjectURL = () => "blob:test-" + ++urls;
URL.revokeObjectURL = (url) => revoked.push(url);
test.beforeEach(() => {
  rendered = []; downloads = []; printCalls = []; revoked = [];
  download = async (...args) => { downloads.push(args); return file; };
  window.planwiseAttachments = { save: async (payload) => { printCalls.push(["save", payload]); }, print: async (payload) => { printCalls.push(["print", payload]); }, cancelPrint() {} };
});
async function mount(item = record) {
  const host = document.getElementById("root");
  const opener = document.createElement("button"); host.appendChild(opener); opener.focus();
  const root = createRoot(host.appendChild(document.createElement("div"))); let closed = 0;
  await act(async () => root.render(React.createElement(Preview, { record: item, userId: "user", onClose: () => closed++ })));
  const button = (label) => { const found = document.querySelector(`[aria-label="${label}"]`); assert.ok(found, label); return found; };
  return { button, get closed() { return closed; }, async close() { await act(async () => root.unmount()); assert.equal(document.activeElement, opener); opener.remove(); } };
}

test("preview type is restricted to PDF/raster formats; native print HTML rejects active content", () => {
  assert.equal(helpers.previewKind(record), "pdf");
  assert.equal(helpers.previewKind({ original_name: "a.jpg" }), "image");
  for (const name of ["x.svg", "x.html", "x.docx", "x.zip"]) assert.equal(helpers.previewKind({ original_name: name }), "unsupported");
  assert.throws(() => native.printHtml([{ width: 600, height: 800, dataUrl: 'data:image/svg+xml,<script>' }]), /Invalid print page/);
  const pages = [{ width: 600, height: 800, dataUrl: "data:image/png;base64,YQ==" }];
  assert.match(native.printHtml(pages), /@page\{size:600pt 800pt/);
  assert.match(helpers.printDocumentHtml(pages, '<script>'), /&lt;script&gt;/);
});

test("real PDF print preparation includes every page and observes cancellation", async () => {
  const abort = new AbortController();
  const progress = [];
  const pages = await api.pdfPrintPages(pdf, abort.signal, (n) => progress.push(n));
  assert.deepEqual(rendered, [1, 2, 3]); assert.equal(pages.length, 3); assert.deepEqual(progress, [1, 2, 3]);
  abort.abort(); assert.deepEqual(await api.pdfPrintPages(pdf, abort.signal, () => {}), []);
});

test("modal renders PDF pages, reuses downloaded bytes, prints all pages and restores focus/inert state", async () => {
  const ui = await mount();
  assert.equal(downloads.length, 1); assert.equal(downloads[0][1], "user");
  assert.equal(requestedOptions.isEvalSupported, false);
  assert.equal(document.querySelectorAll("[data-pdf-page]").length, 3);
  assert.equal(document.getElementById("root").inert, true);
  assert.equal(ui.button("preview.more").disabled, true);
  await act(async () => ui.button("preview.zoomIn").click());
  assert.match(document.querySelector('[role="dialog"]').textContent, /125%/);
  await act(async () => ui.button("preview.download").click());
  assert.equal(printCalls[0][0], "save"); assert.equal(printCalls[0][1].name, "文件.pdf");
  assert.equal(downloads.length, 1);
  await act(async () => ui.button("preview.print").click());
  assert.equal(printCalls[1][0], "print"); assert.equal(printCalls[1][1].pages.length, 3);
  await act(async () => document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  assert.equal(ui.closed, 1);
  const signal = downloads[0][2].signal;
  await ui.close(); assert.equal(signal.aborted, true); assert.notEqual(document.getElementById("root").inert, true);
});

test("image Blob URL is released on close; unsupported files retain only download controls", async () => {
  let ui = await mount({ ...record, original_name: "photo.png", mime_type: "image/png" });
  assert.ok(document.querySelector('img[alt="photo.png"]'));
  await ui.close(); assert.ok(revoked.length);
  ui = await mount({ ...record, original_name: "data.zip", mime_type: "application/zip" });
  assert.match(document.querySelector('[role="dialog"]').textContent, /preview.unsupported/);
  assert.equal(ui.button("preview.print").disabled, true); assert.equal(ui.button("preview.download").disabled, false);
  await ui.close();
});

test("failure shows retry; unmount aborts an in-flight download and ignores its late response", async () => {
  let attempts = 0;
  download = async (...args) => { downloads.push(args); if (++attempts === 1) throw Error("Offline"); return file; };
  let ui = await mount(); assert.match(document.querySelector('[role="alert"]').textContent, /preview.loadError/);
  await act(async () => [...document.querySelectorAll("button")].find((node) => node.textContent === "notesPanel.retry").click());
  assert.equal(attempts, 2); assert.equal(ui.button("preview.print").disabled, false); await ui.close();
  let resolve;
  download = (...args) => { downloads.push(args); return new Promise((yes) => { resolve = yes; }); };
  ui = await mount(); const signal = downloads.at(-1)[2].signal;
  await ui.close(); assert.equal(signal.aborted, true);
  await act(async () => resolve(file)); assert.equal(document.querySelector('[role="dialog"]'), null);
});

test("desktop IPC accepts only the owning main frame and cancelled saves do not write files", async () => {
  const handlers = {}, frame = {}, webContents = { mainFrame: frame };
  const owner = { webContents, once() {} }; let dialogCalls = 0;
  native.registerAttachmentPreview({ ipcMain: { handle: (name, fn) => { handlers[name] = fn; } }, BrowserWindow: {},
    dialog: { showSaveDialog: async () => { dialogCalls++; return { canceled: true }; } } }, owner);
  const save = handlers["attachment-preview:save"];
  await assert.rejects(save({ sender: {}, senderFrame: frame }, { bytes: new Uint8Array(1) }), /Invalid preview sender/);
  await assert.rejects(save({ sender: webContents, senderFrame: {} }, { bytes: new Uint8Array(1) }), /Invalid preview sender/);
  assert.deepEqual(await save({ sender: webContents, senderFrame: frame }, { bytes: new Uint8Array(1), name: "x.pdf" }), { cancelled: true });
  assert.equal(dialogCalls, 1);
});
