const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), { PGlite } = require("@electric-sql/pglite");
const db = new PGlite();
const A = "00000000-0000-4000-8000-000000000001", B = "00000000-0000-4000-8000-000000000002";
const legacy = "10000000-0000-4000-8000-000000000001";
const read = (name) => fs.readFileSync(path.join(__dirname, "../database/migrations/" + name), "utf8");
const migration = read("20261107_expenses_payment_time.sql");
async function asUser(user, sql, args = []) {
  await db.exec("BEGIN; SET LOCAL ROLE authenticated;");
  try {
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [user]);
    const result = await db.query(sql, args); await db.exec("COMMIT;"); return result.rows;
  } catch (error) { await db.exec("ROLLBACK;"); throw error; }
}
const insert = (user, method = null, time = null) => asUser(user,
  "INSERT INTO expenses(user_id,amount,note,category,expense_date,payment_method,expense_time) VALUES($1,'12.50','Lunch','Food','2026-01-02',$2,$3) RETURNING *,expense_time::text AS clock",
  [user, method, time]);
test.before(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA public,auth TO anon,authenticated;
    CREATE TABLE expenses(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES auth.users(id),amount numeric NOT NULL,
      category text,note text,expense_date date DEFAULT current_date,created_at timestamptz NOT NULL DEFAULT now());
    INSERT INTO auth.users VALUES('${A}'),('${B}');`);
  await db.exec(read("20261106_expenses_crud.sql"));
  await db.query("INSERT INTO expenses(id,user_id,amount,note,category,expense_date) VALUES($1,$2,1,'Existing','Other','2026-01-01')", [legacy,A]);
  await db.exec(migration);
});
test.after(() => db.close());

test("additive migration leaves missing details NULL and is safe to repeat after real values exist", async () => {
  const old = (await db.query("SELECT * FROM expenses WHERE id=$1", [legacy])).rows[0];
  assert.equal(old.payment_method, null); assert.equal(old.expense_time, null);
  const [saved] = await insert(A,"e_wallet","23:59");
  await db.exec(migration);
  assert.deepEqual((await db.query("SELECT * FROM expenses WHERE id=$1", [legacy])).rows[0], old);
  assert.equal((await db.query("SELECT expense_time::text AS clock FROM expenses WHERE id=$1", [saved.id])).rows[0].clock,"23:59:00");
  const checks = await db.exec(read("20261107_expenses_payment_time_verify.sql"));
  assert.equal(checks[0].rows.every((row) => row.is_nullable === "YES" && row.column_default === null),true);
  assert.deepEqual(Object.values(checks[2].rows[0]),[false,true,true,true,true,false,false]);
});
test("all six payment methods and omitted details work; unknown/empty codes are rejected", async () => {
  for (const method of ["cash","debit_card","credit_card","bank_transfer","e_wallet","other"]) {
    const [saved] = await insert(A,method); assert.equal(saved.payment_method,method); assert.equal(saved.clock,null);
  }
  assert.equal((await insert(A))[0].payment_method,null);
  for (const method of ["Cash","crypto",""]) await assert.rejects(insert(A,method),/check constraint/);
});
test("time has minute precision, preserves local date, and distinguishes midnight from unrecorded", async () => {
  const [blank] = await insert(A,null,null), [midnight] = await insert(A,null,"00:00"), [late] = await insert(A,null,"23:59");
  assert.equal(blank.clock,null); assert.equal(midnight.clock,"00:00:00"); assert.equal(late.clock,"23:59:00");
  assert.equal(String(midnight.expense_date),String(late.expense_date));
  for (const time of ["24:00","12:30:01","12:30:00.001","25:00","09:60"]) await assert.rejects(insert(A,null,time));
});
test("metadata updates use existing version checks and remain isolated by owner", async () => {
  const [saved] = await insert(A,"cash","09:15");
  const [changed] = await asUser(A,"UPDATE expenses SET payment_method='credit_card',expense_time='00:00' WHERE id=$1 AND updated_at=$2 RETURNING *",[saved.id,saved.updated_at]);
  assert.notEqual(changed.updated_at,saved.updated_at);
  assert.equal((await asUser(A,"UPDATE expenses SET expense_time='10:00' WHERE id=$1 AND updated_at=$2 RETURNING id",[saved.id,saved.updated_at])).length,0);
  assert.equal((await asUser(B,"SELECT id FROM expenses WHERE id=$1",[saved.id])).length,0);
  assert.equal((await asUser(B,"UPDATE expenses SET payment_method='other' WHERE id=$1 RETURNING id",[saved.id])).length,0);
  await assert.rejects(asUser(B,"INSERT INTO expenses(user_id,amount,note,category,payment_method) VALUES($1,1,'Bad','Other','cash')",[A]),/row-level security/);
});
test("clearing optional fields stores NULL without changing amount, date or creation time", async () => {
  const [saved] = await insert(A,"bank_transfer","12:30");
  const [cleared] = await asUser(A,"UPDATE expenses SET payment_method=NULL,expense_time=NULL WHERE id=$1 RETURNING *",[saved.id]);
  assert.equal(cleared.payment_method,null); assert.equal(cleared.expense_time,null);
  for (const key of ["amount","expense_date","created_at"]) assert.deepEqual(cleared[key],saved[key]);
});
