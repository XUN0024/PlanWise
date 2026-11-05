const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const babel = require("@babel/core");
const { JSDOM } = require("jsdom");
const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost" });
for (const name of ["window", "document", "navigator", "HTMLElement", "Node"])
  Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require("react");
const { act } = React;
const { createRoot } = require("react-dom/client");
const api = {};
const cache = new Map();
function load(file) {
  const filename = path.resolve(__dirname, "..", file);
  if (cache.has(filename)) return cache.get(filename);
  const { code } = babel.transformSync(fs.readFileSync(filename, "utf8"), {
    filename, babelrc: false, configFile: false,
    presets: [["@babel/preset-env", { targets: { node: "current" } }], "@babel/preset-react"],
  });
  const loaded = new Module(filename);
  loaded.require = (name) => {
    if (name === "react-i18next") return { useTranslation: () => ({ t: (key, values) => key + (values?.name ? ":" + values.name : "") + (values?.count !== undefined ? ":" + values.count : "") }) };
    if (name === "../lib/supabase") return { supabase: api };
    if (name.startsWith(".")) return load(path.relative(path.resolve(__dirname, ".."), path.resolve(path.dirname(filename), name + ".jsx")));
    return require(name);
  };
  loaded._compile(code, filename); cache.set(filename, loaded.exports); return loaded.exports;
}
const model = load("src/lib/tagModel.jsx");
const service = load("src/services/tagService.jsx");
const NoteTags = load("src/components/NoteTags.jsx").default;
const Manager = load("src/components/TagManagerModal.jsx").default;
const tag = { id: "t1", name: "Work", color: "#3B82F6", updatedAt: "2026-11-05T01:00:00Z", noteCount: 2 };
const snapshot = { tags: [{ id: "t1", user_id: "u1", name: "Work", color: "#3B82F6", updated_at: tag.updatedAt }], links: [{ note_id: "n1", tag_id: "t1" }] };
function button(host, label) {
  const result = [...host.querySelectorAll("button")].find((node) => node.textContent.includes(label));
  assert.ok(result, `Missing button ${label}`); return result;
}
async function type(input, value) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(input, value);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}
async function mount(Component, props) {
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(Component, props)));
  return { host, async render(next) { await act(async () => root.render(React.createElement(Component, next))); },
    async close() { await act(async () => root.unmount()); host.remove(); } };
}

test("tag model validates Unicode length, deduplicates membership and preserves zero-use tags", () => {
  assert.equal(model.validateTag("  工作  ").name, "工作");
  assert.doesNotThrow(() => model.validateTag("📚".repeat(100)));
  assert.throws(() => model.validateTag("📚".repeat(101)), /TAG_INVALID_NAME/);
  assert.throws(() => model.validateTag(" \t "), /TAG_INVALID_NAME/);
  assert.throws(() => model.validateTag("Work", "url(bad)"), /TAG_INVALID_COLOR/);
  const state = { tags: [tag, { ...tag, id: "unused", name: "Unused" }],
    links: [{ noteId: "n1", tagId: "t1" }, { noteId: "n1", tagId: "t1" }, { noteId: "n1", tagId: "missing" }] };
  assert.deepEqual(model.notesWithTags([{ id: "n1", tags: ["retired"] }], state)[0].tags, ["Work"]);
  assert.deepEqual(model.tagsWithCounts(state).map((item) => item.noteCount), [0, 1]);
});

test("service scopes sessions, uses atomic RPC mutations and never writes tag arrays or body content", async () => {
  const calls = [];
  api.auth = { getSession: async () => ({ data: { session: { user: { id: "u1" } } } }) };
  api.rpc = async (name, args) => { calls.push({ name, args }); return { data: snapshot, error: null }; };
  const result = await service.getTagState("u1"); assert.equal(result.tags[0].updatedAt, tag.updatedAt);
  await service.createTag("u1", " New ", "#EF4444", "n1");
  assert.deepEqual(calls[1].args, { p_action: "create_attach", p_note_id: "n1", p_name: "New", p_color: "#EF4444" });
  await service.setNoteTag("u1", "n1", "t1", false);
  assert.equal(calls[2].args.p_action, "detach");
  await service.updateTag("u1", tag, "Renamed", "#10B981");
  assert.equal(calls[3].args.p_expected_updated_at, tag.updatedAt);
  await service.deleteTag("u1", tag); assert.equal(calls[4].args.p_action, "delete");
  await assert.rejects(service.getTagState("u2"), /TAG_AUTH_REQUIRED/);
  assert.equal(calls.length, 5);
  api.rpc = async () => ({ data: { ...snapshot, tags: [{ ...snapshot.tags[0], user_id: "u2" }] } });
  await assert.rejects(service.getTagState("u1"), /Invalid tag response/);
  assert.equal(model.tagErrorKey({ code: "PGRST202" }), "tagsPanel.setupRequired");
  assert.equal(model.tagErrorKey({ code: "23505" }), "tagsPanel.duplicate");
});

