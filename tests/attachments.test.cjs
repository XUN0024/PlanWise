const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const babel = require("@babel/core");

function load(file, imports = {}, globals = {}) {
  const filename = path.join(__dirname, "..", file);
  const { code } = babel.transformSync(fs.readFileSync(filename, "utf8"), {
    filename, configFile: false, babelrc: false,
    presets: [["@babel/preset-env", { targets: { node: "current" } }], "@babel/preset-react"],
  });
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, URL, AbortController, setTimeout, clearTimeout,
    crypto: require("node:crypto").webcrypto,
    process: { env: { REACT_APP_SUPABASE_URL: "https://test.supabase.co", REACT_APP_SUPABASE_ANON_KEY: "public-test-key" } },
    ...globals,
    require(name) {
      if (name === "../lib/attachmentModel") return load("src/lib/attachmentModel.jsx");
      if (!(name in imports)) throw Error("Unexpected dependency: " + name);
      return imports[name];
    },
  });
  return module.exports;
}
const model = load("src/lib/attachmentModel.jsx");
const file = (name = "photo.png", size = 1024) => ({ name, size, type: "image/png", lastModified: 1 });
const record = (overrides = {}) => ({
  id: "a1", note_id: "n1", user_id: "u1", original_name: "photo.png",
  storage_path: "u1/n1/a1/file", mime_type: "image/png", size_bytes: 1024, status: "pending", ...overrides,
});
const tick = () => new Promise(setImmediate);
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

test("batch limits accept exactly five and 15MB, reject entire invalid batches", () => {
  assert.doesNotThrow(() => model.validateAttachmentBatch(Array.from({ length: 5 }, () => file("a", model.MAX_ATTACHMENT_BYTES))));
  assert.throws(() => model.validateAttachmentBatch(Array.from({ length: 6 }, () => file())), (err) => err.code === "ATTACHMENT_TOO_MANY");
  assert.throws(() => model.validateAttachmentBatch([file("large", model.MAX_ATTACHMENT_BYTES + 1)]), (err) => err.code === "ATTACHMENT_TOO_LARGE");
  assert.throws(() => model.validateAttachmentBatch([file("")]), (err) => err.code === "ATTACHMENT_INVALID_NAME");
  assert.equal(model.isFileDrag({ types: ["text/plain"] }), false);
  assert.equal(model.isFileDrag({ types: ["Files"] }), true);
});

test("file kinds and size labels cover the requested attachment symbols", () => {
  for (const [name, kind] of Object.entries({
    "x.JPG": "image", "x.pdf": "pdf", "x.xlsx": "spreadsheet", "x.pptx": "presentation",
    "x.zip": "archive", "x.mp3": "audio", "x.mp4": "video", "x.txt": "document", "x.bin": "file",
  })) assert.equal(model.attachmentKind(name), kind);
  assert.equal(model.formatAttachmentSize(15 * 1024 * 1024), "15.0 MB");
});

