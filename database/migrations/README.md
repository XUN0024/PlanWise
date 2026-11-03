# Task workflow migration

On the existing database initialized with `fresh_setup.sql`, open Supabase
SQL Editor and run `20261103_task_save.sql`. Do not rerun `fresh_setup.sql`.
This migration adds/replaces one RPC and its execution grants. It does not
recreate tables or remove existing records. It is safe to run again.

`save_task` runs as the authenticated caller, so the existing RLS policies
still apply. Creating/editing a task and all its subtasks is one transaction:
invalid titles, invalid priorities, foreign child IDs, or failed writes roll
back the whole save. Deleting a task uses the existing foreign key cascade.
The browser keeps draft UUIDs across retries to avoid duplicate creates after
an interrupted response.

## Local verification

Run `npm test` and `npm run build`. The tests exercise the actual page handlers
and service payloads using a mocked React hook environment and Supabase client.
They do not execute PostgreSQL or verify browser focus/layout.

## Acceptance on your Supabase project

1. Create a task with two subtasks. Refresh and verify all three records.
2. Edit its title, description and priority, add a child, edit another and remove
   one. Save, refresh and compare the UI with Table Editor.
3. Complete/restore the parent, then a child. Refresh after each operation.
   Parent and child completion remain independent.
4. Set a reminder; save and reopen. Clear it, save and reopen again.
   Times are stored as local calendar date/time; notifications and recurrence
   scheduling are not implemented.
5. Delete a task from either list. Confirm its children disappear in Table Editor.
6. With the browser network offline, try saving/completing/deleting. Verify an
   error appears, the form remains editable after failure, and the list does not
   falsely show success. Restore the network and retry.
7. Double-click Save: only one task should exist. If a response is interrupted
   after the database committed, retry the same still-open draft.
8. Sign in as a second user and verify the first user's tasks/children are
   inaccessible via the API as well as the UI.

To check transaction rollback without losing real data, create a disposable
task and call `save_task` as its signed-in user with an invalid priority and a
changed title. The call must fail and the original title must remain unchanged.
SQL Editor runs with elevated privileges by default; it is not an RLS test.