test("picker disables unsaved notes, removes only one relationship, and retains failed create input", async () => {
  const changes = []; const creates = [];
  const props = { tags: [tag], selectedIds: ["t1"], saved: false, onToggle: (...args) => changes.push(args), onCreate: async (value) => { creates.push(value); return false; } };
  const ui = await mount(NoteTags, props);
  assert.equal(button(ui.host, "tagsPanel.addToNote").disabled, true);
  assert.match(ui.host.textContent, /tagsPanel.saveFirst/);
  await ui.render({ ...props, saved: true });
  await act(async () => ui.host.querySelector('[aria-label="tagsPanel.removeFromNote:Work"]').click());
  assert.deepEqual(changes, [["t1", false]]);
  await act(async () => button(ui.host, "tagsPanel.addToNote").click());
  const input = ui.host.querySelector("input");
  await type(input, "New tag");
  await act(async () => button(ui.host, "tagsPanel.createNamed").click());
  assert.deepEqual(creates, ["New tag"]); assert.equal(input.value, "New tag");
  await type(input, " WORK ");
  assert.equal([...ui.host.querySelectorAll("button")].some((node) => node.textContent.includes("tagsPanel.createNamed")), false);
  await ui.close();
});

test("manager keeps failed rename/color drafts, confirms deletion count, traps focus and restores it", async () => {
  const opener = document.body.appendChild(document.createElement("button")); opener.focus();
  const changes = []; const deletes = []; let closes = 0;
  const ui = await mount(Manager, { tags: [tag], onClose: () => closes++, onReload() {},
    onCreate: async () => false, onUpdate: async (...args) => { changes.push(args); return false; },
    onDelete: async (value) => { deletes.push(value); return false; } });
  await act(async () => button(ui.host, "tagsPanel.rename").click());
  const rename = ui.host.querySelector('[aria-label="tagsPanel.rename"]');
  await type(rename, "Renamed");
  const editForm = rename.closest("form");
  await act(async () => editForm.querySelector('[aria-label="notesPanel.colors.red"]').click());
  await act(async () => editForm.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
  assert.equal(changes.length, 1); assert.equal(changes[0][0].updatedAt, tag.updatedAt);
  assert.deepEqual(changes[0].slice(1), ["Renamed", "#EF4444"]);
  assert.equal(rename.value, "Renamed");
  await act(async () => button(ui.host, "notesPanel.cancel").click());
  await act(async () => button(ui.host, "notesPanel.delete").click());
  assert.ok(ui.host.querySelector('[role="alertdialog"]'));
  assert.match(ui.host.textContent, /tagsPanel.deleteBody:2/);
  assert.equal(deletes.length, 0);
  await act(async () => button(ui.host, "notesPanel.confirmDelete").click());
  assert.equal(deletes.length, 1);
  assert.ok(ui.host.querySelector('[role="alertdialog"]'), "failure keeps confirmation open");
  const buttons = [...ui.host.querySelectorAll("button:not(:disabled)")];
  buttons[buttons.length - 1].focus();
  await act(async () => document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })));
  assert.equal(document.activeElement, buttons[0]);
  await act(async () => document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  assert.equal(ui.host.querySelector('[role="alertdialog"]'), null);
  await act(async () => document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  assert.equal(closes, 1);
  await ui.close(); assert.equal(document.activeElement, opener); opener.remove();
});

test("missing database setup disables writes but leaves the reload action usable", async () => {
  let reloads = 0;
  const ui = await mount(Manager, { tags: [], unavailable: true, error: "tagsPanel.setupRequired", onClose() {}, onReload: () => reloads++ });
  assert.equal(button(ui.host, "tagsPanel.create").disabled, true);
  assert.equal(button(ui.host, "notesPanel.retry").disabled, false);
  await act(async () => button(ui.host, "notesPanel.retry").click());
  assert.equal(reloads, 1); await ui.close();
});
