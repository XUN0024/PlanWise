const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const babel = require("@babel/core");

// Exercise real module handlers without a browser, network, or real credentials.
function load(relativePath, imports) {
  const filename = path.join(__dirname, "..", relativePath);
  const { code } = babel.transformSync(fs.readFileSync(filename, "utf8"), {
    filename, babelrc: false, configFile: false,
    presets: [["@babel/preset-env", { targets: { node: "current" } }], "@babel/preset-react"],
  });
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports,
    require: (name) => {
      if (!(name in imports)) throw new Error("Unexpected dependency: " + name);
      return imports[name];
    },
    console: { log() {}, error() {} },
    crypto: require("node:crypto").webcrypto,
    setTimeout, clearTimeout,
    cancelAnimationFrame() {},
  }, { filename });
  return module.exports;
}
const dbTask = (overrides = {}) => ({
  id: "task-1", title: "Plan week", description: "", priority: "Medium",
  is_completed: false, subtasks: [{ id: "sub-1", title: "Buy groceries", is_completed: false }],
  ...overrides,
});
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const tick = () => new Promise(setImmediate);
const submitEvent = { preventDefault() {} };

function workflow(serviceOverrides = {}) {
  let user = { id: "user-a", email: "a@example.com" };
  let slots = [], cursor = 0, dirty = true, tree, effects = [];
  const calls = [];
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], (value) => {
        slots[index] = typeof value === "function" ? value(slots[index]) : value;
        dirty = true;
      }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useEffect(effect, dependencies) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || dependencies.some((value, i) => !Object.is(value, previous.dependencies[i]))) {
        effects.push(() => {
          previous?.cleanup?.();
          slots[index] = { dependencies, cleanup: effect() };
        });
      }
    },
  };
  const services = {
    getTasks: async () => [dbTask()],
    saveTask: async (draft) => {
      calls.push(["save", draft]);
      return dbTask({ id: draft.id, title: draft.title,
        subtasks: draft.subtasks.map((s) => ({ id: s.id, title: s.title, is_completed: s.isCompleted })) });
    },
    updateTask: async (id, data) => { calls.push(["task", id, data]); return dbTask(data); },
    updateSubtask: async (id, data) => { calls.push(["subtask", id, data]); return { id, ...data }; },
    deleteTask: async (id) => { calls.push(["delete", id]); },
    ...serviceOverrides,
  };
  const components = load("src/components/Tasks.jsx", {
    react,
    "../contexts/AuthContext": { useAuth: () => ({ user, signOut() {} }) },
    "../services/taskService": services,
    "@fortawesome/react-fontawesome": { FontAwesomeIcon: "icon" },
    "@fortawesome/free-solid-svg-icons": {},
    "react-router-dom": { Link: "a" },
    "./LanguageSwitcher": { __esModule: true, default: "language-switcher" },
    "react-i18next": { useTranslation: () => ({ t: (key) => key }) },
  });
  function render() {
    let iterations = 0;
    do {
      dirty = false; cursor = 0;
      tree = components.default();
      const pending = effects; effects = [];
      pending.forEach((effect) => effect());
      if (++iterations > 30) throw Error("Render loop");
    } while (dirty);
  }
  function all(predicate, node) {
    if (arguments.length < 2) node = tree;
    if (Array.isArray(node)) return node.flatMap((item) => all(predicate, item));
    if (!node || typeof node !== "object") return [];
    return [...(predicate(node) ? [node] : []), ...all(predicate, node.props?.children ?? null)];
  }
  return {
    calls, components, render,
    async flush() { await tick(); render(); await tick(); render(); },
    cards: () => all((node) => node.type === components.TaskCard),
    editor: () => all((node) => node.type === components.TaskEditor)[0],
    button: (text) => all((node) => node.type === "button" && node.props.children.flat(Infinity).includes(text))[0],
    alerts: () => all((node) => node.props?.role === "alert"),
    setUser(value) { user = value; render(); },
    unmount() { slots.forEach((slot) => slot?.cleanup?.()); },
  };
}

