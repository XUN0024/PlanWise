const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),{PGlite}=require("@electric-sql/pglite");
const db=new PGlite(),A="00000000-0000-4000-8000-000000000001",B="00000000-0000-4000-8000-000000000002",E="10000000-0000-4000-8000-000000000001",F="10000000-0000-4000-8000-000000000002";
const read=name=>fs.readFileSync(path.join(__dirname,"../database/migrations",name),"utf8");
async function asUser(user,sql,args=[],role="authenticated"){
  await db.exec(`BEGIN; SET LOCAL ROLE ${role};`);
  try{await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user||""]);const result=await db.query(sql,args);await db.exec("COMMIT;");return result.rows;}
  catch(error){await db.exec("ROLLBACK;");throw error;}
}
const reserve=(user=A,parent=E,size=12)=>asUser(user,"INSERT INTO expense_attachments(expense_id,user_id,original_name,object_name,mime_type,size_bytes) VALUES($1,$2,'Receipt.pdf','file','application/pdf',$3) RETURNING *",[parent,user,size]);
const put=(row,user=A,size=row.size_bytes)=>asUser(user,"INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('expense-receipts',$1,jsonb_build_object('size',$2::bigint,'mimetype','application/pdf')) RETURNING id",[row.storage_path,size]);
test.before(async()=>{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE SCHEMA storage;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);INSERT INTO auth.users VALUES('${A}'),('${B}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    GRANT USAGE ON SCHEMA public,auth,storage TO anon,authenticated;
    CREATE TABLE expenses(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id),amount numeric,note text,category text,expense_date date,created_at timestamptz DEFAULT now());
    INSERT INTO expenses VALUES('${E}','${A}',10,'Mine','Food','2026-11-01',now()),('${F}','${B}',20,'Other','Other','2026-11-01',now());
    CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text,metadata jsonb,UNIQUE(bucket_id,name));
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO anon,authenticated;
    CREATE POLICY legacy_broad ON storage.objects FOR ALL TO anon,authenticated USING(true) WITH CHECK(true);`);
  await db.exec(read("20261106_expenses_crud.sql"));await db.exec(read("20261107_expense_receipts.sql"));
});
test.after(()=>db.close());
test("receipt migration is rerunnable, configures private 15MB bucket and cannot edit expense values",async()=>{
  const before=(await db.query("SELECT * FROM expenses ORDER BY id")).rows;await db.exec(read("20261107_expense_receipts.sql"));assert.deepEqual((await db.query("SELECT * FROM expenses ORDER BY id")).rows,before);
  const checks=await db.exec(read("20261107_expense_receipts_verify.sql"));assert.equal(checks[0].rows[0].public,false);assert.equal(Number(checks[0].rows[0].file_size_limit),15*1024*1024);
  assert.deepEqual(Object.values(checks[3].rows[0]),[false,false,true,true]);
});
test("metadata ownership/foreign key, status and 15MB limits are enforced for direct API calls",async()=>{
  await assert.rejects(reserve(A,F),/row-level security/);await assert.rejects(reserve(A,E,15728641),/check constraint/);
  const [row]=await reserve();assert.equal(row.storage_path,`${A}/${E}/${row.id}/file`);
  await assert.rejects(asUser(A,"UPDATE expense_attachments SET status='ready' WHERE id=$1",[row.id]),/permission denied/);
  await assert.rejects(asUser(A,"INSERT INTO expense_attachments(expense_id,user_id,original_name,size_bytes,status) VALUES($1,$2,'Fake',1,'ready')",[E,A]),/permission denied/);
  assert.equal((await asUser(B,"SELECT * FROM expense_attachments WHERE id=$1",[row.id])).length,0);
  assert.equal((await asUser(B,"DELETE FROM expense_attachments WHERE id=$1 RETURNING id",[row.id])).length,0);
  await assert.rejects(asUser(A,"DELETE FROM expenses WHERE id=$1",[E]),/foreign key/);
});
test("restrictive Storage fences defeat broad policies and leave unrelated buckets unchanged",async()=>{
  const [row]=await reserve();await put(row);
  assert.equal((await asUser(B,"SELECT id FROM storage.objects WHERE name=$1",[row.storage_path])).length,0);
  assert.equal((await asUser(null,"SELECT id FROM storage.objects WHERE name=$1",[row.storage_path],"anon")).length,0);
  await assert.rejects(put(row,B),/row-level security/);
  await assert.rejects(asUser(A,"INSERT INTO storage.objects(bucket_id,name) VALUES('expense-receipts','unregistered')"),/row-level security/);
  assert.equal((await asUser(A,"UPDATE storage.objects SET metadata='{}' WHERE name=$1 RETURNING id",[row.storage_path])).length,0);
  await asUser(A,"INSERT INTO storage.objects(bucket_id,name) VALUES('note-attachments','unrelated-test')");
  assert.equal((await asUser(A,"SELECT id FROM storage.objects WHERE bucket_id='note-attachments'")).length,1);
});
test("finalization requires the real object and matching size; retries keep the same row",async()=>{
  const [row]=await reserve();await assert.rejects(asUser(A,"SELECT public.complete_expense_attachment($1)",[row.id]),/not finished uploading/);
  await put(row,A,11);await assert.rejects(asUser(A,"SELECT public.complete_expense_attachment($1)",[row.id]),/does not match/);
  await db.query("UPDATE storage.objects SET metadata=jsonb_build_object('size',12,'mimetype','application/pdf') WHERE name=$1",[row.storage_path]);
  await assert.rejects(asUser(B,"SELECT public.complete_expense_attachment($1)",[row.id]),/unavailable/);
  await asUser(A,"SELECT public.complete_expense_attachment($1)",[row.id]);await asUser(A,"SELECT public.complete_expense_attachment($1)",[row.id]);
  assert.equal((await asUser(A,"SELECT status FROM expense_attachments WHERE id=$1",[row.id]))[0].status,"ready");
  await assert.rejects(put({...row,id:"another"}),/row-level security/);
});
test("files must be removed before metadata and parent; interrupted cleanup leaves data recoverable",async()=>{
  const [row]=await reserve(B,F);await put(row,B);await asUser(B,"SELECT public.complete_expense_attachment($1)",[row.id]);
  await assert.rejects(asUser(B,"DELETE FROM expense_attachments WHERE id=$1",[row.id]),/Storage API/);
  await assert.rejects(asUser(B,"DELETE FROM expenses WHERE id=$1",[F]),/foreign key/);
  await asUser(B,"DELETE FROM storage.objects WHERE name=$1",[row.storage_path]);await asUser(B,"DELETE FROM expense_attachments WHERE id=$1",[row.id]);await asUser(B,"DELETE FROM expenses WHERE id=$1",[F]);
  assert.equal((await db.query("SELECT id FROM expenses WHERE id=$1",[F])).rows.length,0);
});
