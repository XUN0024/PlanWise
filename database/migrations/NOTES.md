# Notes model and basic CRUD

Current implementation/acceptance checklist:
[Note module 开发实施清单](../../docs/NOTE_MODULE_CHECKLIST.md).

Tag library and per-note labels now use separate tables and RPCs. After the
notes-model migration, run `20261105_note_tags.sql` before using the new client.
See [标签部署与验收](NOTE_TAGS.md). The retained `notes.tags` column is historical;
new clients hydrate names/IDs from tags/note_tags and content saves never write it.

Run `20261103_notes_model.sql` once in the existing project's Supabase SQL
Editor, then refresh the Notes page. Do not rerun `fresh_setup.sql`.
The migration is rerunnable. It preserves existing content, ownership and RLS.

New fields: `starred boolean`, `pinned boolean`, `color text`,
`checklist jsonb` (an ordered array of `{ id, text, done }` objects).
Existing notes default to unstarred, unpinned, amber, and an empty checklist.
The database initializes missing `updated_at` values and maintains the timestamp
on subsequent updates. No sample notes are inserted.

The service boundary maps `content ↔ body`, `checklist ↔ points`, and
`created_at/updated_at ↔ createdAt/updatedAt`.

Basic CRUD now uses this same schema; no additional SQL is required after the
model migration. New and Edit open a title/rich-body form with explicit
Save/Close controls and an 800ms autosave debounce after title/body edits.
A nonblank title is required; the body may be empty. Blank titles and unchanged
content do not autosave. Saving is shown at the top-right of the editor.
Automatic saves keep the editor open; manual Save still saves immediately.
Text inputs remain enabled during content saves. Requests are serialized;
responses advance the saved version without overwriting text typed in flight.
If newer edits are already idle for 800ms when the previous request finishes,
they save next immediately; otherwise the remainder of the debounce is observed.
Errors retain the draft and pause automatic retries until another edit or manual
Save. Discard, account changes and unmount cancel scheduled autosaves.
Only title and content are updated, preserving tags, flags, color and checklist.
Trash remains unavailable; Delete is permanent and requires confirmation.

The formatting row below Edit note / Delete / Close supports bold, underline,
italic, numbered lists and bulleted lists. In the reading view, a format button
opens the editor and activates that format at the end of the note. In the editor,
select text to format it; selecting a format at an empty cursor affects new text.
Ctrl/Cmd+B, Ctrl/Cmd+I, Ctrl/Cmd+U and editor undo/redo use Tiptap's key bindings.
Lists are rich-text blocks, independent of the separate checklist JSONB field.
Plain paragraphs keep their existing text representation. Formatted documents
use `planwise-richtext:v1:` followed by a supported Tiptap JSON document inside
the existing `content text` column; no additional SQL migration is required.
Legacy text is never interpreted as HTML. Read-only rendering uses React text
escaping and an allowlist of nodes/marks, and search matches visible text only.
Opening a note does not rewrite it; content updates follow existing ownership,
timestamp conflict detection and draft protection. Deploy editor and reader
together; older clients will display the JSON marker as plain text.

Right-click a sidebar note (including pinned entries) or its detail view to open
the context menu. The per-row ellipsis button and Shift+F10/ContextMenu key offer
the same actions. Star/unstar, pin/unpin and the six preset colors save immediately
with owner and version checks, without changing title/content/tags/checklist.
The menu targets the clicked note rather than the current selection. Metadata
changes on an open draft retain its text and advance the draft's base version.
Menu Edit/Delete reuse the existing draft-discard and delete-confirmation flows.
No additional SQL is needed after the notes-model migration.

Updates and deletes compare the original server timestamp before writing. If
another request changed/deleted the note, show a conflict and retain the draft.
Create retries reuse the draft UUID; a duplicate insert is recognized only if
the already stored title/content are identical, without overwriting that row.
Other failures retain the draft and keep the last confirmed list state.

Switching notes, closing/cancelling an editor, starting another note, using the
page's header links or signing out requires confirming discard if there are
unsaved edits. Refresh/tab close uses the browser's standard beforeunload prompt.
Drafts live in memory, not local storage: this stage does not implement durable
offline drafts or protection against every external history/native-window action.

Acceptance:

1. Empty account: loading resolves to "No notes yet"; no invented notes or tags.
2. Existing account with notes: select a real note to display content, timestamps,
   flags, tags and checklist. Clearing selection shows the selection placeholder.
3. Search with no matches: no fallback demo rows; clear search restores the list.
4. Offline or failed query: show an error with Retry, not a false empty state.
5. Switch accounts during a pending load: previous account's data must not appear.
6. In Table Editor, confirm the new columns and retained content. Verify note RLS
   using signed-in requests, since SQL Editor's elevated role bypasses RLS.
7. Create, save and refresh: title/body remain. Edit/save/refresh again.
8. Cancel a dirty editor and choose Keep editing; the draft must remain. Repeat
   and discard; the saved content must be unchanged.
9. Go offline and try Save/Delete. The UI must show failure without losing the
   draft or falsely removing the note. Restore the network and retry.
10. Delete a disposable note and refresh: it must not return.
11. Open the same note in two tabs. Save a change in one, then save the stale
    draft in the other: the second save must report a conflict, keeping its draft.
12. Right-click an unselected note, toggle star/pin or change color, then refresh.
    Only that note changes. Unpin removes it from Pinned; unstar removes its star.
13. Change the color of a note while its title/body draft is dirty, then save.
    Both the selected color and the edited content must survive refresh.
14. Open the context menu near the bottom/right edge: it stays inside the viewport.
    Escape/outside click closes it; arrows navigate its actions. On a small
    viewport, the menu can scroll without dismissing itself.
15. Edit a note, stop typing for 800ms, and watch the editor's Saving status.
    After success the editor stays open and refresh shows the saved content.
16. Under network throttling, keep typing during an autosave. The old response
    must not replace the newer text; another save persists it using the new version.
17. Offline autosaves show an error and keep the draft, without an endless retry
    loop. Restore the network and manually save, or edit to trigger another attempt.

18. Select part of a paragraph and toggle bold, underline and italic. Formatting
    applies only to the selected text, and the active buttons follow the cursor.
19. Convert paragraphs into numbered/bulleted lists, switch types and toggle off.
    Save, refresh and confirm the formatting, numbering and content remain.
20. Type while an autosave is pending; formatting and selection must remain.
    Undo/redo, blank lines, legacy HTML-looking text and file drops also work.

Local tests use mocked Supabase and React hooks, server rendering, plus the real
Tiptap editor and mounted React components in jsdom. They cannot validate live
PostgreSQL migration execution or visual browser layout.