function backend() {
  const rows = new Map(), objects = new Set(), calls = [], uploads = [], sdkOptions = [];
  let currentUser = "u1", completeFailure = false, uploadFailure = false, stalled = false, arrayResult = false;
  const session = () => ({ user: { id: currentUser }, access_token: "token" });
  const supabase = {
    auth: { getSession: async () => ({ data: { session: session() }, error: null }) },
    from(table) {
      let operation = "select", payload, filters = [];
      const query = {
        select() { return query; }, eq(key, value) { filters.push([key, value]); return query; },
        order() { return query; },
        insert(value) { operation = "insert"; payload = value; return query; },
        delete() { operation = "delete"; return query; },
        async run(single) {
          calls.push([table, operation, filters, payload]);
          if (table === "notes") return { data: { updated_at: "version-1" }, error: null };
          if (operation === "insert") {
            const created = record({ ...payload, storage_path: payload.user_id + "/" + payload.note_id + "/" + payload.id + "/file" });
            rows.set(created.id, created); return { data: created, error: null };
          }
          const selected = [...rows.values()].filter((row) => filters.every(([key, value]) => row[key] === value));
          if (operation === "delete") selected.forEach((row) => rows.delete(row.id));
          return { data: single ? selected[0] || null : selected, error: null };
        },
        single() { return query.run(true); }, maybeSingle() { return query.run(true); },
        then(yes, no) { return query.run(false).then(yes, no); },
      };
      return query;
    },
    storage: { from(bucket) {
      assert.equal(bucket, "note-attachments");
      return {
        upload: async (objectPath, f, options) => {
          calls.push(["standard", objectPath, options]);
          if (uploadFailure) return { error: Object.assign(Error("Storage rejected"), { status: 403 }) };
          objects.add(objectPath);
          return { data: { path: objectPath }, error: null };
        },
        remove: async (paths) => { calls.push(["remove", ...paths]); paths.forEach((p) => objects.delete(p)); return { error: null }; },
        download: async (p) => ({ data: { path: p }, error: null }),
      };
    } },
    rpc: async (name, payload) => {
      assert.equal(name, "complete_note_attachment");
      calls.push(["complete", payload.p_attachment_id]);
      const item = rows.get(payload.p_attachment_id);
      if (!objects.has(item.storage_path)) return { error: { code: "22023", message: "File has not finished uploading" } };
      if (completeFailure) return { error: Error("Confirmation offline") };
      const ready = { ...item, status: "ready" }; rows.set(item.id, ready);
      return { data: arrayResult ? [ready] : ready, error: null };
    },
  };
  class Upload {
    constructor(f, options) { this.file = f; this.options = options; uploads.push(this); }
    async findPreviousUploads() { return []; }
    start() {
      this.options.onBeforeRequest({ setHeader() {} }).then(() => {
        if (stalled) return;
        if (uploadFailure) this.options.onError(Error("Offline"));
        else {
          objects.add(this.options.metadata.objectName);
          this.options.onProgress(this.file.size, this.file.size);
          this.options.onSuccess();
        }
      }).catch(this.options.onError);
    }
    async abort() { calls.push(["abort"]); }
  }
  const service = load("src/services/attachmentService.jsx", {
    "tus-js-client": { Upload }, "../lib/supabase": { supabase },
    "@supabase/supabase-js": { createClient: (url, key, options) => {
      assert.equal(url, "https://test.supabase.co");
      assert.equal(key, "public-test-key");
      sdkOptions.push(options);
      return { storage: supabase.storage };
    } },
  });
  return {
    service, rows, objects, calls, uploads, sdkOptions,
    setUser(value) { currentUser = value; },
    failComplete(value) { completeFailure = value; },
    failUpload(value) { uploadFailure = value; },
    stall() { stalled = true; },
    returnArray() { arrayResult = true; },
  };
}
const uploadOptions = () => ({ file: file("photo.png", 7 * 1024 * 1024), noteId: "n1", userId: "u1", id: "a1" });

test("upload reserves the correct note relationship, uploads to its generated path and confirms", async () => {
  const back = backend(); const progress = [];
  const ready = await back.service.uploadAttachment({ ...uploadOptions(), onProgress: (n) => progress.push(n) });
  assert.equal(ready.note_id, "n1"); assert.equal(ready.user_id, "u1");
  assert.equal(ready.status, "ready");
  const tus = back.uploads[0].options;
  assert.equal(tus.metadata.objectName, "u1/n1/a1/file");
  assert.equal(tus.chunkSize, 6 * 1024 * 1024);
  assert.equal(tus.headers["x-upsert"], "false");
  assert.equal(tus.endpoint, "https://test.storage.supabase.co/storage/v1/upload/resumable");
  assert.deepEqual(progress, [99]);
  assert.ok(back.calls.findIndex((call) => call[1] === "insert") < back.calls.findIndex((call) => call[0] === "complete"));
});

test("the reported 3.39MB PDF uses authenticated standard upload and keeps its note link", async () => {
  const back = backend(), progress = [];
  const pdf = { ...file("green_mood_board.pdf", 3558243), type: "application/pdf" };
  const result = await back.service.uploadAttachment({ ...uploadOptions(), file: pdf, onProgress: (n) => progress.push(n) });
  assert.equal(result.status, "ready");
  assert.equal(result.note_id, "n1");
  assert.equal(back.uploads.length, 0);
  const request = back.calls.find((call) => call[0] === "standard");
  assert.equal(request[1], "u1/n1/a1/file");
  assert.equal(request[2].upsert, false);
  assert.equal(request[2].contentType, "application/pdf");
  assert.equal(back.sdkOptions[0].global.headers.Authorization, "Bearer token");
  assert.equal(back.sdkOptions[0].auth.persistSession, false);
  assert.deepEqual(progress, [null, 99]);
  assert.equal(back.service.uploadTransport(6 * 1024 * 1024), "standard");
  assert.equal(back.service.uploadTransport(6 * 1024 * 1024 + 1), "resumable");
});

