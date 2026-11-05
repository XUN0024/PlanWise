-- Read-only verification after 20261105_note_tags.sql.
SELECT relname AS table_name, relrowsecurity AS rls_enabled
FROM pg_class WHERE oid IN ('public.tags'::regclass, 'public.note_tags'::regclass, 'public.note_tag_migrations'::regclass);

SELECT
  has_table_privilege('anon','public.tags','SELECT') AS anon_can_read_tags,
  has_table_privilege('anon','public.note_tags','SELECT') AS anon_can_read_links,
  has_table_privilege('authenticated','public.note_tag_migrations','SELECT') AS client_can_read_migration_marker,
  has_function_privilege('authenticated','public.get_note_tag_state()','EXECUTE') AS client_can_read_state,
  has_function_privilege('authenticated','public.change_note_tag(text,uuid,uuid,text,text,timestamptz)','EXECUTE') AS client_can_change_tags;
-- Expected: false / false / false / true / true.

SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint
WHERE conrelid = 'public.note_tags'::regclass ORDER BY conname;
-- Both ownership composite foreign keys should have ON DELETE CASCADE.

SELECT version, applied_at FROM public.note_tag_migrations;
SELECT (SELECT count(*) FROM public.tags) AS tags_count,
       (SELECT count(*) FROM public.note_tags) AS links_count;
SELECT user_id, normalized_name, count(*) FROM public.tags
GROUP BY user_id, normalized_name HAVING count(*) > 1;
-- Last query must be empty. SQL Editor normally bypasses RLS; test account
-- isolation using authenticated API sessions as described in NOTE_TAGS.md.