test("load, edit and save title plus child changes through the real page handlers", async () => {
  const app = workflow(); app.render(); await app.flush();
  assert.equal(app.cards().length, 1);
  app.cards()[0].props.onEdit(app.cards()[0].props.task); app.render();
  app.editor().props.onChange({ title: "Updated title", subtasks: [] }); app.render();
  app.editor().props.onSave(submitEvent); await app.flush();
  assert.equal(app.editor(), undefined);
  assert.equal(app.cards()[0].props.task.title, "Updated title");
  assert.equal(app.cards()[0].props.task.subtasks.length, 0);
});

test("completion waits for server success and keeps child status independent", async () => {
  const request = deferred();
  const app = workflow({ updateTask: () => request.promise });
  app.render(); await app.flush();
  app.cards()[0].props.onToggle(app.cards()[0].props.task); app.render();
  assert.equal(app.cards()[0].props.task.isCompleted, false);
  assert.equal(app.cards()[0].props.busy, true);
  request.resolve(dbTask({ is_completed: true })); await app.flush();
  assert.equal(app.cards().length, 0);
  // Expand completed section.
  const button = app.button(1);
  button.props.onClick(); app.render();
  assert.equal(app.cards()[0].props.task.isCompleted, true);
  assert.equal(app.cards()[0].props.task.subtasks[0].isCompleted, false);
});

test("completed tasks restore through a persisted update", async () => {
  const app = workflow({ getTasks: async () => [dbTask({ is_completed: true })] });
  app.render(); await app.flush();
  app.button(1).props.onClick(); app.render();
  app.cards()[0].props.onToggle(app.cards()[0].props.task); await app.flush();
  assert.equal(app.calls[0][2].is_completed, false);
  assert.equal(app.cards()[0].props.task.isCompleted, false);
});

test("subtask completion and restore use persisted responses", async () => {
  const app = workflow(); app.render(); await app.flush();
  let task = app.cards()[0].props.task;
  app.cards()[0].props.onToggleSub(task, task.subtasks[0]); await app.flush();
  task = app.cards()[0].props.task;
  assert.equal(task.subtasks[0].isCompleted, true);
  assert.equal(task.isCompleted, false);
  app.cards()[0].props.onToggleSub(task, task.subtasks[0]); await app.flush();
  assert.equal(app.cards()[0].props.task.subtasks[0].isCompleted, false);
});

test("failed completion does not change state and surfaces a retryable error", async () => {
  const app = workflow({ updateTask: async () => { throw Error("Offline"); } });
  app.render(); await app.flush();
  app.cards()[0].props.onToggle(app.cards()[0].props.task); await app.flush();
  assert.equal(app.cards()[0].props.task.isCompleted, false);
  assert.equal(app.cards()[0].props.busy, false);
  assert.equal(app.alerts().length, 1);
});

test("double submit makes one request; failed create retains draft UUID for retry", async () => {
  const request = deferred(); let count = 0;
  const app = workflow({ saveTask: () => { count++; return request.promise; } });
  app.render(); await app.flush();
  app.button("Add Task").props.onClick(); app.render();
  app.editor().props.onChange({ title: "New task" }); app.render();
  const id = app.editor().props.draft.id;
  const save = app.editor().props.onSave;
  save(submitEvent); save(submitEvent); app.render();
  assert.equal(count, 1);
  request.reject(Error("Network interrupted")); await app.flush();
  assert.equal(app.editor().props.draft.id, id);
  assert.equal(app.editor().props.draft.title, "New task");
  assert.equal(app.editor().props.saving, false);
  assert.match(app.editor().props.error, /Network/);
});

test("delete requires confirmation and waits for server; failure retains the task", async () => {
  const request = deferred();
  const app = workflow({ deleteTask: () => request.promise });
  app.render(); await app.flush();
  app.cards()[0].props.onDelete(app.cards()[0].props.task); app.render();
  assert.equal(app.cards().length, 1);
  app.button("Delete").props.onClick(); app.render();
  assert.equal(app.cards().length, 1);
  request.reject(Error("Delete denied")); await app.flush();
  assert.equal(app.cards().length, 1);
  assert.equal(app.alerts().length, 1);
});

