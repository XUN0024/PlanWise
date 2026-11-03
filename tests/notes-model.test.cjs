const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const babel = require("@babel/core");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function load(file, imports, globals = {}) {
  const filename = path.join(__dirname, "..", file);
  const { code } = babel.transformSync(fs.readFileSync(filename, "utf8"), {
    filename, babelrc: false, configFile: false,
    presets: [["@babel/preset-env", { targets: { node: "current" } }], "@babel/preset-react"],
  });
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports,
    crypto: require("node:crypto").webcrypto,
    ...globals,
    require(name) {
      if (name === "../lib/noteColors") return load("src/lib/noteColors.jsx", {});
      if (!(name in imports)) throw Error("Unexpected import: " + name);
      return imports[name];
    },
  });
  return module.exports;
}
const translation = { useTranslation: () => ({ t: (key) => key, i18n: { language: "en" } }) };
const row = {
  id: "note-a", title: "Real note", content: "Stored content", tags: ["work", "work"],
  starred: true, pinned: true, color: "#3B82F6",
  checklist: [{ id: "point-a", text: "Review", done: true }],
  created_at: "2026-11-03T01:00:00Z", updated_at: "2026-11-03T02:00:00Z",
};
const plain = (value) => JSON.parse(JSON.stringify(value));

test("note model maps database fields and round-trips flags and checklist without ownership", () => {
  const service = load("src/services/noteService.jsx", { "../lib/supabase": {} });
  const note = service.noteFromRow(row);
  assert.equal(note.body, row.content);
  assert.equal(note.points[0].done, true);
  assert.equal(note.updatedAt, row.updated_at);
  assert.deepEqual(plain(note.tags), ["work"]);
  const payload = service.noteToRow({ ...note, user_id: "untrusted" });
  assert.equal(payload.content, row.content);
  assert.deepEqual(plain(payload.checklist), row.checklist);
  for (const key of ["id", "user_id", "body", "points", "updatedAt", "created_at"]) {
    assert.equal(Object.hasOwn(payload, key), false);
  }
});

test("nullable legacy fields become safe empty values", () => {
  const service = load("src/services/noteService.jsx", { "../lib/supabase": {} });
  const note = service.noteFromRow({ id: "legacy", content: null, tags: null, checklist: null, created_at: row.created_at });
  assert.equal(note.title, "");
  assert.equal(note.body, "");
  assert.equal(note.starred, false);
  assert.equal(note.pinned, false);
  assert.equal(note.color, "#F59E0B");
  assert.equal(note.updatedAt, row.created_at);
  assert.deepEqual(plain(note.points), []);
  const malformed = service.noteFromRow({
    id: "legacy", tags: [null, "work", "work"],
    checklist: [null, {}, { id: "a", text: "Valid", done: true }, { id: "a", text: "Duplicate" }],
  });
  assert.deepEqual(plain(malformed.tags), ["work"]);
  assert.deepEqual(plain(malformed.points), [{ id: "a", text: "Valid", done: true }]);
});

test("query filters by the signed-in user and propagates errors instead of returning a false empty list", async () => {
  let error = null;
  const calls = [];
  const query = {
    select(value) { calls.push(["select", value]); return this; },
    eq(...args) { calls.push(["eq", ...args]); return this; },
    order(...args) { calls.push(["order", ...args]); return this; },
    then(resolve, reject) { return Promise.resolve({ data: [row], error }).then(resolve, reject); },
  };
  const service = load("src/services/noteService.jsx", {
    "../lib/supabase": { supabase: { from: (table) => { assert.equal(table, "notes"); return query; } } },
  });
  const notes = await service.getNotes("user-a");
  assert.deepEqual(calls.find(([kind]) => kind === "eq"), ["eq", "user_id", "user-a"]);
  assert.equal(notes[0].body, "Stored content");
  await assert.rejects(service.getNotes(null), /Sign in/);
  error = Error("Missing column");
  await assert.rejects(service.getNotes("user-a"), /Missing column/);
});

