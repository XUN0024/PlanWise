const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), babel = require("@babel/core");
const plain = (value) => JSON.parse(JSON.stringify(value));
function load(file, imports = {}, globals = {}) {
  const filename = path.join(__dirname, "..", file);
  const { code } = babel.transformSync(fs.readFileSync(filename, "utf8"), { filename, babelrc: false, configFile: false,
    presets: [["@babel/preset-env", { targets: { node: "current" } }], "@babel/preset-react"] });
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, crypto: require("node:crypto").webcrypto, ...globals,
    require(name) {
      if (name === "../lib/expenseModel") return load("src/lib/expenseModel.jsx");
      if (!(name in imports)) throw Error("Unexpected import " + name);
      return imports[name];
    } });
  return module.exports;
}
const model = load("src/lib/expenseModel.jsx");
const row = (id = "e1", extra = {}) => ({ id, user_id: "u1", note: "Lunch", amount: "12.50", currency: "MYR", category: "Food",
  expense_date: "2026-11-06", created_at: "2026-11-06T01:00:00Z", updated_at: "2026-11-06T01:00:00.123456Z", ...extra });
const defer = () => { let resolve, reject; const promise = new Promise((yes,no) => { resolve=yes; reject=no; }); return {promise,resolve,reject}; };
const submit = { preventDefault() {} };
function backend(seed = []) {
  const rows = new Map(seed.map((item) => [item.id, { ...item }])), calls = [];
  let userId = "u1", serial = 0, loseInsert = false, failRead = false;
  const supabase = {
    auth: { getSession: async () => ({ data: { session: { user: { id: userId } } } }) },
    from(table) {
      assert.equal(table, "expenses"); let action = "select", payload, filters = [], bounds = null, orders = [];
      const query = {
        select() { return this; }, eq(...args) { filters.push(args); return this; }, order(...args) { orders.push(args); return this; },
        range(...args) { bounds = args; return this; }, insert(value) { action = "insert"; payload=value; return this; },
        update(value) { action = "update"; payload=value; return this; }, delete() { action="delete"; return this; },
        async run(single) {
          calls.push({ action, payload: plain(payload ?? null), filters: plain(filters), bounds, orders });
          if (action === "insert") {
            if (rows.has(payload.id)) return { data: null, error: { code: "23505" } };
            const saved = row(payload.id, { ...payload, created_at: `2026-11-06T03:00:${String(++serial).padStart(2,"0")}Z`, updated_at: "version-" + serial });
            rows.set(saved.id, saved);
            if (loseInsert) { loseInsert=false; return { data: null, error: Error("Response lost") }; }
            return { data: { ...saved }, error: null };
          }
          if (action === "select" && bounds && failRead) { failRead=false; return { data: null, error: Error("Read offline") }; }
          let selected = [...rows.values()].filter((item) => item.user_id === userId && filters.every(([key,value]) => item[key] === value));
          if (action === "update") selected = selected.map((item) => { const saved={...item,...payload,updated_at:"version-" + ++serial};rows.set(saved.id,saved);return saved; });
          if (action === "delete") selected.forEach((item) => rows.delete(item.id));
          if (action === "select") selected.sort((a,b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
          if (bounds) selected=selected.slice(bounds[0],bounds[1]+1);
          return { data: single ? (selected[0] ? { ...selected[0] } : null) : selected.map((item) => ({ ...item })), error: null };
        },
        single() { return query.run(true); }, maybeSingle() { return query.run(true); },
        then(yes,no) { return query.run(false).then(yes,no); },
      }; return query;
    },
  };
  return { rows, calls, setUser: (id) => {userId=id;}, loseInsert: () => {loseInsert=true;}, failRead: () => {failRead=true;},
    service: load("src/services/expenseService.jsx", { "../lib/supabase": { supabase } }) };
}
function page(back, overrides = {}) {
  let user = { id:"u1", email:"one@example.com" }, slots=[], cursor, dirty, tree, effects=[];
  const navigation=[], notices=[];
  const react = {
    createElement: (type,props,...children) => ({type,props:{...props,children}}),
    useState(initial) { const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],(value)=>{slots[i]=typeof value==="function"?value(slots[i]):value;dirty=true;}]; },
    useRef(initial) { const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i]; },
    useEffect(fn,deps) { const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>v!==old.deps[j])) effects.push(()=>{old?.cleanup?.();slots[i]={deps,cleanup:fn()};}); },
  };
  const component = load("src/components/Expenses.jsx", {
    react, "react-i18next": {useTranslation:()=>({t:(key)=>key})}, "react-router-dom": {Link:"a",useNavigate:()=>value=>navigation.push(value)},
    "../contexts/AuthContext": {useAuth:()=>({user,signOut:async()=>{notices.push("signOut");}})},
    "./LanguageSwitcher": {__esModule:true,default:"language"}, "./ExpenseEditor": {__esModule:true,default:"editor"},
    "./ExpenseDialog": {__esModule:true,default:"dialog"}, "../services/expenseService": {...back.service,...overrides},
  }).default;
  const nodes = (value) => Array.isArray(value) ? value.flatMap(nodes) : value && typeof value==="object" ? [value,...nodes(value.props?.children)] : [];
  const render = () => { let count=0;do {dirty=false;cursor=0;tree=component();const list=effects;effects=[];list.forEach(fn=>fn());if(++count>30)throw Error("render loop");}while(dirty); };
  return { render, navigation, notices,
    async flush() {await new Promise(setImmediate);render();},
    editor:()=>nodes(tree).find(node=>node.type==="editor")?.props,
    dialog:()=>nodes(tree).find(node=>node.type==="dialog")?.props,
    button:(text)=>nodes(tree).find(node=>node.type==="button"&&node.props.children.includes(text)),
    text:()=>nodes(tree).flatMap(node=>node.props.children??[]).filter(value=>typeof value==="string").join(" "),
    setUser(value) {user=value;back.setUser(value?.id);render();},
    unmount() {slots.forEach(slot=>slot?.cleanup?.());},
  };
}