test("successful delete removes the task after confirmation", async () => {
  const app = workflow(); app.render(); await app.flush();
  app.cards()[0].props.onDelete(app.cards()[0].props.task); app.render();
  app.button("Delete").props.onClick(); await app.flush();
  assert.equal(app.cards().length, 0);
  assert.deepEqual(app.calls[0], ["delete", "task-1"]);
});

test("late requests from an old account cannot populate the next account", async () => {
  const oldRequest = deferred(); let count = 0;
  const app = workflow({ getTasks: () => ++count === 1 ? oldRequest.promise : Promise.resolve([]) });
  app.render();
  app.setUser({ id: "user-b", email: "b@example.com" }); await app.flush();
  oldRequest.resolve([dbTask()]); await app.flush();
  assert.equal(app.cards().length, 0);
});

test("late mutation does not populate a switched account", async () => {
  const request = deferred(); let count = 0;
  const app = workflow({
    getTasks: async () => ++count === 1 ? [dbTask()] : [],
    updateTask: () => request.promise,
  });
  app.render(); await app.flush();
  app.cards()[0].props.onToggle(app.cards()[0].props.task); app.render();
  app.setUser({ id: "user-b" }); await app.flush();
  request.resolve(dbTask({ is_completed: true })); await app.flush();
  assert.equal(app.cards().length, 0);
});

test("load failure can be retried", async () => {
  let attempts = 0;
  const app = workflow({ getTasks: async () => {
    if (++attempts === 1) throw Error("Offline");
    return [dbTask()];
  } });
  app.render(); await app.flush();
  assert.equal(app.alerts().length, 1);
  app.button("Reload tasks").props.onClick(); app.render(); await app.flush();
  assert.equal(app.alerts().length, 0);
  assert.equal(app.cards().length, 1);
});

test("service saves a whitelisted transactional payload with optional reminder and stable IDs", async () => {
  const payloads = [];
  const service = load("src/services/taskService.jsx", {
    "../lib/supabase": { supabase: { rpc: async (name, payload) => {
      payloads.push({ name, payload }); return { data: dbTask(), error: null };
    } } },
  });
  const draft = { id: "task-1", title: "  Plan  ", description: "", priority: "High",
    reminderDate: "", reminderClock: "", user_id: "untrusted",
    subtasks: [{ id: "sub-1", title: " Child ", isCompleted: true }] };
  await service.saveTask(draft, true); await service.saveTask(draft, true);
  assert.equal(payloads[0].name, "save_task");
  assert.equal(payloads[0].payload.p_task.title, "Plan");
  assert.equal(payloads[0].payload.p_task.reminder_date, null);
  assert.equal(payloads[0].payload.p_task.user_id, undefined);
  assert.equal(payloads[0].payload.p_subtasks[0].is_completed, true);
  assert.equal(payloads[0].payload.p_task_id, payloads[1].payload.p_task_id);
  await assert.rejects(service.saveTask({ ...draft, title: " " }), /title/);
  await assert.rejects(service.saveTask({ ...draft, subtasks: [{ title: " " }] }), /subtask/);
  await assert.rejects(service.saveTask({ ...draft, reminderDate: "2026-11-03" }), /both/);
});

test("service explains a missing migration and propagates database failures", async () => {
  let error = { code: "PGRST202", message: "Missing RPC" };
  const service = load("src/services/taskService.jsx", {
    "../lib/supabase": { supabase: { rpc: async () => ({ data: null, error }) } },
  });
  const draft = { id: "task-1", title: "Test", subtasks: [] };
  await assert.rejects(service.saveTask(draft), /20261103_task_save.sql/);
  error = Error("Permission denied");
  await assert.rejects(service.saveTask(draft), /Permission denied/);
});
