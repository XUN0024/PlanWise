const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const { PGlite } = require("@electric-sql/pglite");
const db = new PGlite();
const A = "00000000-0000-4000-8000-000000000001", B = "00000000-0000-4000-8000-000000000002";
const first = "10000000-0000-4000-8000-000000000001";
const read = (name) => fs.readFileSync(path.join(__dirname, "../database/migrations/" + name), "utf8");
const migration = read("20261106_expenses_crud.sql");
async function asUser(user, sql, args = []) {
  await db.exec("BEGIN; SET LOCAL ROLE authenticated;");
  try {
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [user]);
    const result = await db.query(sql, args); await db.exec("COMMIT;"); return result.rows;
  } catch (error) { await db.exec("ROLLBACK;"); throw error; }
}
const insert = (user, amount = "12.50", options = {}) => asUser(user,
  "INSERT INTO expenses(user_id,amount,note,category,expense_date,currency) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
  [options.owner || user, amount, options.note ?? "Lunch", options.category ?? "Food", options.date ?? "2026-11-06", options.currency ?? "MYR"]);
test.before(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA public,auth TO anon,authenticated;
    CREATE TABLE public.expenses(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id),
      amount numeric NOT NULL,category text,note text,expense_date date DEFAULT current_date,created_at timestamptz NOT NULL DEFAULT now());
    INSERT INTO auth.users VALUES('${A}'),('${B}');
    INSERT INTO expenses(id,user_id,amount,category,note,expense_date) VALUES('${first}','${A}',12.50,'Food','Old lunch','2026-01-01');`);
  await db.exec(migration);
});
test.after(() => db.close());

test("migration preserves valid amounts and creation dates, initializes MYR/version and is rerunnable", async () => {
  const before = (await db.query("SELECT * FROM expenses WHERE id=$1", [first])).rows[0];
  assert.equal(String(before.amount), "12.50"); assert.equal(before.currency, "MYR"); assert.ok(before.updated_at);
  await db.exec(migration);
  assert.deepEqual((await db.query("SELECT * FROM expenses WHERE id=$1", [first])).rows[0], before);
  const checks = await db.exec(read("20261106_expenses_verify.sql"));
  assert.equal(checks[0].rows[0].expenses_rls_enabled, true);
  assert.deepEqual(Object.values(checks[3].rows[0]), [false,true,true,false,false]);
});
test("database enforces exact positive cents, MYR, category, description and real calendar date", async () => {
  const [row] = await insert(A, "0.29", { note: "\t 午餐 \u3000" });
  assert.equal(row.note, "午餐"); assert.equal(String(row.amount), "0.29");
  await insert(A, "999999999999.99");
  for (const amount of ["0", "-1", "1.005", "1000000000000", "NaN", "Infinity"]) await assert.rejects(insert(A, amount), /check constraint/);
  await assert.rejects(insert(A, "1.00", { currency: "USD" }), /check constraint/);
  await assert.rejects(insert(A, "1.00", { category: "Unknown" }), /check constraint/);
  await assert.rejects(insert(A, "1.00", { note: "\t\u3000" }), /check constraint/);
  await assert.rejects(insert(A, "1.00", { date: "2026-02-30" }), /out of range/);
  await insert(A, "1.00", { date: "2024-02-29" });
});
test("RLS isolates all CRUD, even with another permissive policy; owner/version columns cannot be forged", async () => {
  const [other] = await insert(B);
  await db.exec("CREATE POLICY overly_permissive_test ON expenses FOR ALL TO authenticated USING(true) WITH CHECK(true)");
  assert.equal((await asUser(A, "SELECT id FROM expenses WHERE id=$1", [other.id])).length, 0);
  assert.equal((await asUser(A, "UPDATE expenses SET note='stolen' WHERE id=$1 RETURNING id", [other.id])).length, 0);
  assert.equal((await asUser(A, "DELETE FROM expenses WHERE id=$1 RETURNING id", [other.id])).length, 0);
  await assert.rejects(insert(A, "1", { owner: B }), /row-level security/);
  await assert.rejects(asUser(A, "UPDATE expenses SET user_id=$1 WHERE id=$2", [B,first]), /permission denied/);
  await assert.rejects(asUser(A, "UPDATE expenses SET updated_at=now() WHERE id=$1", [first]), /permission denied/);
  await db.exec("DROP POLICY overly_permissive_test ON expenses; BEGIN; SET LOCAL ROLE anon;");
  await assert.rejects(db.query("SELECT * FROM expenses"), /permission denied/); await db.exec("ROLLBACK;");
});
test("updates advance versions and stale update/delete predicates leave the row untouched", async () => {
  const [before] = await insert(A);
  const [after] = await asUser(A, "UPDATE expenses SET amount='25.30',note='Edited' WHERE id=$1 AND updated_at=$2 RETURNING *", [before.id,before.updated_at]);
  assert.notEqual(after.updated_at, before.updated_at);
  assert.equal((await asUser(A, "UPDATE expenses SET amount='99' WHERE id=$1 AND updated_at=$2 RETURNING id", [before.id,before.updated_at])).length, 0);
  assert.equal((await asUser(A, "DELETE FROM expenses WHERE id=$1 AND updated_at=$2 RETURNING id", [before.id,before.updated_at])).length, 0);
  assert.equal((await asUser(A, "DELETE FROM expenses WHERE id=$1 AND updated_at=$2 RETURNING id", [after.id,after.updated_at])).length, 1);
});
test("legacy review reports invalid values and failed migration rolls back without rounding or abs conversion", async () => {
  await db.exec("ALTER TABLE expenses DROP CONSTRAINT expenses_amount_positive; ALTER TABLE expenses DROP CONSTRAINT expenses_amount_scale;");
  await db.query("UPDATE expenses SET amount=-1.005 WHERE id=$1", [first]);
  const review = await db.query(read("20261106_expenses_preflight.sql"));
  assert.match(review.rows.find((row) => row.id === first).review_reason, /decimal places/);
  await assert.rejects(db.exec(migration), /EXPENSE_LEGACY_REVIEW_REQUIRED/); await db.exec("ROLLBACK;");
  assert.equal(String((await db.query("SELECT amount FROM expenses WHERE id=$1", [first])).rows[0].amount), "-1.005");
});