test("money/date rules use exact cents, enforce MYR, validate leap days and preserve local calendar dates", () => {
  assert.equal(model.parseExpenseAmount("0.10") + model.parseExpenseAmount("0.20"),30);
  assert.equal(model.formatExpenseRM(model.parseExpenseAmount("999999999999.99")),"RM 999,999,999,999.99");
  for(const value of ["0","-1","1.001","1e2","1,000","NaN","1000000000000",".50"])assert.throws(()=>model.parseExpenseAmount(value));
  assert.equal(model.validExpenseDate("2024-02-29"),true);assert.equal(model.validExpenseDate("2026-02-29"),false);
  assert.equal(model.validExpenseDate("1900-02-29"),false);assert.equal(model.validExpenseDate("2000-02-29"),true);
  assert.equal(model.expenseToday({getFullYear:()=>2026,getMonth:()=>10,getDate:()=>6}),"2026-11-06");
  const draft={description:" 午餐 ",amount:"12.5",date:"2026-11-06",category:"Food",currency:"MYR",user_id:"bad",created_at:"bad"};
  assert.deepEqual(plain(model.expensePayload(draft)),{note:"午餐",amount:"12.50",currency:"MYR",category:"Food",expense_date:"2026-11-06"});
  assert.throws(()=>model.expensePayload({...draft,currency:"USD"}),error=>error.code==="EXPENSE_CURRENCY_INVALID");
});
test("service paginates actual data, sends owner/version predicates and only whitelisted edit fields",async()=>{
  const back=backend(Array.from({length:26},(_,n)=>row("e"+n)));
  const first=await back.service.getExpenses("u1",0);assert.equal(first.items.length,25);assert.equal(first.hasMore,true);
  assert.deepEqual(back.calls[0].bounds,[0,25]);
  const second=await back.service.getExpenses("u1",1);assert.equal(second.items.length,1);assert.equal(second.hasMore,false);
  const draft=first.items[0];await back.service.updateExpense({...draft,amount:"0.29",user_id:"u2"},"u1",draft.updatedAt);
  const update=back.calls.find(call=>call.action==="update");
  assert.equal(update.payload.amount,"0.29");assert.equal(Object.hasOwn(update.payload,"user_id"),false);
  assert.ok(update.filters.some(pair=>pair[0]==="user_id"&&pair[1]==="u1"));
  assert.ok(update.filters.some(pair=>pair[0]==="updated_at"&&pair[1]===draft.updatedAt));
  await assert.rejects(back.service.getExpenses("u2"),error=>error.code==="EXPENSE_AUTH_REQUIRED");
});
test("empty account has no demo entries/charts and new expense persists through a fresh page load",async()=>{
  const back=backend(),app=page(back);app.render();await app.flush();assert.match(app.text(),/expensesPanel.empty/);
  assert.doesNotMatch(app.text(),/Lunch at café|Chart placeholder|2025-08-15/);
  app.button("expensesPanel.add").props.onClick();app.render();assert.equal(app.editor().draft.currency,"MYR");
  assert.equal(model.validExpenseDate(app.editor().draft.date),true);
  app.editor().onChange({description:"Breakfast",amount:"15.30",date:"2026-01-01"});app.render();
  app.editor().onSave(submit);await app.flush();await app.flush();
  assert.equal(app.editor(),undefined);assert.match(app.text(),/Breakfast/);assert.match(app.text(),/RM 15.30/);
  app.unmount();const fresh=page(back);fresh.render();await fresh.flush();assert.match(fresh.text(),/Breakfast/);
});
test("double submit is blocked and a lost create response retries the same UUID without duplicate records",async()=>{
  const back=backend(),app=page(back);app.render();await app.flush();app.button("expensesPanel.add").props.onClick();app.render();
  app.editor().onChange({description:"Retry me",amount:"12.50"});app.render();const id=app.editor().draft.id;
  back.loseInsert();app.editor().onSave(submit);app.editor().onSave(submit);await app.flush();
  assert.equal(back.rows.size,1);assert.equal(back.calls.filter(call=>call.action==="insert").length,1);
  assert.equal(app.editor().draft.id,id);assert.equal(app.editor().error,"expensesPanel.saveError");
  app.editor().onSave(submit);await app.flush();await app.flush();
  assert.equal(back.rows.size,1);assert.equal(app.editor(),undefined);assert.match(app.text(),/expensesPanel.saved/);
});
test("edit updates the database and conflicts retain inputs until explicit discard/reload",async()=>{
  const back=backend([row()]),app=page(back);app.render();await app.flush();app.button("edit").props.onClick();app.render();
  app.editor().onChange({amount:"20.10",category:"Transport"});app.render();app.editor().onSave(submit);await app.flush();await app.flush();
  assert.equal(back.rows.get("e1").amount,"20.10");assert.match(app.text(),/RM 20.10/);
  app.button("edit").props.onClick();app.render();app.editor().onChange({description:"Keep this"});app.render();
  back.rows.get("e1").updated_at="newer-window";app.editor().onSave(submit);await app.flush();
  assert.equal(app.editor().error,"expensesPanel.conflict");assert.equal(app.editor().draft.description,"Keep this");
  app.editor().onReload();app.render();assert.equal(app.dialog().title,"expensesPanel.discardTitle");
  app.button("expensesPanel.keepEditing").props.onClick();app.render();assert.equal(app.editor().draft.description,"Keep this");
});
test("delete is confirmed and persisted; a failed delete leaves the record for retry",async()=>{
  const back=backend([row()]);let attempts=0;
  const app=page(back,{deleteExpense:async(...args)=>{if(++attempts===1)throw Error("Offline");return back.service.deleteExpense(...args);}});
  app.render();await app.flush();app.button("delete").props.onClick();app.render();assert.equal(attempts,0);
  app.button("expensesPanel.confirmDelete").props.onClick();await app.flush();assert.equal(back.rows.size,1);assert.match(app.text(),/expensesPanel.deleteError/);
  app.button("expensesPanel.confirmDelete").props.onClick();await app.flush();await app.flush();assert.equal(back.rows.size,0);assert.match(app.text(),/expensesPanel.empty/);
});
test("cancel dirty forms requires a choice, and cancelled/invalid input never writes",async()=>{
  const back=backend(),app=page(back);app.render();await app.flush();app.button("expensesPanel.add").props.onClick();app.render();
  app.editor().onChange({description:"Unsaved",amount:"-1"});app.render();app.editor().onSave(submit);app.render();
  assert.equal(app.editor().error,"expensesPanel.amountInvalid");assert.equal(back.calls.some(call=>call.action==="insert"),false);
  app.editor().onClose();app.render();assert.equal(app.dialog().title,"expensesPanel.discardTitle");
  app.button("expensesPanel.discard").props.onClick();app.render();assert.equal(app.editor(),undefined);assert.equal(back.rows.size,0);
});
test("committed writes followed by read failure report saved plus load error, without resubmitting",async()=>{
  const back=backend(),app=page(back);app.render();await app.flush();app.button("expensesPanel.add").props.onClick();app.render();
  app.editor().onChange({description:"Committed",amount:"1"});app.render();back.failRead();app.editor().onSave(submit);await app.flush();await app.flush();
  assert.equal(back.rows.size,1);assert.equal(app.editor(),undefined);assert.match(app.text(),/expensesPanel.saved/);assert.match(app.text(),/expensesPanel.loadError/);
  app.button("expensesPanel.retry").props.onClick();app.render();await app.flush();assert.match(app.text(),/Committed/);
  assert.equal(back.calls.filter(call=>call.action==="insert").length,1);
});
test("pagination reads the next page; deleting its last row returns to the previous page",async()=>{
  const back=backend(Array.from({length:26},(_,n)=>row("e"+String(n).padStart(2,"0")))),app=page(back);
  app.render();await app.flush();app.button("expensesPanel.next").props.onClick();app.render();await app.flush();
  app.button("delete").props.onClick();app.render();app.button("expensesPanel.confirmDelete").props.onClick();await app.flush();await app.flush();await app.flush();
  assert.equal(back.rows.size,25);assert.equal(app.button("expensesPanel.next"),undefined);
  assert.equal(back.calls.filter(call=>call.action==="select").at(-1).bounds[0],0);
});
test("load failures explain missing SQL and late account responses cannot populate another account",async()=>{
  const back=backend();let fail=true;
  let app=page(back,{getExpenses:async()=>{if(fail)throw{code:"42703"};return{items:[],hasMore:false};}});
  app.render();await app.flush();assert.match(app.text(),/expensesPanel.setupRequired/);fail=false;app.button("expensesPanel.retry").props.onClick();app.render();await app.flush();assert.match(app.text(),/expensesPanel.empty/);app.unmount();
  const pending=defer();let count=0;
  app=page(back,{getExpenses:async()=>++count===1?pending.promise:{items:[],hasMore:false}});
  app.render();app.setUser({id:"u2"});await app.flush();pending.resolve({items:[model.expenseFromRow(row())],hasMore:false});await app.flush();assert.doesNotMatch(app.text(),/Lunch/);
});
test("late create completion cannot close a new account editor or change its page state",async()=>{
  const back=backend(),pending=defer();const app=page(back,{createExpense:()=>pending.promise});
  app.render();await app.flush();app.button("expensesPanel.add").props.onClick();app.render();app.editor().onChange({description:"Private A",amount:"1"});app.render();app.editor().onSave(submit);app.render();
  app.setUser({id:"u2"});await app.flush();app.button("expensesPanel.add").props.onClick();app.render();const id=app.editor().draft.id;
  pending.resolve(model.expenseFromRow(row()));await app.flush();assert.equal(app.editor().draft.id,id);assert.equal(app.editor().draft.description,"");assert.doesNotMatch(app.text(),/expensesPanel.saved/);
});