test("standard upload preserves HTTP failure details and does not confirm missing bytes", async () => {
  const back = backend(); back.failUpload(true);
  await assert.rejects(back.service.uploadAttachment({ ...uploadOptions(), file: file() }),
    (error) => error.attachmentStage === "transfer" && error.attachmentTransport === "standard" && error.status === 403);
  assert.equal(back.rows.get("a1").status, "pending");
  assert.equal(back.objects.size, 0);
  assert.equal(back.calls.some((call) => call[0] === "complete"), false);
});

test("real Supabase SDK standard request carries the current bearer token and abort signal", async () => {
  let saved, request;
  const controller = new AbortController();
  const query = {
    select() { return this; }, eq() { return this; },
    maybeSingle: async () => ({ data: null, error: null }),
    insert(payload) { saved = record({ ...payload }); return this; },
    single: async () => ({ data: saved, error: null }),
  };
  const service = load("src/services/attachmentService.jsx", {
    "tus-js-client": { Upload: class { constructor() { throw Error("Unexpected TUS"); } } },
    "@supabase/supabase-js": require("@supabase/supabase-js"),
    "../lib/supabase": { supabase: {
      auth: { getSession: async () => ({ data: { session: { user: { id: "u1" }, access_token: "current-user-token" } } }) },
      from: () => query,
      rpc: async () => ({ data: { ...saved, status: "ready" }, error: null }),
    } },
  }, {
    fetch: async (url, init) => {
      request = { url, init };
      return new Response(JSON.stringify({ Id: "stored-file", Key: "note-attachments/u1/n1/a1/file" }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    },
  });
  const pdf = new File(["small test PDF"], "document.pdf", { type: "application/pdf" });
  assert.equal((await service.uploadAttachment({ ...uploadOptions(), file: pdf, signal: controller.signal })).status, "ready");
  assert.match(request.url, /storage\/v1\/object\/note-attachments\/u1\/n1\/a1\/file$/);
  assert.equal(new Headers(request.init.headers).get("authorization"), "Bearer current-user-token");
  assert.equal(request.init.signal, controller.signal);
  assert.equal(request.init.body instanceof FormData, true);
});

test("lost confirmation retries the same attachment without another object upload", async () => {
  const back = backend(); back.failComplete(true);
  await assert.rejects(back.service.uploadAttachment(uploadOptions()), /Confirmation/);
  assert.equal(back.rows.size, 1); assert.equal(back.objects.size, 1);
  back.failComplete(false);
  assert.equal((await back.service.uploadAttachment(uploadOptions())).status, "ready");
  assert.equal(back.rows.size, 1); assert.equal(back.uploads.length, 1);
});

test("upload confirmation accepts a single-row composite RPC array response", async () => {
  const back = backend(); back.returnArray();
  assert.equal((await back.service.uploadAttachment(uploadOptions())).status, "ready");
});

test("failed bytes retain a pending record and retry uses the same UUID", async () => {
  const back = backend(); back.failUpload(true);
  await assert.rejects(back.service.uploadAttachment(uploadOptions()),
    (error) => error.attachmentStage === "transfer" && error.message === "Offline");
  assert.equal(back.rows.get("a1").status, "pending");
  back.failUpload(false);
  await back.service.uploadAttachment(uploadOptions());
  assert.equal(back.rows.size, 1); assert.equal(back.objects.size, 1);
});

test("diagnostics preserve server errors and redact tokens and request URLs", () => {
  const diagnostic = model.attachmentDiagnostic({
    attachmentStage: "transfer",
    originalResponse: {
      getStatus: () => 403,
      getBody: () => JSON.stringify({ message: "new row violates row-level security policy" }),
    },
  });
  assert.equal(diagnostic.status, 403);
  assert.equal(diagnostic.stage, "transfer");
  assert.match(diagnostic.message, /row-level security/);
  const sanitized = model.attachmentDiagnostic({
    message: "Failed https://example.com/upload?token=private Bearer secret-token eyJheader.payload.signature",
  });
  assert.doesNotMatch(sanitized.message, /secret-token|token=private|eyJheader/);
  assert.doesNotThrow(() => model.attachmentDiagnostic({
    originalResponse: { getBody: () => "null", getStatus: () => 500 },
  }));
});

test("account mismatches reject before reservation; abort stops active upload", async () => {
  const back = backend(); back.setUser("u2");
  await assert.rejects(back.service.uploadAttachment(uploadOptions()), (error) => error.code === "ATTACHMENT_AUTH");
  assert.equal(back.rows.size, 0);
  back.setUser("u1"); back.stall();
  const controller = new AbortController();
  const result = back.service.uploadAttachment({ ...uploadOptions(), signal: controller.signal });
  await tick(); controller.abort();
  await assert.rejects(result, (error) => error.code === "ATTACHMENT_CANCELLED");
  assert.ok(back.calls.some((call) => call[0] === "abort"));
});

test("deletion cleans Storage before metadata; stale note does not delete files", async () => {
  const back = backend();
  await back.service.uploadAttachment(uploadOptions());
  await assert.rejects(back.service.deleteNoteAttachments({ id: "n1", updatedAt: "old" }, "u1"), (error) => error.code === "NOTE_CONFLICT");
  assert.equal(back.objects.size, 1);
  await back.service.deleteNoteAttachments({ id: "n1", updatedAt: "version-1" }, "u1");
  assert.equal(back.objects.size, 0); assert.equal(back.rows.size, 0);
  assert.ok(back.calls.findIndex((c) => c[0] === "remove") < back.calls.findIndex((c) => c[1] === "delete"));
});

function panel(services = {}, props = {}) {
  let slots = [], cursor = 0, dirty, effects = [], tree;
  const calls = [], events = {};
  const react = {
    createElement: (type, attrs, ...children) => ({ type, props: { ...attrs, children } }),
    useState(initial) {
      const i = cursor++; if (!(i in slots)) slots[i] = initial;
      return [slots[i], (next) => { slots[i] = typeof next === "function" ? next(slots[i]) : next; dirty = true; }];
    },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useEffect(fn, deps) {
      const i = cursor++, old = slots[i];
      if (!old || deps.some((value, j) => value !== old.deps[j])) effects.push(() => {
        old?.cleanup?.(); slots[i] = { deps, cleanup: fn() };
      });
    },
  };
  const component = load("src/components/NoteAttachments.jsx", {
    react, "react-i18next": { useTranslation: () => ({ t: (key) => key }) },
    "@fortawesome/react-fontawesome": { FontAwesomeIcon: "icon" },
    "@fortawesome/free-solid-svg-icons": {},
    "../services/attachmentService": {
      getAttachments: async () => [],
      uploadAttachment: async (options) => {
        calls.push(options); return record({ id: options.id, original_name: options.file.name, status: "ready" });
      },
      removeAttachment: async () => {}, discardAttachment: async () => {}, downloadAttachment: async () => {},
      ...services,
    },
  }, {
    window: {
      addEventListener: (name, callback) => { events[name] = callback; },
      removeEventListener: (name) => { delete events[name]; },
    },
  }).default;
  const render = () => {
    let count = 0;
    do {
      dirty = false; cursor = 0;
      tree = component({ noteId: "n1", userId: "u1", saved: true, children: "Note body", ...props });
      const pending = effects; effects = []; pending.forEach((effect) => effect());
      if (++count > 20) throw Error("Render loop");
    } while (dirty);
  };
  const nodes = (node) => Array.isArray(node) ? node.flatMap(nodes)
    : node && typeof node === "object" ? [node, ...nodes(node.props?.children)] : [];
  return {
    render, calls, events,
    root: () => tree.props,
    async flush() { await tick(); render(); },
    text: () => nodes(tree).flatMap((node) => node.props.children).filter((value) => typeof value === "string").join(" "),
    button: (key) => nodes(tree).find((node) => node.type === "button" && node.props.children.includes(key)),
    unmount: () => slots.forEach((slot) => slot?.cleanup?.()),
  };
}
const drag = (files = [], types = ["Files"]) => ({
  preventDefault() {}, stopPropagation() {},
  dataTransfer: { files, types, items: [], dropEffect: "" },
});

test("drop zone is hidden normally, ignores text, and does not flicker on nested drag enter/leave", async () => {
  const app = panel(); app.render(); await app.flush();
  assert.doesNotMatch(app.text(), /attachments.dropHere/);
  app.root().onDragEnter(drag([], ["text/plain"])); app.render();
  assert.doesNotMatch(app.text(), /attachments.dropHere/);
  app.root().onDragEnter(drag()); app.root().onDragEnter(drag()); app.render();
  app.root().onDragLeave(drag()); app.render();
  assert.match(app.text(), /attachments.dropHere/);
  app.root().onDragLeave(drag()); app.render();
  assert.doesNotMatch(app.text(), /attachments.dropHere/);
  app.unmount();
});

test("invalid batches and unsaved notes cannot start uploading", async () => {
  const app = panel(); app.render(); await app.flush();
  app.root().onDrop(drag(Array.from({ length: 6 }, () => file()))); app.render();
  assert.match(app.text(), /attachments.tooMany/); assert.equal(app.calls.length, 0);
  app.root().onDrop(drag([file("large", model.MAX_ATTACHMENT_BYTES + 1)])); app.render();
  assert.match(app.text(), /attachments.tooLarge/); assert.equal(app.calls.length, 0);
  const unsaved = panel({}, { saved: false }); unsaved.render();
  unsaved.root().onDrop(drag([file()])); unsaved.render();
  assert.match(unsaved.text(), /attachments.saveFirst/); assert.equal(unsaved.calls.length, 0);
  app.unmount(); unsaved.unmount();
});

test("five-file batch uses at most two workers and renders successful files", async () => {
  const requests = []; const busy = [];
  const app = panel({
    uploadAttachment: (options) => { const pending = deferred(); requests.push({ options, ...pending }); return pending.promise; },
  }, { onBusyChange: (value) => busy.push(value) });
  app.render(); await app.flush();
  app.root().onDrop(drag(Array.from({ length: 5 }, (_, i) => file("file-" + i + ".png")))); app.render();
  assert.equal(requests.length, 2);
  for (let i = 0; i < 5; i++) {
    const request = requests[i];
    assert.equal(request.options.noteId, "n1"); assert.equal(request.options.userId, "u1");
    request.resolve(record({ id: request.options.id, original_name: request.options.file.name, status: "ready" }));
    await app.flush();
    assert.equal(requests.length, Math.min(5, i + 3));
  }
  assert.match(app.text(), /file-4.png/);
  assert.equal(busy[0], true); assert.equal(busy.at(-1), false);
  assert.doesNotMatch(app.text(), /attachments.dropHere/);
  app.unmount();
});

test("failed upload retries its original UUID; unmount aborts active requests", async () => {
  const requests = [];
  const app = panel({
    uploadAttachment: (options) => {
      const pending = deferred(); requests.push({ options, ...pending });
      options.signal.addEventListener("abort", () => pending.reject(Error("Aborted")));
      return pending.promise;
    },
  });
  app.render(); await app.flush(); app.root().onDrop(drag([file()])); app.render();
  requests[0].reject(Error("Offline")); await app.flush();
  app.button("notesPanel.retry").props.onClick(); app.render();
  assert.equal(requests[0].options.id, requests[1].options.id);
  app.unmount();
  assert.equal(requests[1].options.signal.aborted, true);
  await tick();
});

test("cancel upload stops active workers and leaves retryable items", async () => {
  const requests = [], busy = [];
  const app = panel({
    uploadAttachment: (options) => {
      const pending = deferred(); requests.push(options);
      options.signal.addEventListener("abort", () => pending.reject(Error("Cancelled")));
      return pending.promise;
    },
  }, { onBusyChange: (value) => busy.push(value) });
  app.render(); await app.flush(); app.root().onDrop(drag([file("a"), file("b"), file("c")])); app.render();
  assert.equal(requests.length, 2);
  app.button("attachments.cancelUpload").props.onClick(); await app.flush();
  assert.equal(requests.length, 2);
  assert.equal(busy.at(-1), false);
  assert.match(app.text(), /attachments.cancelled/);
});
