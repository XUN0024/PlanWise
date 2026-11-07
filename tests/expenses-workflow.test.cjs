const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), babel = require("@babel/core");
const plain = (value) => JSON.parse(JSON.stringify(value));
function load(file, imports = {}, globals = {}) {
  const filename = path.join(__dirname, "..", file);
  const { code } = babel.transformSync(fs.readFileSync(filename, "utf8"), { filename, babelrc: false, configFile: false,
    presets: [["@babel/preset-env", { targets: { node: "current" } }], "@babel/preset-react"] });
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, crypto: require("node:crypto").webcrypto, URLSearchParams, ...globals,
    require(name) {
      if (["../lib/expenseModel", "./expenseModel"].includes(name)) return load("src/lib/expenseModel.jsx");
      if (name === "../lib/expenseQuery") return load("src/lib/expenseQuery.jsx");
      if (name === "../lib/expenseStatistics") return load("src/lib/expenseStatistics.jsx");
      if (name === "./expenseReceiptService") return imports[name] || {deleteExpenseReceipts:async()=>{}};
      if (!(name in imports)) throw Error("Unexpected import " + name);
      return imports[name];
    } });
  return module.exports;
}
const model = load("src/lib/expenseModel.jsx");
const row = (id = "e1", extra = {}) => ({ id, user_id: "u1", note: "Lunch", amount: "12.50", currency: "MYR", category: "Food",
  payment_method: null, expense_time: null,
  expense_date: "2026-11-06", created_at: "2026-11-06T01:00:00Z", updated_at: "2026-11-06T01:00:00.123456Z", ...extra });