test("sidebar never renders fake notes, pinned entries or tags for an empty account", () => {
  const Sidebar = load("src/components/NotesSidebar.jsx", {
    react: React, "react-i18next": translation,
    "@fortawesome/react-fontawesome": { FontAwesomeIcon: () => null },
    "@fortawesome/free-solid-svg-icons": {},
  }).default;
  const html = renderToStaticMarkup(React.createElement(Sidebar, { notes: [] }));
  assert.match(html, /notesPanel.noNotes/);
  assert.match(html, /notesPanel.noPinned/);
  assert.match(html, /notesPanel.noTags/);
  assert.doesNotMatch(html, /Note in Inbox|Starred Note|#react|>12</);
  assert.match(html, /disabled/);
  const populated = renderToStaticMarkup(React.createElement(Sidebar, {
    notes: [{ id: "a", title: "Actual title", tags: ["real-tag"], color: "#F59E0B", pinned: true }],
  }));
  assert.match(populated, /Actual title/);
  assert.match(populated, /#real-tag/);
});

// A minimal hook runner exercises the actual page load, selection and retry logic.
function page(getNotes, overrides = {}) {
  let user = { id: "user-a", email: "a@example.com" };
  let clock = 0, timerId = 0;
  const timers = new Map();
  const slots = [];
  let cursor, dirty, tree, effects = [];
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = initial;
      return [slots[i], (value) => { slots[i] = typeof value === "function" ? value(slots[i]) : value; dirty = true; }];
    },
    useRef(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = { current: initial };
      return slots[i];
    },
    useMemo: (fn) => fn(),
    useEffect(fn, deps) {
      const i = cursor++, previous = slots[i];
      if (!previous || deps.some((value, j) => value !== previous.deps[j])) {
        effects.push(() => { previous?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; });
      }
    },
  };
  const exports = load("src/components/Notes.jsx", {
    react, "react-i18next": translation,
    "../contexts/AuthContext": { useAuth: () => ({ user, signOut() {} }) },
    "react-router-dom": { Link: "a", useNavigate: () => () => {} },
    "./LanguageSwitcher": { __esModule: true, default: "language" },
    "./NotesSidebar": { __esModule: true, default: "sidebar" },
    "./NoteEditor": { __esModule: true, default: "editor" },
    "./NoteContextMenu": { __esModule: true, default: "context-menu" },
    "./NoteAttachments": { __esModule: true, default: "attachments" },
    "../services/attachmentService": { deleteNoteAttachments: overrides.deleteNoteAttachments || (async () => {}) },
    "../services/noteService": {
      getNotes,
      createNote: async (draft) => ({ ...draft, tags: [], points: [], updatedAt: "2026-11-03T03:00:00Z" }),
      updateNote: async (draft) => ({ ...draft, updatedAt: "2026-11-03T03:00:00Z" }),
      deleteNote: async () => {},
      updateNoteAppearance: async (note, changes) => ({ ...note, ...changes, updatedAt: "2026-11-03T04:00:00Z" }),
      ...overrides,
    },
  }, {
    Date: class extends Date { static now() { return clock; } },
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, at: clock + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  const nodes = (node) => {
    if (Array.isArray(node)) return node.flatMap(nodes);
    if (!node || typeof node !== "object") return [];
    return [node, ...nodes(node.props?.children)];
  };
  const render = () => {
    let count = 0;
    do {
      dirty = false; cursor = 0; tree = exports.default();
      const pending = effects; effects = []; pending.forEach((effect) => effect());
      if (++count > 20) throw Error("Render loop");
    } while (dirty);
  };
  return {
    render,
    advance(ms) {
      clock += ms;
      let count = 0;
      while (true) {
        const next = [...timers].filter(([, timer]) => timer.at <= clock).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        timers.delete(next[0]); next[1].fn(); render();
        if (++count > 20) throw Error("Timer loop");
      }
    },
    unmount() { slots.forEach((slot) => slot?.cleanup?.()); },
    async flush() { await new Promise(setImmediate); render(); },
    sidebar: () => nodes(tree).find((node) => node.type === "sidebar").props,
    editor: () => nodes(tree).find((node) => node.type === "editor")?.props,
    menu: () => nodes(tree).find((node) => node.type === "context-menu")?.props,
    attachments: () => nodes(tree).find((node) => node.type === "attachments")?.props,
    text: () => nodes(tree).flatMap((node) => node.props?.children ?? [])
      .filter((child) => typeof child === "string").join(" "),
    button: (key) => nodes(tree).find((node) => node.type === "button" && node.props.children.includes(key)),
    setUser(next) { user = next; render(); },
    filterNotes: exports.filterNotes,
  };
}

test("empty page loads without initialization errors or invented detail content", async () => {
  const app = page(async () => []);
  assert.doesNotThrow(app.render);
  await app.flush();
  assert.match(app.text(), /notesPanel.noNotes/);
  assert.doesNotMatch(app.text(), /<textarea|Spec.pdf|user panel UI/);
  assert.equal(app.sidebar().notes.length, 0);
});

test("real notes require selection, and no-match search never falls back to another note", async () => {
  const app = page(async () => [{ id: "a", title: "Real title", body: "Stored body", tags: [], points: [], pinned: false, color: "#F59E0B" }]);
  app.render(); await app.flush();
  assert.match(app.text(), /notesPanel.selectNote/);
  app.sidebar().onSelect("a"); app.render();
  assert.match(app.text(), /Stored body/);
  app.sidebar().onSearchChange("missing"); app.render();
  assert.match(app.text(), /notesPanel.noMatches/);
  assert.doesNotMatch(app.text(), /Stored body/);
  assert.equal(app.sidebar().visibleNotes.length, 0);
});

test("load errors have a retry action and are not presented as empty accounts", async () => {
  let attempts = 0;
  const app = page(async () => { if (++attempts === 1) throw Error("Offline"); return []; });
  app.render(); await app.flush();
  assert.match(app.text(), /notesPanel.loadError/);
  assert.doesNotMatch(app.text(), /notesPanel.noNotes/);
  app.button("notesPanel.retry").props.onClick(); app.render(); await app.flush();
  assert.match(app.text(), /notesPanel.noNotes/);
});

test("a previous account's pending response cannot populate the next account", async () => {
  let resolveOld, calls = 0;
  const app = page(() => ++calls === 1 ? new Promise((resolve) => { resolveOld = resolve; }) : Promise.resolve([]));
  app.render(); app.setUser({ id: "user-b" }); await app.flush();
  resolveOld([{ id: "private-note", title: "Private", body: "Old account", tags: [], points: [] }]);
  await app.flush();
  assert.equal(app.sidebar().notes.length, 0);
  assert.doesNotMatch(app.text(), /Old account/);
});

const sampleNote = () => ({
  id: "note-a", title: "Original title", body: "Original body", tags: ["work"],
  points: [], pinned: false, starred: false, color: "#F59E0B",
  updatedAt: "2026-11-03T02:00:00Z",
});
const submit = { preventDefault() {} };
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

test("new note saves and appears in the real list and selected detail", async () => {
  const app = page(async () => []);
  app.render(); await app.flush();
  app.sidebar().onNew(); app.render();
  assert.equal(app.editor().isNew, true);
  app.editor().onChange({ title: "Created", body: "New content" }); app.render();
  app.editor().onSave(submit); await app.flush();
  assert.equal(app.editor(), undefined);
  assert.equal(app.sidebar().notes.length, 1);
  assert.match(app.text(), /New content/);
  assert.match(app.text(), /notesPanel.saved/);
});

test("edit sends the original timestamp and keeps the previous saved list until success", async () => {
  const request = deferred(); let captured;
  const app = page(async () => [sampleNote()], {
    updateNote: (...args) => { captured = args; return request.promise; },
  });
  app.render(); await app.flush();
  app.sidebar().onSelect("note-a"); app.render();
  app.button("notesPanel.edit").props.onClick(); app.render();
  app.editor().onChange({ title: "Updated", body: "Changed body" }); app.render();
  app.editor().onSave(submit); app.render();
  assert.equal(app.sidebar().notes[0].title, "Original title");
  assert.equal(captured[1], "user-a");
  assert.equal(captured[2], sampleNote().updatedAt);
  assert.equal(app.editor().busy, true);
  request.resolve({ ...sampleNote(), title: "Updated", body: "Changed body" }); await app.flush();
  assert.equal(app.sidebar().notes[0].title, "Updated");
  assert.match(app.text(), /Changed body/);
});

test("double save is blocked; failure keeps title, body and UUID for retry", async () => {
  const request = deferred(); let count = 0;
  const app = page(async () => [], { createNote: () => { count++; return request.promise; } });
  app.render(); await app.flush(); app.sidebar().onNew(); app.render();
  app.editor().onChange({ title: "Keep this", body: "Draft text" }); app.render();
  const id = app.editor().draft.id;
  const handler = app.editor().onSave;
  handler(submit); handler(submit); app.render();
  assert.equal(count, 1);
  request.reject(Error("Offline")); await app.flush();
  assert.equal(app.editor().draft.id, id);
  assert.equal(app.editor().draft.body, "Draft text");
  assert.equal(app.editor().error, "notesPanel.saveError");
  assert.equal(app.editor().busy, false);
  assert.equal(app.sidebar().notes.length, 0);
});

test("switching notes requires explicit discard and Keep editing preserves the draft", async () => {
  const app = page(async () => [sampleNote(), { ...sampleNote(), id: "note-b", title: "Other" }]);
  app.render(); await app.flush(); app.sidebar().onSelect("note-a"); app.render();
  app.button("notesPanel.edit").props.onClick(); app.render();
  app.editor().onChange({ body: "Unsaved draft" }); app.render();
  app.sidebar().onSelect("note-b"); app.render();
  assert.match(app.text(), /notesPanel.discardTitle/);
  app.button("notesPanel.keepEditing").props.onClick(); app.render();
  assert.equal(app.editor().draft.body, "Unsaved draft");
  app.sidebar().onSelect("note-b"); app.render();
  app.button("notesPanel.discard").props.onClick(); app.render();
  assert.equal(app.editor(), undefined);
  assert.equal(app.sidebar().selectedId, "note-b");
});

test("cancel editing protects changes and discard restores the saved detail", async () => {
  const app = page(async () => [sampleNote()]);
  app.render(); await app.flush(); app.sidebar().onSelect("note-a"); app.render();
  app.button("notesPanel.edit").props.onClick(); app.render();
  app.editor().onChange({ body: "Do not save" }); app.render();
  app.editor().onCancel(); app.render();
  app.button("notesPanel.discard").props.onClick(); app.render();
  assert.equal(app.editor(), undefined);
  assert.match(app.text(), /Original body/);
});

test("delete needs confirmation; failure keeps the selected note, retry removes it", async () => {
  let attempts = 0;
  const app = page(async () => [sampleNote()], { deleteNote: async () => {
    if (++attempts === 1) throw Error("Offline");
  } });
  app.render(); await app.flush(); app.sidebar().onSelect("note-a"); app.render();
  app.button("notesPanel.delete").props.onClick(); app.render();
  assert.equal(attempts, 0);
  app.button("notesPanel.confirmDelete").props.onClick(); await app.flush();
  assert.equal(app.sidebar().notes.length, 1);
  assert.match(app.text(), /notesPanel.deleteError/);
  app.button("notesPanel.confirmDelete").props.onClick(); await app.flush();
  assert.equal(app.sidebar().notes.length, 0);
  assert.match(app.text(), /notesPanel.deleted/);
});

test("conflicts keep the draft; reload requires discarding it", async () => {
  const app = page(async () => [sampleNote()], {
    updateNote: async () => { throw { code: "NOTE_CONFLICT" }; },
  });
  app.render(); await app.flush(); app.sidebar().onSelect("note-a"); app.render();
  app.button("notesPanel.edit").props.onClick(); app.render();
  app.editor().onChange({ body: "My local change" }); app.render();
  app.editor().onSave(submit); await app.flush();
  assert.equal(app.editor().error, "notesPanel.conflict");
  assert.equal(app.editor().draft.body, "My local change");
  app.button("notesPanel.reload").props.onClick(); app.render();
  assert.match(app.text(), /notesPanel.discardTitle/);
});

test("late save responses cannot populate another account or show its draft", async () => {
  const request = deferred();
  const app = page(async () => [], { createNote: () => request.promise });
  app.render(); await app.flush(); app.sidebar().onNew(); app.render();
  app.editor().onChange({ title: "Private draft", body: "Secret" }); app.render();
  app.editor().onSave(submit); app.render();
  app.setUser({ id: "user-b" }); await app.flush();
  request.resolve({ ...sampleNote(), title: "Private draft" }); await app.flush();
  assert.equal(app.editor(), undefined);
  assert.equal(app.sidebar().notes.length, 0);
  assert.doesNotMatch(app.text(), /Private draft|Secret/);
});

test("signed-out state has no stale draft or delete dialog", async () => {
  const app = page(async () => [sampleNote()]);
  app.render(); await app.flush(); app.sidebar().onSelect("note-a"); app.render();
  app.button("notesPanel.delete").props.onClick(); app.render();
  assert.doesNotThrow(() => app.setUser(null));
  await app.flush();
  assert.doesNotMatch(app.text(), /notesPanel.deleteTitle/);
});

test("service writes only title/content and scopes update/delete by owner and saved version", async () => {
  const calls = [];
  let response = { data: row, error: null };
  const query = {
    insert(value) { calls.push(["insert", value]); return this; },
    update(value) { calls.push(["update", value]); return this; },
    delete() { calls.push(["delete"]); return this; },
    select(...args) { calls.push(["select", ...args]); return this; },
    eq(...args) { calls.push(["eq", ...args]); return this; },
    single: async () => response,
    maybeSingle: async () => response,
  };
  const service = load("src/services/noteService.jsx", { "../lib/supabase": { supabase: { from: () => query } } });
  await service.updateNote({ ...sampleNote(), title: "  Updated  ", starred: true }, "user-a", row.updated_at);
  assert.deepEqual(plain(calls[0]), ["update", { title: "Updated", content: "Original body" }]);
  assert.ok(calls.some((call) => call[1] === "user_id" && call[2] === "user-a"));
  assert.ok(calls.some((call) => call[1] === "updated_at" && call[2] === row.updated_at));
  calls.length = 0;
  await service.deleteNote(sampleNote(), "user-a");
  assert.ok(calls.some((call) => call[1] === "updated_at" && call[2] === sampleNote().updatedAt));
  response = { data: null, error: null };
  await assert.rejects(service.updateNote(sampleNote(), "user-a", row.updated_at), (err) => err.code === "NOTE_CONFLICT");
  await assert.rejects(service.deleteNote(sampleNote(), "user-a"), (err) => err.code === "NOTE_CONFLICT");
  await assert.rejects(service.createNote({ ...sampleNote(), title: " " }, "user-a"), (err) => err.code === "NOTE_TITLE_REQUIRED");
  await assert.rejects(service.createNote(sampleNote(), null), (err) => err.code === "NOTE_AUTH_REQUIRED");
});

test("create retry recognizes an already committed identical UUID without overwriting a changed note", async () => {
  let existing = { ...row, title: "Original title", content: "Original body" };
  const query = {
    insert() { return this; }, select() { return this; }, eq() { return this; },
    single: async () => ({ error: { code: "23505" } }),
    maybeSingle: async () => ({ data: existing, error: null }),
  };
  const service = load("src/services/noteService.jsx", { "../lib/supabase": { supabase: { from: () => query } } });
  const saved = await service.createNote(sampleNote(), "user-a");
  assert.equal(saved.id, row.id);
  existing = { ...existing, content: "Changed by another window" };
  await assert.rejects(service.createNote(sampleNote(), "user-a"), (err) => err.code === "NOTE_CONFLICT");
});

const contextEvent = (type = "contextmenu") => ({
  type, clientX: 280, clientY: 190, preventDefault() {}, stopPropagation() {},
  currentTarget: { getBoundingClientRect: () => ({ left: 30, bottom: 60 }) },
});

test("right-click targets the specified note without changing the selected note; pin persists after success", async () => {
  const app = page(async () => [sampleNote(), { ...sampleNote(), id: "note-b", title: "Other" }]);
  app.render(); await app.flush(); app.sidebar().onSelect("note-a"); app.render();
  app.sidebar().onNoteContextMenu(contextEvent(), "note-b"); app.render();
  assert.equal(app.menu().note.id, "note-b");
  assert.equal(app.menu().x, 280);
  assert.equal(app.sidebar().selectedId, "note-a");
  app.menu().onAction({ type: "appearance", changes: { pinned: true } }); await app.flush();
  assert.equal(app.sidebar().notes.find((n) => n.id === "note-b").pinned, true);
  assert.equal(app.sidebar().notes.find((n) => n.id === "note-a").pinned, false);
  assert.equal(app.sidebar().visibleNotes[0].id, "note-b");
  assert.equal(app.menu(), undefined);
});

test("appearance changes wait for the database; failure leaves the last saved state", async () => {
  const request = deferred();
  const app = page(async () => [sampleNote()], { updateNoteAppearance: () => request.promise });
  app.render(); await app.flush();
  app.sidebar().onNoteContextMenu(contextEvent(), "note-a"); app.render();
  app.menu().onAction({ type: "appearance", changes: { starred: true } }); app.render();
  assert.equal(app.sidebar().notes[0].starred, false);
  assert.equal(app.sidebar().busy, true);
  request.reject(Error("Offline")); await app.flush();
  assert.equal(app.sidebar().notes[0].starred, false);
  assert.match(app.text(), /notesPanel.appearanceError/);
});

test("star, unstar, pin, unpin and preset color update actual note state", async () => {
  const app = page(async () => [sampleNote()]);
  app.render(); await app.flush();
  for (const changes of [{ starred: true }, { starred: false }, { pinned: true }, { pinned: false }, { color: "#8B5CF6" }]) {
    app.sidebar().onNoteContextMenu(contextEvent("click"), "note-a"); app.render();
    assert.equal(app.menu().x, 30);
    app.menu().onAction({ type: "appearance", changes }); await app.flush();
    const key = Object.keys(changes)[0];
    assert.equal(app.sidebar().notes[0][key], changes[key]);
  }
});

test("metadata changes on the edited note preserve the draft and refresh its saved version", async () => {
  let version;
  const app = page(async () => [sampleNote()], {
    updateNote: async (draft, userId, expected) => { version = expected; return draft; },
  });
  app.render(); await app.flush(); app.sidebar().onSelect("note-a"); app.render();
  app.button("notesPanel.edit").props.onClick(); app.render();
  app.editor().onChange({ body: "Unsaved content" }); app.render();
  app.sidebar().onNoteContextMenu(contextEvent(), "note-a"); app.render();
  app.menu().onAction({ type: "appearance", changes: { color: "#EF4444" } }); await app.flush();
  assert.equal(app.editor().draft.body, "Unsaved content");
  assert.equal(app.editor().draft.color, "#EF4444");
  assert.equal(app.editor().dirty, true);
  app.editor().onSave(submit); await app.flush();
  assert.equal(version, "2026-11-03T04:00:00Z");
});

test("context Edit and Delete use the clicked target and respect unsaved-change confirmation", async () => {
  const app = page(async () => [sampleNote(), { ...sampleNote(), id: "note-b", title: "Other" }]);
  app.render(); await app.flush(); app.sidebar().onSelect("note-a"); app.render();
  app.button("notesPanel.edit").props.onClick(); app.render();
  app.editor().onChange({ body: "Keep my work" }); app.render();
  app.sidebar().onNoteContextMenu(contextEvent(), "note-b"); app.render();
  app.menu().onAction({ type: "edit" }); app.render();
  assert.match(app.text(), /notesPanel.discardTitle/);
  app.button("notesPanel.keepEditing").props.onClick(); app.render();
  assert.equal(app.editor().draft.body, "Keep my work");
  app.sidebar().onNoteContextMenu(contextEvent(), "note-b"); app.render();
  app.menu().onAction({ type: "delete" }); app.render();
  app.button("notesPanel.discard").props.onClick(); app.render();
  assert.equal(app.editor(), undefined);
  assert.match(app.text(), /notesPanel.deleteTitle/);
  assert.match(app.text(), /Other/);
  app.button("notesPanel.confirmDelete").props.onClick(); await app.flush();
  assert.deepEqual(app.sidebar().notes.map((n) => n.id), ["note-a"]);
});

test("old-account metadata response and context menu cannot leak into the next account", async () => {
  const request = deferred(); let count = 0;
  const app = page(async () => ++count === 1 ? [sampleNote()] : [], { updateNoteAppearance: () => request.promise });
  app.render(); await app.flush();
  app.sidebar().onNoteContextMenu(contextEvent(), "note-a"); app.render();
  app.menu().onAction({ type: "appearance", changes: { starred: true } }); app.render();
  app.setUser({ id: "user-b" }); await app.flush();
  request.resolve({ ...sampleNote(), starred: true }); await app.flush();
  assert.equal(app.sidebar().notes.length, 0);
  assert.equal(app.menu(), undefined);
  assert.doesNotMatch(app.text(), /notesPanel.appearanceSaved/);
});

test("context menu labels reflect current state and expose exactly six colors", () => {
  const menu = load("src/components/NoteContextMenu.jsx", {
    react: React, "react-i18next": translation,
  });
  const html = renderToStaticMarkup(React.createElement(menu.default, {
    note: { ...sampleNote(), starred: true, pinned: false }, x: 20, y: 30, onAction() {}, onClose() {},
  }));
  assert.match(html, /notesPanel.unstar/);
  assert.match(html, /notesPanel.pin</);
  assert.equal((html.match(/role="menuitemradio"/g) || []).length, 6);
  assert.equal((html.match(/aria-checked="true"/g) || []).length, 2);
  const position = menu.clampMenuPosition(990, 790, 244, 300, 1000, 800);
  assert.deepEqual(plain(position), { left: 748, top: 492 });
  assert.deepEqual(plain(menu.clampMenuPosition(-20, -30, 244, 300, 180, 200)), { left: 8, top: 8 });
});

test("appearance service whitelists fields and colors and keeps owner/version predicates", async () => {
  let response = { data: row, error: null };
  const calls = [];
  const query = {
    update(value) { calls.push(["update", value]); return this; },
    eq(...args) { calls.push(["eq", ...args]); return this; },
    select() { return this; }, maybeSingle: async () => response,
  };
  const service = load("src/services/noteService.jsx", { "../lib/supabase": { supabase: { from: () => query } } });
  await service.updateNoteAppearance(sampleNote(), { pinned: true }, "user-a");
  assert.deepEqual(plain(calls[0]), ["update", { pinned: true }]);
  assert.ok(calls.some((call) => call[1] === "user_id" && call[2] === "user-a"));
  assert.ok(calls.some((call) => call[1] === "updated_at" && call[2] === sampleNote().updatedAt));
  for (const invalid of [{ title: "overwrite" }, { color: "url(x)" }, { starred: "true" }, {}]) {
    await assert.rejects(service.updateNoteAppearance(sampleNote(), invalid, "user-a"),
      (error) => error.code === "NOTE_INVALID_APPEARANCE");
  }
  response = { data: null, error: null };
  await assert.rejects(service.updateNoteAppearance(sampleNote(), { color: "#EF4444" }, "user-a"),
    (error) => error.code === "NOTE_CONFLICT");
});

test("menu focuses actions, supports arrow/Escape, dismisses outside, and allows internal scrolling", () => {
  const listeners = {};
  let cleanup, position, closed = 0, restored = false;
  const previous = { focus() { restored = true; document.activeElement = previous; } };
  const document = {
    activeElement: previous, body: {},
    addEventListener: (name, fn) => { listeners[name] = fn; },
    removeEventListener: (name) => { delete listeners[name]; },
  };
  const items = [0, 1, 2].map(() => ({ focus() { document.activeElement = this; } }));
  const root = {
    getBoundingClientRect: () => ({ width: 244, height: 300 }),
    querySelector: () => items[0], querySelectorAll: () => items,
    contains: (target) => target === root || items.includes(target),
  };
  const window = {
    innerWidth: 1000, innerHeight: 800,
    addEventListener: (name, fn) => { listeners[name] = fn; },
    removeEventListener: (name) => { delete listeners[name]; },
  };
  const component = load("src/components/NoteContextMenu.jsx", {
    react: {
      ...React,
      useRef: () => ({ current: root }),
      useState: (initial) => [initial, (value) => { position = value; }],
      useLayoutEffect: (fn) => { cleanup = fn(); },
    },
    "react-i18next": translation,
  }, { document, window }).default;
  const tree = component({ note: sampleNote(), x: 999, y: 799, onAction() {}, onClose() { closed++; } });
  assert.equal(document.activeElement, items[0]);
  assert.deepEqual(plain(position), { left: 748, top: 492 });
  tree.props.onKeyDown({ key: "ArrowDown", preventDefault() {} });
  assert.equal(document.activeElement, items[1]);
  tree.props.onKeyDown({ key: "End", preventDefault() {} });
  assert.equal(document.activeElement, items[2]);
  listeners.scroll({ target: root });
  assert.equal(closed, 0);
  listeners.pointerdown({ target: {} });
  assert.equal(closed, 1);
  tree.props.onKeyDown({ key: "Escape", preventDefault() {} });
  assert.equal(closed, 2);
  cleanup();
  assert.equal(restored, true);
  assert.deepEqual(Object.keys(listeners), []);
});

test("autosave waits 800ms after the last edit and keeps the editor open", async () => {
  let calls = 0;
  const app = page(async () => [sampleNote()], {
    updateNote: async (draft) => { calls++; return { ...draft, updatedAt: "2026-11-03T05:00:00Z" }; },
  });
  app.render(); await app.flush(); app.sidebar().onSelect("note-a"); app.render();
  app.button("notesPanel.edit").props.onClick(); app.render();
  app.editor().onChange({ body: "First" }); app.render();
  app.advance(500);
  app.editor().onChange({ body: "Last" }); app.render();
  app.advance(799); assert.equal(calls, 0);
  app.advance(1); assert.equal(calls, 1);
  assert.equal(app.editor().saving, true);
  await app.flush();
  assert.equal(app.editor().draft.body, "Last");
  assert.equal(app.editor().dirty, false);
  assert.equal(app.editor().saved, true);
  app.advance(10000); await app.flush();
  assert.equal(calls, 1);
});

test("typing during autosave is retained and the next request uses the returned version", async () => {
  const first = deferred(); const requests = [];
  const app = page(async () => [sampleNote()], {
    updateNote: (draft, userId, version) => {
      requests.push({ draft: { ...draft }, version });
      return requests.length === 1 ? first.promise : Promise.resolve({ ...draft, updatedAt: "version-3" });
    },
  });
  app.render(); await app.flush(); app.sidebar().onSelect("note-a"); app.render();
  app.button("notesPanel.edit").props.onClick(); app.render();
  app.editor().onChange({ body: "Sent text" }); app.render(); app.advance(800);
  app.editor().onChange({ body: "Newer text" }); app.render(); app.advance(800);
  assert.equal(requests.length, 1);
  first.resolve({ ...sampleNote(), body: "Sent text", updatedAt: "version-2" }); await app.flush();
  assert.equal(app.editor().draft.body, "Newer text");
  assert.equal(app.editor().dirty, true);
  app.advance(0); await app.flush();
  assert.equal(requests.length, 2);
  assert.equal(requests[1].draft.body, "Newer text");
  assert.equal(requests[1].version, "version-2");
  assert.equal(app.editor().dirty, false);
});

test("autosave failure keeps the newest draft, stops retries, and permits manual retry", async () => {
  const first = deferred(); let count = 0;
  const app = page(async () => [sampleNote()], {
    updateNote: async (draft) => ++count === 1 ? first.promise : { ...draft, updatedAt: "version-2" },
  });
  app.render(); await app.flush(); app.sidebar().onSelect("note-a"); app.render();
  app.button("notesPanel.edit").props.onClick(); app.render();
  app.editor().onChange({ body: "Submitted" }); app.render(); app.advance(800);
  app.editor().onChange({ body: "Keep newer content" }); app.render();
  first.reject(Error("Offline")); await app.flush();
  assert.equal(app.editor().draft.body, "Keep newer content");
  assert.equal(app.editor().error, "notesPanel.saveError");
  app.advance(10000); await app.flush();
  assert.equal(count, 1);
  app.editor().onSave(submit); await app.flush();
  assert.equal(count, 2);
  assert.equal(app.editor(), undefined);
  assert.equal(app.sidebar().notes[0].body, "Keep newer content");
});

test("autosave creates once and later edits update the same note", async () => {
  let creates = 0, updates = 0, createdId;
  const app = page(async () => [], {
    createNote: async (draft) => {
      creates++; createdId = draft.id;
      return { ...draft, tags: [], points: [], updatedAt: "version-1" };
    },
    updateNote: async (draft) => { updates++; return { ...draft, updatedAt: "version-2" }; },
  });
  app.render(); await app.flush(); app.sidebar().onNew(); app.render();
  app.editor().onChange({ body: "No title yet" }); app.render(); app.advance(800);
  assert.equal(creates, 0);
  app.editor().onChange({ title: "A title" }); app.render(); app.advance(800); await app.flush();
  assert.equal(creates, 1);
  assert.equal(app.editor().isNew, false);
  app.editor().onChange({ body: "Updated body" }); app.render(); app.advance(800); await app.flush();
  assert.equal(creates, 1); assert.equal(updates, 1);
  assert.equal(app.editor().draft.id, createdId);
});

test("clean or reverted content does not autosave; manual save clears its pending timer", async () => {
  let count = 0;
  const app = page(async () => [sampleNote()], {
    updateNote: async (draft) => { count++; return { ...draft, updatedAt: "version-2" }; },
  });
  app.render(); await app.flush(); app.sidebar().onSelect("note-a"); app.render();
  app.button("notesPanel.edit").props.onClick(); app.render();
  app.advance(1000); assert.equal(count, 0);
  app.editor().onChange({ body: "Temporary" }); app.render(); app.advance(400);
  app.editor().onChange({ body: "Original body" }); app.render(); app.advance(1000);
  assert.equal(count, 0);
  app.editor().onChange({ body: "Save now" }); app.render(); app.editor().onSave(submit); await app.flush();
  app.advance(1000); await app.flush();
  assert.equal(count, 1);
});

test("discard, account switch and unmount cancel pending autosaves", async () => {
  for (const action of ["discard", "account", "unmount"]) {
    let count = 0;
    const app = page(async () => [sampleNote()], {
      updateNote: async (draft) => { count++; return draft; },
    });
    app.render(); await app.flush(); app.sidebar().onSelect("note-a"); app.render();
    app.button("notesPanel.edit").props.onClick(); app.render();
    app.editor().onChange({ body: "Pending" }); app.render();
    if (action === "discard") {
      app.editor().onCancel(); app.render();
      app.button("notesPanel.discard").props.onClick(); app.render();
    } else if (action === "account") {
      app.setUser({ id: "user-b" }); await app.flush();
    } else app.unmount();
    app.advance(1000); await app.flush();
    assert.equal(count, 0, action);
  }
});

test("Saving indicator keeps text inputs enabled while save/cancel buttons are locked", () => {
  const Editor = load("src/components/NoteEditor.jsx", {
    react: React, "react-i18next": translation,
  }).default;
  const html = renderToStaticMarkup(React.createElement(Editor, {
    draft: sampleNote(), isNew: false, dirty: true, busy: true, saving: true,
    onChange() {}, onSave() {}, onCancel() {},
  }));
  assert.match(html, /role="status"[^>]*.*notesPanel.saving/);
  assert.doesNotMatch(html, /<fieldset[^>]* disabled=""/);
  assert.equal((html.match(/<button[^>]* disabled=""/g) || []).length, 2);
});

test("attachment target follows the saved note and upload activity blocks switching", async () => {
  const app = page(async () => [sampleNote(), { ...sampleNote(), id: "note-b" }]);
  app.render(); await app.flush(); app.sidebar().onSelect("note-a"); app.render();
  assert.equal(app.attachments().noteId, "note-a");
  assert.equal(app.attachments().saved, true);
  app.attachments().onBusyChange(true); app.render();
  app.sidebar().onSelect("note-b"); app.render();
  assert.equal(app.attachments().noteId, "note-a");
  app.attachments().onBusyChange(false); app.render();
  app.sidebar().onSelect("note-b"); app.render();
  assert.equal(app.attachments().noteId, "note-b");
});

test("note deletion waits for Storage cleanup; cleanup failure preserves the note", async () => {
  const cleanup = deferred(); let deletes = 0;
  const app = page(async () => [sampleNote()], {
    deleteNoteAttachments: () => cleanup.promise,
    deleteNote: async () => { deletes++; },
  });
  app.render(); await app.flush(); app.sidebar().onSelect("note-a"); app.render();
  app.button("notesPanel.delete").props.onClick(); app.render();
  app.button("notesPanel.confirmDelete").props.onClick(); app.render();
  assert.equal(deletes, 0);
  cleanup.reject(Error("Storage unavailable")); await app.flush();
  assert.equal(deletes, 0);
  assert.equal(app.sidebar().notes.length, 1);
});
