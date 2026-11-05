const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { PGlite } = require("@electric-sql/pglite");
const db = new PGlite();
const userA = "00000000-0000-4000-8000-000000000001";
const userB = "00000000-0000-4000-8000-000000000002";
const noteA = "10000000-0000-4000-8000-000000000001";
const noteB = "10000000-0000-4000-8000-000000000002";
const migration = fs.readFileSync(path.join(__dirname, "../database/migrations/20261105_note_tags.sql"), "utf8");
async function asUser(user, sql, args = []) {
  await db.exec("BEGIN; SET LOCAL ROLE authenticated;");
  try {
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [user]);
    const result = await db.query(sql, args);
    await db.exec("COMMIT;");
    return result.rows;
  } catch (error) { await db.exec("ROLLBACK;"); throw error; }
}
const state = async (user = userA) => (await asUser(user, "SELECT public.get_note_tag_state() AS state"))[0].state;
async function change(user, action, { noteId = null, tagId = null, name = null, color = null, version = null } = {}) {
  return (await asUser(user, "SELECT public.change_note_tag($1,$2,$3,$4,$5,$6) AS state", [action, noteId, tagId, name, color, version]))[0].state;
}
test.before(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
    CREATE TABLE public.notes(id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id),
      title text, content text, tags text[], updated_at timestamptz NOT NULL DEFAULT now());
    ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
    CREATE POLICY notes_own ON public.notes TO authenticated USING (user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
    GRANT SELECT,INSERT,UPDATE,DELETE ON public.notes TO authenticated;
    INSERT INTO auth.users VALUES ('${userA}'),('${userB}');
    INSERT INTO public.notes(id,user_id,title,content,tags) VALUES
      ('${noteA}','${userA}','A','Body',ARRAY[' Work ','work','中文',NULL,'']),
      ('${noteB}','${userB}','B','Private',ARRAY['work']);
  `);
  await db.exec(migration);
  const checks = await db.exec(fs.readFileSync(path.join(__dirname, "../database/migrations/20261105_note_tags_verify.sql"), "utf8"));
  assert.deepEqual(Object.values(checks[1].rows[0]), [false, false, false, true, true]);
});
test.after(() => db.close());

test("legacy migration merges names per owner, preserves associations and reruns without resurrecting deletions", async () => {
  let a = await state(); const b = await state(userB);
  assert.equal(a.tags.length, 2); assert.equal(a.links.length, 2);
  assert.equal(b.tags.length, 1); assert.equal(b.links.length, 1);
  assert.notEqual(a.tags.find((tag) => tag.normalized_name === "work").id, b.tags[0].id);
  const old = a.tags.find((tag) => tag.normalized_name === "work");
  await change(userA, "delete", { tagId: old.id, version: old.updated_at });
  await db.exec(migration);
  a = await state();
  assert.equal(a.tags.some((tag) => tag.normalized_name === "work"), false);
  assert.equal((await db.query("SELECT tags FROM public.notes WHERE id=$1", [noteA])).rows[0].tags[0], " Work ");
});

test("RLS and composite foreign keys reject direct and RPC cross-account associations", async () => {
  const foreign = (await state(userB)).tags[0];
  await assert.rejects(change(userA, "attach", { noteId: noteA, tagId: foreign.id }), /TAG_NOT_FOUND/);
  await assert.rejects(change(userA, "attach", { noteId: noteB, tagId: foreign.id }), /TAG_NOTE_NOT_FOUND/);
  await assert.rejects(asUser(userA, "INSERT INTO public.note_tags(user_id,note_id,tag_id) VALUES($1,$2,$3)", [userA,noteA,foreign.id]), /foreign key/);
  await assert.rejects(asUser(userA, "INSERT INTO public.note_tags(user_id,note_id,tag_id) VALUES($1,$2,$3)", [userB,noteB,foreign.id]), /row-level security/);
  assert.equal((await asUser(userA, "SELECT * FROM public.tags WHERE id=$1", [foreign.id])).length, 0);
  assert.equal((await asUser(userA, "DELETE FROM public.tags WHERE id=$1 RETURNING id", [foreign.id])).length, 0);
});

test("create+attach is atomic and retryable, individual removal preserves other labels and note body/version", async () => {
  const before = (await db.query("SELECT * FROM public.notes WHERE id=$1", [noteA])).rows[0];
  let a = await change(userA, "create_attach", { noteId: noteA, name: " Project ", color: "#EF4444" });
  const tag = a.tags.find((tag) => tag.name === "Project");
  a = await change(userA, "create_attach", { noteId: noteA, name: "project" });
  assert.equal(a.tags.filter((tag) => tag.normalized_name === "project").length, 1);
  assert.equal(a.links.filter((link) => link.tag_id === tag.id).length, 1);
  const after = (await db.query("SELECT * FROM public.notes WHERE id=$1", [noteA])).rows[0];
  assert.deepEqual(after, before);
  a = await change(userA, "detach", { noteId: noteA, tagId: tag.id });
  assert.equal(a.links.some((link) => link.tag_id === tag.id), false);
  assert.equal(a.tags.some((item) => item.id === tag.id), true);
  assert.ok(a.links.length > 0);
  await assert.rejects(change(userA, "create_attach", { noteId: noteB, name: "Should rollback" }), /TAG_NOTE_NOT_FOUND/);
  assert.equal((await state()).tags.some((tag) => tag.name === "Should rollback"), false);
});

test("rename/color changes use saved versions and enforce unique names; deletion cascades only associations", async () => {
  let a = await change(userA, "create_attach", { noteId: noteA, name: "Rename me" });
  const tag = a.tags.find((tag) => tag.name === "Rename me");
  a = await change(userA, "update", { tagId: tag.id, name: "Renamed", color: "#10B981", version: tag.updated_at });
  const renamed = a.tags.find((item) => item.id === tag.id);
  assert.equal(renamed.color, "#10B981"); assert.notEqual(renamed.updated_at, tag.updated_at);
  await assert.rejects(change(userA, "update", { tagId: tag.id, name: "Stale", version: tag.updated_at }), /TAG_CONFLICT/);
  await assert.rejects(change(userA, "update", { tagId: tag.id, name: "中文", version: renamed.updated_at }), /unique constraint/);
  a = await change(userA, "delete", { tagId: tag.id, version: renamed.updated_at });
  assert.equal(a.links.some((link) => link.tag_id === tag.id), false);
  assert.equal((await db.query("SELECT id FROM public.notes WHERE id=$1", [noteA])).rows.length, 1);
});

test("invalid names/colors and anonymous access fail; deleting a note cleans its links but preserves its tags", async () => {
  await assert.rejects(change(userA, "create", { name: "   " }), /TAG_INVALID_NAME/);
  await assert.rejects(change(userA, "create", { name: "x".repeat(101) }), /TAG_INVALID_NAME/);
  await assert.rejects(change(userA, "create", { name: "bad color", color: "red" }), /TAG_INVALID_COLOR/);
  await db.exec("BEGIN; SET LOCAL ROLE anon;");
  await assert.rejects(db.query("SELECT public.get_note_tag_state()"), /permission denied/);
  await db.exec("ROLLBACK;");
  const b = await state(userB);
  await asUser(userB, "DELETE FROM public.notes WHERE id=$1", [noteB]);
  const after = await state(userB);
  assert.equal(after.links.length, 0); assert.equal(after.tags.length, b.tags.length);
});

test("SQL trims the same whitespace as the UI and refuses oversized legacy data without truncating it", async () => {
  const a = await change(userA, "create", { name: "\t\u3000Trimmed\u00a0\n" });
  assert.equal(a.tags.some((tag) => tag.name === "Trimmed"), true);
  await assert.rejects(change(userA, "create", { name: "\t\u3000\n" }), /TAG_INVALID_NAME/);
  const long = "文".repeat(101);
  await db.query("UPDATE public.notes SET tags=$1 WHERE id=$2", [[long], noteA]);
  await db.query("DELETE FROM public.note_tag_migrations WHERE version='legacy_tags_v1'");
  const before = await state();
  await assert.rejects(db.exec(migration), /Legacy tag exceeds 100/);
  await db.exec("ROLLBACK;");
  assert.deepEqual(await state(), before);
  assert.equal((await db.query("SELECT tags FROM public.notes WHERE id=$1", [noteA])).rows[0].tags[0], long);
});