const defer = () => { let resolve, reject; const promise = new Promise((yes,no) => { resolve=yes; reject=no; }); return {promise,resolve,reject}; };
const submit = { preventDefault() {} };
function backend(seed = []) {
  const rows = new Map(seed.map((item) => [item.id, { ...item }])), calls = [];
  let userId = "u1", serial = 0, loseInsert = false, failRead = false;
  const supabase = {
    auth: { getSession: async () => ({ data: { session: { user: { id: userId } } } }) },
    from(table) {
      assert.equal(table, "expenses"); let action = "select", payload, filters = [], predicates = [], bounds = null, orders = [];
      const query = {
        select() { return this; }, eq(...args) { filters.push(args); return this; }, order(...args) { orders.push(args); return this; },
        gte(key,value) { predicates.push([key,"gte",value]); return this; }, lte(key,value) { predicates.push([key,"lte",value]); return this; },
        is(key,value) { predicates.push([key,"is",value]); return this; }, filter(...args) { predicates.push(args); return this; },
        range(...args) { bounds = args; return this; }, insert(value) { action = "insert"; payload=value; return this; },
        update(value) { action = "update"; payload=value; return this; }, delete() { action="delete"; return this; },
        async run(single) {
          calls.push({ action, payload: plain(payload ?? null), filters: plain(filters), predicates: plain(predicates), bounds, orders });
          if (action === "insert") {
            if (rows.has(payload.id)) return { data: null, error: { code: "23505" } };
            const saved = row(payload.id, { ...payload, created_at: `2026-11-06T03:00:${String(++serial).padStart(2,"0")}Z`, updated_at: "version-" + serial });
            rows.set(saved.id, saved);
            if (loseInsert) { loseInsert=false; return { data: null, error: Error("Response lost") }; }
            return { data: { ...saved }, error: null };
          }
          if (action === "select" && bounds && failRead) { failRead=false; return { data: null, error: Error("Read offline") }; }
          let selected = [...rows.values()].filter((item) => item.user_id === userId && filters.every(([key,value]) => item[key] === value));
          selected = selected.filter(item => predicates.every(([key,op,value]) => {
            if (op === "is") return item[key] === value;
            if (op === "imatch") return new RegExp(value,"i").test(item[key]);
            const actual = key === "amount" ? Number(item[key]) : item[key], target = key === "amount" ? Number(value) : value;
            return op === "gte" ? actual >= target : actual <= target;
          }));
          if (action === "update") selected = selected.map((item) => { const saved={...item,...payload,updated_at:"version-" + ++serial};rows.set(saved.id,saved);return saved; });
          if (action === "delete") selected.forEach((item) => rows.delete(item.id));
          if (action === "select") selected.sort((a,b) => {
            for (const [key,options] of orders) {
              if (a[key] === b[key]) continue;
              if (a[key] == null || b[key] == null) return (a[key] == null ? 1 : -1) * (options.nullsFirst ? -1 : 1);
              const x = key === "amount" ? Number(a[key]) : a[key], y = key === "amount" ? Number(b[key]) : b[key];
              return (x < y ? -1 : 1) * (options.ascending ? 1 : -1);
            } return 0;
          });
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
function page(back, overrides = {}, clock = {}) {
  let location={search:"",key:"start"};
  let user = { id:"u1", email:"one@example.com" }, slots=[], cursor, dirty, tree, effects=[];
  const navigation=[], notices=[];
  const react = {
    createElement: (type,props,...children) => ({type,props:{...props,children}}),
    useState(initial) { const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],(value)=>{slots[i]=typeof value==="function"?value(slots[i]):value;dirty=true;}]; },
    useRef(initial) { const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i]; },
    useEffect(fn,deps) { const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>v!==old.deps[j])) effects.push(()=>{old?.cleanup?.();slots[i]={deps,cleanup:fn()};}); },
  };
  const component = load("src/components/Expenses.jsx", {
    react, "react-i18next": {useTranslation:()=>({t:(key)=>key})}, "react-router-dom": {Link:"a",useNavigate:()=>value=>navigation.push(value),useLocation:()=>location},
    "../contexts/AuthContext": {useAuth:()=>({user,signOut:async()=>{notices.push("signOut");}})},
    "./LanguageSwitcher": {__esModule:true,default:"language"}, "./ExpenseEditor": {__esModule:true,default:"editor"},
    "./ExpenseDialog": {__esModule:true,default:"dialog"}, "../services/expenseService": {...back.service,getExpenseStatistics:async()=>({count:"0",totalCents:"0",averageCents:"0",granularity:"day",categories:[],methods:[],trend:[]}),...overrides},
    "./ExpenseFilters": {__esModule:true,default:"filters"},
    "./ExpenseStatistics": {__esModule:true,default:"statistics"},
    "./ExpenseReceipts": {__esModule:true,default:"receipts"},
  }, {setTimeout, clearTimeout, ...clock}).default;
  const nodes = (value) => Array.isArray(value) ? value.flatMap(nodes) : value && typeof value==="object" ? [value,...nodes(value.props?.children)] : [];
  const render = () => { let count=0;do {dirty=false;cursor=0;tree=component();const list=effects;effects=[];list.forEach(fn=>fn());if(++count>30)throw Error("render loop");}while(dirty); };
  return { render, navigation, notices,
    openSource(id){location={search:"?expense="+encodeURIComponent(id),key:String(Math.random())};render();},
    async flush() {await new Promise(setImmediate);render();},
    editor:()=>nodes(tree).find(node=>node.type==="editor")?.props,
    dialog:()=>nodes(tree).find(node=>node.type==="dialog")?.props,
    filters:()=>nodes(tree).find(node=>node.type==="filters")?.props,
    statistics:()=>nodes(tree).find(node=>node.type==="statistics")?.props,
    receipts:()=>nodes(tree).find(node=>node.type==="receipts")?.props,
    button:(text)=>nodes(tree).find(node=>node.type==="button"&&node.props.children.includes(text)),
    text:()=>nodes(tree).flatMap(node=>node.props.children??[]).filter(value=>typeof value==="string").join(" "),
    setUser(value) {user=value;back.setUser(value?.id);render();},
    unmount() {slots.forEach(slot=>slot?.cleanup?.());},
  };
}

test("expense sources load the owning record outside the current page and protect edits made during lookup",async()=>{
  const back=backend([row("first"),row("source",{note:"Source expense"})]),pending=defer();
  const app=page(back,{getExpenseById:()=>pending.promise});app.render();await app.flush();
  app.openSource("source");
  // Opening/editing another bill while the source request is in flight must not lose its draft.
  app.button("expensesPanel.add").props.onClick();app.render();app.editor().onChange({description:"Keep my draft"});app.render();
  pending.resolve(model.expenseFromRow(row("source",{note:"Source expense"})));await app.flush();
  assert.ok(app.dialog());app.button("expensesPanel.keepEditing").props.onClick();app.render();
  assert.equal(app.editor().draft.description,"Keep my draft");app.unmount();
});

test("source service filters by owner and refuses another account or missing record",async()=>{
  const back=backend([row("source"),row("foreign",{user_id:"u2"})]);assert.equal((await back.service.getExpenseById("source","u1")).id,"source");
  await assert.rejects(back.service.getExpenseById("foreign","u1"),error=>error.code==="EXPENSE_NOT_FOUND");
  await assert.rejects(back.service.getExpenseById("source","u2"),error=>error.code==="EXPENSE_AUTH_REQUIRED");
});

test("money/date rules use exact cents, enforce MYR, validate leap days and preserve local calendar dates", () => {
  assert.equal(model.parseExpenseAmount("0.10") + model.parseExpenseAmount("0.20"),30);
  assert.equal(model.formatExpenseRM(model.parseExpenseAmount("999999999999.99")),"RM 999,999,999,999.99");
  for(const value of ["0","-1","1.001","1e2","1,000","NaN","1000000000000",".50"])assert.throws(()=>model.parseExpenseAmount(value));
  assert.equal(model.validExpenseDate("2024-02-29"),true);assert.equal(model.validExpenseDate("2026-02-29"),false);
  assert.equal(model.validExpenseDate("1900-02-29"),false);assert.equal(model.validExpenseDate("2000-02-29"),true);
  assert.equal(model.expenseToday({getFullYear:()=>2026,getMonth:()=>10,getDate:()=>6}),"2026-11-06");
  const draft={description:" 午餐 ",amount:"12.5",date:"2026-11-06",category:"Food",currency:"MYR",user_id:"bad",created_at:"bad"};
  assert.deepEqual(plain(model.expensePayload(draft)),{note:"午餐",amount:"12.50",currency:"MYR",category:"Food",expense_date:"2026-11-06",payment_method:null,expense_time:null});
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

test("payment/time round-trip canonically, validate inputs and participate in dirty/error state",()=>{
  const stored=model.expenseFromRow(row("e1",{payment_method:"e_wallet",expense_time:"00:00:00.000000"}));
  assert.equal(stored.time,"00:00"); assert.equal(stored.paymentMethod,"e_wallet");
  const payload=model.expensePayload(stored); assert.equal(payload.expense_time,"00:00:00"); assert.equal(payload.payment_method,"e_wallet");
  assert.equal(model.expenseIsDirty({...stored,time:"23:59"},stored),true);
  assert.equal(model.expenseIsDirty({...stored,paymentMethod:"cash"},stored),true);
  assert.equal(model.expenseCurrentTime({getHours:()=>0,getMinutes:()=>5}),"00:05");
  for(const time of ["24:00","2:30","12:60","12:30:01","12:30Z"])assert.throws(()=>model.expensePayload({...stored,time}),error=>error.code==="EXPENSE_TIME_INVALID");
  assert.throws(()=>model.expensePayload({...stored,paymentMethod:"crypto"}),error=>error.code==="EXPENSE_PAYMENT_METHOD_INVALID");
  assert.throws(()=>model.expenseFromRow(row("bad",{expense_time:"24:00:00"})),error=>error.code==="EXPENSE_DATA_INVALID");
  assert.equal(model.expenseErrorKey({code:"EXPENSE_TIME_INVALID"}),"expensesPanel.timeInvalid");
});
test("new details persist through create, reload, metadata-only edit and clearing",async()=>{
  const back=backend(),app=page(back);app.render();await app.flush();app.button("expensesPanel.add").props.onClick();app.render();
  assert.equal(app.editor().draft.time,"");assert.equal(app.editor().draft.paymentMethod,"");
  app.editor().onChange({description:"Supper",amount:"8.40",date:"2026-01-01",time:"23:59",paymentMethod:"debit_card"});app.render();
  app.editor().onSave(submit);await app.flush();await app.flush();
  assert.match(app.text(),/23:59/);assert.match(app.text(),/expensesPanel.paymentMethods.debit_card/);
  const fresh=page(back);fresh.render();await fresh.flush();fresh.button("edit").props.onClick();fresh.render();
  assert.equal(fresh.editor().draft.time,"23:59");assert.equal(fresh.editor().draft.paymentMethod,"debit_card");
  fresh.editor().onChange({time:"00:00",paymentMethod:"credit_card"});fresh.render();fresh.editor().onClose();fresh.render();
  assert.equal(fresh.dialog().title,"expensesPanel.discardTitle");fresh.button("expensesPanel.keepEditing").props.onClick();fresh.render();
  fresh.editor().onSave(submit);await fresh.flush();await fresh.flush();fresh.button("edit").props.onClick();fresh.render();
  assert.equal(fresh.editor().draft.time,"00:00");
  fresh.editor().onChange({time:"",paymentMethod:""});fresh.render();fresh.editor().onSave(submit);await fresh.flush();await fresh.flush();
  const saved=[...back.rows.values()][0];assert.equal(saved.expense_time,null);assert.equal(saved.payment_method,null);assert.equal(saved.expense_date,"2026-01-01");
});
test("lost response retry compares payment/time as well as amount without overwriting the stored record",async()=>{
  const back=backend();back.loseInsert();
  const draft={id:"retry-payment",description:"Dinner",amount:"25",date:"2026-11-07",category:"Food",currency:"MYR",time:"12:30",paymentMethod:"cash"};
  await assert.rejects(back.service.createExpense(draft,"u1"),/Response lost/);
  assert.equal((await back.service.createExpense(draft,"u1")).time,"12:30");
  for(const update of [{time:"12:31"},{paymentMethod:"e_wallet"}])await assert.rejects(back.service.createExpense({...draft,...update},"u1"),error=>error.code==="EXPENSE_CONFLICT");
  assert.equal(back.rows.size,1);assert.equal(back.rows.get(draft.id).payment_method,"cash");
});
test("failed metadata edits keep the selected method/time for retry and preserve the saved version",async()=>{
  const back=backend([row()]);let fail=true;
  const app=page(back,{updateExpense:async(...args)=>{if(fail)throw Error("Offline");return back.service.updateExpense(...args);}});
  app.render();await app.flush();app.button("edit").props.onClick();app.render();
  app.editor().onChange({time:"09:45",paymentMethod:"bank_transfer"});app.render();app.editor().onSave(submit);await app.flush();
  assert.equal(app.editor().draft.time,"09:45");assert.equal(app.editor().draft.paymentMethod,"bank_transfer");assert.equal(back.rows.get("e1").expense_time,null);
  fail=false;app.editor().onSave(submit);await app.flush();await app.flush();assert.equal(back.rows.get("e1").expense_time,"09:45:00");
});

test("filters reset pagination, stay active after edits and distinguish no results from an empty account",async()=>{
  const back=backend(Array.from({length:30},(_,n)=>row("e"+String(n).padStart(2,"0"),{category:n<27?"Food":"Bills"})));
  const app=page(back);app.render();await app.flush();app.button("expensesPanel.next").props.onClick();app.render();await app.flush();
  app.filters().onChange({category:"Bills",sort:"amount_asc"});app.render();await app.flush();
  assert.equal(back.calls.at(-1).bounds[0],0);assert.equal(app.filters().filters.category,"Bills");
  assert.ok(back.calls.at(-1).filters.some(pair=>pair[0]==="category"&&pair[1]==="Bills"));
  app.button("edit").props.onClick();app.render();app.editor().onChange({category:"Food"});app.render();app.editor().onSave(submit);await app.flush();await app.flush();
  assert.equal(app.filters().filters.category,"Bills");assert.equal(back.calls.at(-1).bounds[0],0);
  app.filters().onChange({paymentMethod:"cash"});app.render();await app.flush();assert.match(app.text(),/filters.noResults/);
  app.filters().onReset();app.render();await app.flush();assert.equal(app.filters().filters.category,"");assert.equal(app.filters().filters.sort,"date_desc");
  app.unmount();
});

test("search debounces 300ms, cancels old timers and reset cannot be overwritten by a pending search",async()=>{
  const timers=new Map();let serial=0;const clock={setTimeout(fn,delay){assert.equal(delay,300);timers.set(++serial,fn);return serial;},clearTimeout(id){timers.delete(id);}};
  const back=backend([row()]),app=page(back,{},clock);app.render();await app.flush();const initial=back.calls.length;
  app.filters().onChange({search:"Lu"});app.render();assert.equal(back.calls.length,initial);assert.equal(timers.size,1);
  app.filters().onChange({search:"Lunch"});app.render();assert.equal(timers.size,1);
  const trigger=[...timers.values()][0];timers.clear();trigger();app.render();await app.flush();
  assert.equal(back.calls.length,initial+1);assert.match(app.text(),/Lunch/);
  assert.deepEqual(back.calls.at(-1).predicates.find(item=>item[1]==="imatch"),["note","imatch","Lunch"]);
  app.filters().onChange({search:"Other"});app.render();app.filters().onReset();app.render();await app.flush();
  assert.equal(timers.size,0);assert.equal(app.filters().filters.search,"");assert.match(app.text(),/Lunch/);app.unmount();
});

test("invalid bounds do not query and correcting them recovers without losing the controls",async()=>{
  const back=backend([row()]),app=page(back);app.render();await app.flush();const initial=back.calls.length;
  app.filters().onChange({minAmount:"20",maxAmount:"10"});app.render();await app.flush();
  assert.equal(app.filters().error,"expensesPanel.filters.amountRangeInvalid");assert.equal(back.calls.length,initial);
  app.filters().onChange({minAmount:"0",maxAmount:"15"});app.render();await app.flush();assert.match(app.text(),/Lunch/);
  app.filters().onChange({datePreset:"custom",dateFrom:"2026-12-01",dateTo:"2026-01-01"});app.render();
  assert.equal(app.filters().error,"expensesPanel.filters.dateRangeInvalid");assert.equal(app.filters().filters.dateFrom,"2026-12-01");app.unmount();
});

test("late filter results never replace a newer query and account switches reset private search criteria",async()=>{
  const back=backend(),old=defer();let calls=0;
  const app=page(back,{getExpenses:async()=>++calls===2?old.promise:{items:[],hasMore:false}});
  app.render();await app.flush();app.filters().onChange({category:"Food"});app.render();
  app.filters().onChange({category:"Bills"});app.render();await app.flush();
  old.resolve({items:[model.expenseFromRow(row("private"))],hasMore:false});await app.flush();
  assert.doesNotMatch(app.text(),/Lunch/);assert.match(app.text(),/filters.noResults/);assert.equal(app.filters().filters.category,"Bills");
  app.setUser({id:"u2"});await app.flush();assert.equal(app.filters().filters.category,"");assert.equal(app.filters().filters.sort,"date_desc");app.unmount();
});

test("deleting the final filtered-page record returns one page with the same criteria and read retries preserve them",async()=>{
  const back=backend(Array.from({length:46},(_,n)=>row("e"+String(n).padStart(2,"0"),{category:n<26?"Food":"Bills"}))),app=page(back);
  app.render();await app.flush();app.filters().onChange({category:"Food",sort:"amount_desc"});app.render();await app.flush();
  app.button("expensesPanel.next").props.onClick();app.render();await app.flush();
  app.button("delete").props.onClick();app.render();app.button("expensesPanel.confirmDelete").props.onClick();await app.flush();await app.flush();await app.flush();
  assert.equal(back.calls.at(-1).bounds[0],0);assert.equal(app.filters().filters.category,"Food");assert.equal(app.filters().filters.sort,"amount_desc");
  back.failRead();app.filters().onChange({paymentMethod:"unrecorded"});app.render();await app.flush();assert.match(app.text(),/expensesPanel.loadError/);
  app.button("expensesPanel.retry").props.onClick();app.render();await app.flush();
  assert.ok(back.calls.at(-1).filters.some(pair=>pair[0]==="category"&&pair[1]==="Food"));
  assert.ok(back.calls.at(-1).predicates.some(pair=>pair[0]==="payment_method"&&pair[1]==="is"));
  assert.match(app.text(),/Lunch/);app.unmount();
});

test("statistics cover the shared scope, not the current page; pagination/sort preserve aggregate requests",async()=>{
  const back=backend(Array.from({length:30},(_,n)=>row("e"+String(n).padStart(2,"0")))),statsCalls=[];
  const app=page(back,{getExpenseStatistics:async(...args)=>{statsCalls.push(args);return{count:"30",totalCents:"37500",averageCents:"1250",trend:[]};}});
  app.render();await app.flush();assert.equal(app.statistics().data.count,"30");assert.equal(statsCalls.length,1);
  app.button("expensesPanel.next").props.onClick();app.render();await app.flush();assert.equal(statsCalls.length,1);
  app.filters().onChange({sort:"amount_asc"});app.render();await app.flush();assert.equal(statsCalls.length,1);
  app.filters().onChange({category:"Food",paymentMethod:"unrecorded",datePreset:"custom",dateFrom:"2026-11-01",minAmount:"0"});app.render();await app.flush();
  assert.equal(statsCalls.length,2);assert.equal(statsCalls.at(-1)[1].category,"Food");assert.equal(statsCalls.at(-1)[1].paymentMethod,"unrecorded");assert.equal(statsCalls.at(-1)[1].minAmount,"0.00");
  assert.equal(statsCalls.at(-1)[1].dateFrom,"2026-11-01");app.unmount();
});

test("committed changes reload overview; aggregate failures/retries never turn a saved write into failure",async()=>{
  const back=backend([row()]);let reads=0;
  const app=page(back,{getExpenseStatistics:async()=>{reads++;if(reads===2)throw Error("Statistics offline");return{count:String(back.rows.size),totalCents:"1",averageCents:"1",trend:[]};}});
  app.render();await app.flush();app.button("edit").props.onClick();app.render();app.editor().onChange({amount:"3"});app.render();app.editor().onSave(submit);await app.flush();await app.flush();
  assert.match(app.text(),/expensesPanel.saved/);assert.equal(app.statistics().error,"expensesPanel.statistics.loadError");assert.match(app.text(),/RM 3.00/);
  app.statistics().onRetry();app.render();await app.flush();assert.equal(app.statistics().data.count,"1");assert.equal(back.calls.filter(call=>call.action==="update").length,1);
  app.button("delete").props.onClick();app.render();app.button("expensesPanel.confirmDelete").props.onClick();await app.flush();await app.flush();assert.equal(app.statistics().data.count,"0");app.unmount();
});

test("late statistics responses cannot replace a new scope or leak across accounts, and trend requests cancel stale results",async()=>{
  const back=backend(),old=defer(),other=defer();let count=0;
  const app=page(back,{getExpenseStatistics:async()=>{count++;return count===1?old.promise:count===3?other.promise:{count:"2",totalCents:"2",averageCents:"1",trend:[]};}});
  app.render();app.filters().onChange({category:"Bills"});app.render();await app.flush();assert.equal(app.statistics().data.count,"2");
  old.resolve({count:"999"});await app.flush();assert.equal(app.statistics().data.count,"2");
  app.statistics().onGranularityChange("month");app.render();assert.equal(app.statistics().loading,true);
  app.setUser({id:"u2"});await app.flush();other.resolve({count:"999"});await app.flush();assert.equal(app.statistics().data.count,"2");assert.equal(app.statistics().granularity,"auto");app.unmount();
});

test("expenses can save without receipts or open the optional receipt window after a successful save",async()=>{
  const back=backend(),app=page(back);app.render();await app.flush();app.button("expensesPanel.add").props.onClick();app.render();app.editor().onChange({description:"No receipt",amount:"5"});app.render();app.editor().onSave(submit);await app.flush();await app.flush();assert.equal(app.receipts(),undefined);
  app.button("expensesPanel.receipts.open").props.onClick();app.render();assert.equal(app.receipts().record.description,"No receipt");app.receipts().onClose();app.render();
  app.button("expensesPanel.add").props.onClick();app.render();app.editor().onChange({description:"With receipt",amount:"8"});app.render();
  app.editor().onSave({...submit,nativeEvent:{submitter:{value:"receipts"}}});await app.flush();await app.flush();assert.equal(app.receipts().record.description,"With receipt");assert.equal(back.rows.size,2);
  app.receipts().onBusyChange(true);app.render();app.receipts().onClose();app.render();assert.ok(app.receipts());app.setUser({id:"u2"});await app.flush();assert.equal(app.receipts(),undefined);app.setUser(null);await app.flush();assert.equal(app.receipts(),undefined);app.unmount();
});
