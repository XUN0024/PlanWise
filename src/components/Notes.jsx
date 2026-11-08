import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { noteAssistantChoice, useNoteAssistant } from "../contexts/NoteAssistantContext";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "react-router-dom";
import LanguageSwitcher from "./LanguageSwitcher";
import NotesSidebar from "./NotesSidebar";
import NoteEditor from "./NoteEditor";
import NoteContextMenu from "./NoteContextMenu";
import NoteAttachments from "./NoteAttachments";
import NoteBody from "./NoteBody";
import NoteFormatToolbar from "./NoteFormatToolbar";
import NoteTags from "./NoteTags";
import TagManagerModal from "./TagManagerModal";
import { notesWithTags, tagsWithCounts, tagErrorKey } from "../lib/tagModel";
import { getTagState, createTag, setNoteTag, updateTag, deleteTag } from "../services/tagService";
import { noteBodyText } from "../lib/noteRichText";
import { deleteNoteAttachments } from "../services/attachmentService";
import { getNotes, createNote, updateNote, deleteNote, updateNoteAppearance } from "../services/noteService";

export const filterNotes = (notes, query, selectedTagId = null) => {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return notes.filter((note) => {
    if (selectedTagId && !note.tagIds?.includes(selectedTagId)) return false;
    const text = `${note.title} ${noteBodyText(note.body)} ${note.tags.join(" ")}`.toLowerCase();
    return tokens.every((token) => token === "is:pinned" ? note.pinned
      : token.startsWith("#") ? note.tags.some((tag) => tag.toLowerCase().includes(token.slice(1)))
      : text.includes(token));
  }).sort((a, b) => Number(b.pinned) - Number(a.pinned));
};

export default function Notes() {
  const { user, signOut } = useAuth();
  const { publish: publishAssistantNote, clear: clearAssistantNote } = useNoteAssistant();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const handledSourceLink = useRef(null);
  const [snapshot, setSnapshot] = useState({ userId: null, notes: [], loading: true, error: null });
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState("");
  const [reload, setReload] = useState(0);
  const [editor, setEditor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [writeError, setWriteError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [attachmentActivity, setAttachmentActivity] = useState(false);
  const [tagSnapshot, setTagSnapshot] = useState({ userId: null, tags: [], links: [], loading: true, error: null });
  const [tagReload, setTagReload] = useState(0);
  const [selectedTagId, setSelectedTagId] = useState(null);
  const [tagManager, setTagManager] = useState(false);
  const [tagBusy, setTagBusy] = useState(false);
  const [tagError, setTagError] = useState(null);
  const tagOperation = useRef(null);
  const attachmentsBusy = useRef(false);
  const operation = useRef(null);
  const lastEdit = useRef({ id: null, at: 0 });
  const currentUser = useRef(user?.id);
  currentUser.current = user?.id;

  useEffect(() => {
    let cancelled = false;
    const userId = user?.id;
    setSelectedId(null);
    setSearch("");
    setEditor(null);
    setDeleteTarget(null);
    setPendingAction(null);
    setContextMenu(null);
    setWriteError(null);
    setNotice(null);
    setBusy(false);
    setAttachmentActivity(false);
    setSelectedTagId(null);
    setTagManager(false);
    setTagBusy(false);
    setTagError(null);
    tagOperation.current = null;
    attachmentsBusy.current = false;
    operation.current = null;
    setSnapshot({ userId, notes: [], loading: !!userId, error: null });
    if (userId) {
      getNotes(userId).then((notes) => {
        if (!cancelled && currentUser.current === userId) {
          setSnapshot({ userId, notes, loading: false, error: null });
        }
      }).catch(() => {
        if (!cancelled && currentUser.current === userId) {
          setSnapshot({ userId, notes: [], loading: false, error: true });
        }
      });
    }
    return () => { cancelled = true; operation.current = null; };
  }, [user?.id, reload]);

  useEffect(() => {
    let cancelled = false;
    const userId = user?.id;
    setTagError(null);
    setTagSnapshot((value) => ({ userId, tags: value.userId === userId ? value.tags : [],
      links: value.userId === userId ? value.links : [], loading: !!userId, error: null }));
    if (userId) getTagState(userId).then((state) => {
      if (!cancelled && currentUser.current === userId) {
        setTagSnapshot({ ...state, userId, loading: false, error: null });
        setSelectedTagId((id) => state.tags.some((tag) => tag.id === id) ? id : null);
      }
    }).catch((err) => {
      if (!cancelled && currentUser.current === userId) setTagSnapshot((value) => ({ ...value, loading: false,
        error: tagErrorKey(err) === "tagsPanel.setupRequired" ? "tagsPanel.setupRequired" : "tagsPanel.loadError" }));
    });
    return () => { cancelled = true; tagOperation.current = null; };
  }, [user?.id, tagReload]);

  // Associate the snapshot with its account so old content is never shown on switch.
  const { notes: storedNotes, loading, error } = snapshot.userId === user?.id
    ? snapshot : { notes: [], loading: true, error: null };
  const tagState = tagSnapshot.userId === user?.id ? tagSnapshot : { tags: [], links: [], loading: true, error: null };
  const notes = useMemo(() => notesWithTags(storedNotes, tagState), [storedNotes, tagState]);
  const tags = useMemo(() => tagsWithCounts(tagState, new Set(storedNotes.map((note) => note.id))), [tagState, storedNotes]);
  const filteredNotes = useMemo(() => filterNotes(notes, search, selectedTagId), [notes, search, selectedTagId]);
  const selectedNote = useMemo(
    () => filteredNotes.find((note) => note.id === selectedId) ?? null,
    [filteredNotes, selectedId]
  );
  const activeEditor = editor?.userId === user?.id ? editor : null;
  const activeDelete = deleteTarget && deleteTarget.userId === user?.id ? deleteTarget.note : null;
  const draft = activeEditor?.draft;
  const menuNote = contextMenu?.userId === user?.id
    ? notes.find((note) => note.id === contextMenu?.id) : null;
  const dirty = !!draft && (draft.title !== activeEditor.base.title || draft.body !== activeEditor.base.body);
  const assistantChoices = useMemo(() => notes.map((note) => noteAssistantChoice(note)), [notes]);
  const assistantCurrentNote = useMemo(() => draft
    ? noteAssistantChoice(draft, { saved: !activeEditor.isNew, dirty,
      saving: busy && operation.current?.kind === "content", saveError: !!writeError })
    : noteAssistantChoice(selectedNote), [draft, activeEditor?.isNew, dirty, busy, writeError, selectedNote]);
  useEffect(() => {
    publishAssistantNote({ userId: user?.id, notes: assistantChoices, currentNote: assistantCurrentNote, loading, error: !!error });
  }, [publishAssistantNote, user?.id, assistantChoices, assistantCurrentNote, loading, error]);
  useEffect(() => () => clearAssistantNote(user?.id), [clearAssistantNote, user?.id]);
  useEffect(() => {
    if ((!dirty && !busy && !attachmentActivity && !tagBusy) || typeof window === "undefined") return;
    const warn = (event) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, busy, attachmentActivity, tagBusy]);

  const perform = (action) => {
    setContextMenu(null);
    setEditor(null);
    setDeleteTarget(null);
    setWriteError(null);
    setNotice(null);
    setPendingAction(null);
    if (action.type === "new") {
      const note = { id: crypto.randomUUID(), title: "", body: "", color: "#F59E0B" };
      setSearch("");
      setSelectedTagId(null);
      setSelectedId(null);
      setEditor({ userId: user.id, draft: note, base: { ...note }, isNew: true });
    } else if (action.type === "select" || action.type === "openSource") {
      setSelectedId(action.id);
      if(action.type === "openSource"){setSearch("");setSelectedTagId(null);}
    } else if (action.type === "edit" || action.type === "delete") {
      const target = notes.find((note) => note.id === action.id);
      if (!target) return;
      setSelectedId(target.id);
      setSearch("");
      setSelectedTagId(null);
      if (action.type === "edit") {
        setEditor({ userId: user.id, draft: { ...target }, base: { ...target }, isNew: false, initialFormat: action.format });
      } else {
        setDeleteTarget({ userId: user.id, note: target });
      }
    } else if (action.type === "filterTag") {
      setSelectedTagId(action.id);
      setSelectedId(null);
    } else if (action.type === "reload") {
      setReload((value) => value + 1);
    } else if (action.type === "navigate") {
      navigate(action.to);
    } else if (action.type === "signOut") {
      signOut();
    }
  };
  const request = (action) => {
    if (operation.current || tagOperation.current || attachmentsBusy.current || loading || !user?.id) return;
    if (["select", "edit", "openSource"].includes(action.type) && draft?.id === action.id) return;
    if (dirty) setPendingAction({ userId: user.id, ...action });
    else perform(action);
  };
  useEffect(() => {
    if (loading || error || busy || tagBusy || attachmentActivity || !user?.id) return;
    const noteId = new URLSearchParams(location.search || "").get("note");
    const linkKey = user.id + ":" + (location.key || "") + ":" + (noteId || "");
    if (!noteId || handledSourceLink.current === linkKey) return;
    handledSourceLink.current = linkKey;
    if (notes.some(note => note.id === noteId)) request({type:"openSource",id:noteId});
    else setWriteError("askPlanwise.errors.AI_NOTE_UNAVAILABLE");
  }, [location.search,location.key,user?.id,loading,error,busy,tagBusy,attachmentActivity,notes]);
  const handleSignOut = () => request({ type: "signOut" });
  const handleHeaderClick = (event) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const anchor = event.target.closest("a");
    if (!anchor || anchor.getAttribute("href") === "#") return;
    if (operation.current || tagOperation.current || attachmentsBusy.current || dirty) {
      event.preventDefault();
      event.stopPropagation();
      if (!operation.current && !tagOperation.current && !attachmentsBusy.current) request({ type: "navigate", to: anchor.getAttribute("href") });
    }
  };
  const mutate = async (action, fallback, conflictKey = "notesPanel.conflict", kind = "other") => {
    if (operation.current || tagOperation.current || loading || !user?.id) return;
    const token = { kind };
    const userId = user.id;
    operation.current = token;
    setBusy(true);
    setWriteError(null);
    setNotice(null);
    try {
      const apply = await action(userId);
      if (operation.current === token && currentUser.current === userId) apply();
    } catch (err) {
      if (operation.current === token && currentUser.current === userId) {
        setWriteError(err.code === "NOTE_CONFLICT" ? conflictKey
          : err.code === "NOTE_TITLE_REQUIRED" ? "notesPanel.titleRequired" : fallback);
      }
    } finally {
      if (operation.current === token) { operation.current = null; setBusy(false); }
    }
  };
  const handleSave = (event, { automatic = false } = {}) => {
    event?.preventDefault();
    if (!activeEditor) return;
    const submitted = activeEditor;
    mutate(async (userId) => {
      const saved = submitted.isNew ? await createNote(submitted.draft, userId)
        : await updateNote(submitted.draft, userId, submitted.base.updatedAt);
      return () => {
        setSnapshot((value) => ({ ...value, notes: [
          saved, ...value.notes.filter((note) => note.id !== saved.id),
        ].sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || "") || a.id.localeCompare(b.id)) }));
        setSelectedId(saved.id);
        setSearch("");
        setEditor((latest) => {
          if (latest?.userId !== userId || latest.draft.id !== saved.id) return latest;
          const newerTitle = latest.draft.title !== submitted.draft.title;
          const newerBody = latest.draft.body !== submitted.draft.body;
          if (!automatic && !newerTitle && !newerBody) return null;
          return {
            ...latest, isNew: false, base: { ...saved }, saved: true,
            draft: {
              ...saved,
              title: newerTitle ? latest.draft.title : saved.title,
              body: newerBody ? latest.draft.body : saved.body,
            },
          };
        });
        if (!automatic) setNotice("notesPanel.saved");
      };
    }, "notesPanel.saveError", "notesPanel.conflict", "content");
  };
  // Debounce only actual text edits. Serialize requests, then save any newer text
  // against the returned server version, without replacing it with an old response.
  useEffect(() => {
    if (!draft || !dirty || !draft.title.trim() || busy || tagBusy || loading || writeError
      || pendingAction || activeDelete || lastEdit.current.id !== draft.id) return;
    const delay = Math.max(0, 800 - (Date.now() - lastEdit.current.at));
    const timer = setTimeout(() => handleSave(undefined, { automatic: true }), delay);
    return () => clearTimeout(timer);
  }, [draft?.id, draft?.title, draft?.body, activeEditor?.base.updatedAt, activeEditor?.isNew,
    dirty, busy, tagBusy, loading, writeError, pendingAction, activeDelete, user?.id]);
  const handleEdit = (format) => {
    if (selectedNote) request({ type: "edit", id: selectedNote.id, format: typeof format === "string" ? format : undefined });
  };
  const openContextMenu = (event, id) => {
    event.preventDefault();
    event.stopPropagation();
    if (operation.current || tagOperation.current || attachmentsBusy.current || loading || activeDelete || pendingAction || !user?.id) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const pointer = event.type === "contextmenu" && (event.clientX || event.clientY);
    setContextMenu({
      userId: user.id, id,
      x: pointer ? event.clientX : bounds.left,
      y: pointer ? event.clientY : bounds.bottom,
    });
  };
  const handleMenuAction = (action) => {
    const target = menuNote;
    setContextMenu(null);
    if (!target || operation.current) return;
    if (action.type !== "appearance") {
      request({ type: action.type, id: target.id });
      return;
    }
    mutate(async (userId) => {
      const saved = await updateNoteAppearance(target, action.changes, userId);
      return () => {
        setSnapshot((value) => ({ ...value, notes: value.notes.map((note) => note.id === saved.id ? saved : note) }));
        // Metadata changes must not discard unsaved title/body edits.
        setEditor((value) => value?.userId === userId && value.draft.id === saved.id
          ? { ...value, base: { ...saved }, draft: { ...saved, title: value.draft.title, body: value.draft.body } }
          : value);
        setNotice("notesPanel.appearanceSaved");
      };
    }, "notesPanel.appearanceError", "notesPanel.appearanceConflict");
  };
  const handleDelete = () => {
    if (!activeDelete) return;
    mutate(async (userId) => {
      await deleteNoteAttachments(activeDelete, userId);
      await deleteNote(activeDelete, userId);
      return () => {
        setSnapshot((value) => ({ ...value, notes: value.notes.filter((note) => note.id !== activeDelete.id) }));
        setTagSnapshot((value) => ({ ...value, links: value.links.filter((link) => link.noteId !== activeDelete.id) }));
        setSelectedId(null);
        setDeleteTarget(null);
        setNotice("notesPanel.deleted");
      };
    }, "notesPanel.deleteError");
  };
  const mutateTags = async (action) => {
    if (operation.current || tagOperation.current || loading || tagState.loading || tagState.error
      || attachmentsBusy.current || activeDelete || pendingAction || !user?.id) return false;
    const token = {};
    const userId = user.id;
    tagOperation.current = token;
    setTagBusy(true);
    setTagError(null);
    try {
      const state = await action(userId);
      if (tagOperation.current !== token || currentUser.current !== userId) return false;
      setTagSnapshot({ ...state, userId, loading: false, error: null });
      setSelectedTagId((id) => state.tags.some((tag) => tag.id === id) ? id : null);
      return true;
    } catch (err) {
      if (tagOperation.current === token && currentUser.current === userId) setTagError(tagErrorKey(err));
      return false;
    } finally {
      if (tagOperation.current === token) { tagOperation.current = null; setTagBusy(false); }
    }
  };
  const tagControls = (id, saved) => <NoteTags key={user?.id + ":tags:" + id} tags={tags}
    selectedIds={tagState.links.filter((link) => link.noteId === id).map((link) => link.tagId)} saved={saved}
    disabled={busy || tagBusy || tagState.loading || !!tagState.error || attachmentActivity || !!activeDelete || !!pendingAction}
    onToggle={(tagId, selected) => mutateTags((uid) => setNoteTag(uid, id, tagId, selected))}
    onCreate={(name) => mutateTags((uid) => createTag(uid, name, "#3B82F6", id))} />;
  const updatedLabel = (value) => {
    const date = new Date(value);
    return value && !Number.isNaN(date.getTime())
      ? date.toLocaleString(i18n?.language || undefined) : "—";
  };

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden">
      {/* Header */}
      <header onClickCapture={handleHeaderClick} className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo and Navigation */}
            <div className="flex items-center">
              <div className="flex items-center">
                <div className="h-8 w-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                  <span className="text-white text-sm font-bold">PW</span>
                </div>
                <span className="ml-2 text-xl font-semibold text-gray-900">
                  PlanWise
                </span>
              </div>

              {/* Navigation */}
              <nav className="hidden md:ml-8 md:flex md:space-x-8">
                <Link
                  to="/dashboard"
                  className="text-gray-500 hover:text-gray-700 px-1 py-4 text-sm font-medium"
                >
                  {t("dashboard")}
                </Link>
                <Link
                  to="/tasks"
                  className="text-gray-500 hover:text-gray-700 px-1 py-4 text-sm font-medium"
                >
                  {t("tasks")}
                </Link>
                <Link
                  to="/expenses"
                  className="text-gray-500 hover:text-gray-700 px-1 py-4 text-sm font-medium"
                >
                  Expenses
                </Link>
                <Link
                  to="/notes"
                  className="text-blue-600 border-b-2 border-blue-600 hover:text-gray-700 px-1 py-4 text-sm font-medium"
                >
                  Notes
                </Link>
                <a
                  href="#"
                  className="text-gray-500 hover:text-gray-700 px-1 py-4 text-sm font-medium"
                >
                  Files
                </a>
              </nav>
            </div>

            {/* User Menu */}
            <div className="flex items-center space-x-4">
              <LanguageSwitcher />
              <span data-planwise-ai-slot />
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-sm font-medium">
                    {user?.email?.charAt(0).toUpperCase() || "U"}
                  </span>
                </div>
                <span className="text-sm text-gray-600 hidden sm:block">
                  {user?.email}
                </span>
              </div>
              <button
                disabled={busy || attachmentActivity || tagBusy}
                onClick={handleSignOut}
                className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors text-sm"
              >
                {t("signOut")}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-col md:flex-row items-stretch md:items-start gap-6 px-4 sm:px-6 lg:px-8 min-w-0">
        <NotesSidebar notes={notes} visibleNotes={filteredNotes} selectedId={selectedNote?.id ?? null}
          tags={tags} selectedTagId={selectedTagId} tagsLoading={tagState.loading}
          onTagSelect={(id) => request({ type: "filterTag", id })}
          onManageTags={() => setTagManager(true)} tagsError={tagState.error}
          onNoteContextMenu={openContextMenu}
          onSelect={(id) => request({ type: "select", id })} onNew={() => request({ type: "new" })}
          busy={busy || tagBusy || attachmentActivity || !!activeDelete || (!!pendingAction && pendingAction.userId === user?.id)}
          search={search} onSearchChange={setSearch} loading={loading} error={!!error} />
        <main className="flex-1 min-w-0 py-6">
          {assistantCurrentNote&&<button type="button" disabled={!!activeDelete||!!pendingAction} onClick={()=>window.dispatchEvent(new CustomEvent("planwise:ask",{detail:{userId:user.id,title:assistantCurrentNote.title,reference:{type:"note",id:assistantCurrentNote.id,version:assistantCurrentNote.updatedAt||"1970-01-01T00:00:00Z"}}}))} className="mb-3 rounded-lg border border-violet-200 px-3 py-2 text-sm text-violet-700">{t("askPlanwise.unified.ask")}</button>}
          <NoteAttachments key={user?.id + ":" + (draft?.id || selectedNote?.id || "")}
            userId={user?.id} noteId={draft?.id || selectedNote?.id}
            saved={draft ? !activeEditor.isNew : !!selectedNote}
            disabled={tagBusy || !!activeDelete || !!pendingAction || (busy && operation.current?.kind !== "content")}
            onBusyChange={(value) => {
              attachmentsBusy.current = value;
              setAttachmentActivity(value);
            }}>
          {notice && <p role="status" className="mb-4 text-sm text-green-700">{t(notice)}</p>}
          {(tagState.error || tagError) && !tagManager && <div role="alert" className="mb-4 text-sm text-red-700">
            <p>{t(tagState.error || tagError)}</p>
            <button type="button" disabled={busy || tagBusy || tagState.loading} onClick={() => setTagReload((value) => value + 1)} className="underline">{t("tagsPanel.reload")}</button>
          </div>}
          {writeError && !draft && !activeDelete && <div role="alert" className="mb-4 p-4 bg-red-50 text-red-700 rounded-lg">
            <p>{t(writeError)}</p>
            <button disabled={busy} onClick={() => request({ type: "reload" })} className="mt-2 underline">{t("notesPanel.reload")}</button>
          </div>}
          {loading ? <p role="status" className="p-6 text-gray-600">{t("notesPanel.loading")}</p>
            : error ? <div role="alert" className="bg-red-50 rounded-xl p-6 text-red-700">
              <p>{t("notesPanel.loadError")}</p>
              <button onClick={() => setReload((value) => value + 1)} className="mt-3 underline">{t("notesPanel.retry")}</button>
            </div>
            : draft ? <NoteEditor draft={draft} isNew={activeEditor.isNew} dirty={dirty} busy={busy}
              initialFormat={activeEditor.initialFormat} actionsBusy={attachmentActivity || tagBusy} saveDisabled={tagBusy}
              tagControls={tagControls(draft.id, !activeEditor.isNew)}
              onDelete={() => request({ type: "delete", id: draft.id })}
              saving={busy && operation.current?.kind === "content"} saved={!!activeEditor.saved} error={writeError}
              onChange={(updates) => {
                if (!operation.current || operation.current.kind === "content") {
                  lastEdit.current = { id: draft.id, at: Date.now() };
                  setEditor((value) => ({ ...value, draft: { ...value.draft, ...updates } }));
                  setWriteError(null);
                }
              }}
              onSave={handleSave} onCancel={() => request({ type: "cancel" })} />
            : !notes.length ? <div role="status" className="bg-white rounded-xl border border-gray-200 p-8 text-center">
              <h1 className="text-xl font-semibold text-gray-900">{t("notesPanel.noNotes")}</h1>
              <button onClick={() => request({ type: "new" })} className="mt-4 text-blue-600">{t("notesPanel.new")}</button>
            </div>
            : !filteredNotes.length ? <div role="status" className="bg-white rounded-xl border p-8 text-center text-gray-500">
              <p>{t("notesPanel.noMatches")}</p>
              <button onClick={() => { setSearch(""); setSelectedTagId(null); }} className="mt-3 text-blue-600">{t("notesPanel.clearSearch")}</button>
            </div>
            : !selectedNote ? <div role="status" className="bg-white rounded-xl border p-8 text-center text-gray-500">
              {t("notesPanel.selectNote")}
            </div>
            : <article onContextMenu={(event) => openContextMenu(event, selectedNote.id)} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="h-2" style={{ backgroundColor: selectedNote.color }} />
              <header className="px-6 py-4 border-b border-gray-100">
                <div className="flex items-start justify-between gap-3">
                  <h1 className="text-xl font-semibold text-gray-900 break-words min-w-0">{selectedNote.title || t("notesPanel.untitled")}</h1>
                  <div className="flex gap-3 text-sm shrink-0">
                    <button disabled={busy || tagBusy} onClick={handleEdit} className="text-blue-600">{t("notesPanel.edit")}</button>
                    <button disabled={busy || tagBusy} onClick={() => request({ type: "delete", id: selectedNote.id })} className="text-red-600">{t("notesPanel.delete")}</button>
                    <button disabled={busy || tagBusy} onClick={() => request({ type: "select", id: null })} className="text-gray-500">{t("notesPanel.close")}</button>
                  </div>
                </div>
                <NoteFormatToolbar disabled={busy || tagBusy || attachmentActivity} onFormat={handleEdit} />
                <p className="text-xs text-gray-500 mt-2">{t("notesPanel.updated")}: {updatedLabel(selectedNote.updatedAt)}</p>
                <div className="flex gap-3 text-xs text-gray-500 mt-2">
                  {selectedNote.pinned && <span>{t("notesPanel.pinned")}</span>}
                  {selectedNote.starred && <span>{t("notesPanel.starred")}</span>}
                </div>
              </header>
              <div className="px-6 py-5">
                <div className="mb-4">{tagControls(selectedNote.id, true)}</div>
                <NoteBody body={selectedNote.body} fallback={t("notesPanel.noContent")} />
                {!!selectedNote.points.length && <ul aria-label={t("notesPanel.checklist")} className="mt-5 space-y-2">
                  {selectedNote.points.map((point) => <li key={point.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={point.done} disabled aria-label={point.text || t("notesPanel.checklist")} />
                    <span className={point.done ? "line-through text-gray-400" : "text-gray-700"}>{point.text}</span>
                  </li>)}
                </ul>}
              </div>
            </article>}
          {draft && ["notesPanel.conflict", "notesPanel.appearanceConflict"].includes(writeError) && <button disabled={busy} onClick={() => request({ type: "reload" })} className="mt-3 text-blue-600 underline">{t("notesPanel.reload")}</button>}
          </NoteAttachments>
        </main>
      </div>
      {tagManager && tagSnapshot.userId === user?.id && <TagManagerModal key={user?.id} tags={tags}
        busy={tagBusy} disabled={busy || attachmentActivity} unavailable={!!tagState.error} loading={tagState.loading}
        error={tagState.error || tagError} onReload={() => setTagReload((value) => value + 1)} onClose={() => setTagManager(false)}
        onCreate={(name, color) => mutateTags((uid) => createTag(uid, name, color))}
        onUpdate={(tag, name, color) => mutateTags((uid) => updateTag(uid, tag, name, color))}
        onDelete={(tag) => mutateTags((uid) => deleteTag(uid, tag))} />}
      {menuNote && !busy && !activeDelete && !pendingAction && <NoteContextMenu key={`${menuNote.id}-${contextMenu.x}-${contextMenu.y}`}
        note={menuNote} x={contextMenu.x} y={contextMenu.y}
        onAction={handleMenuAction} onClose={() => setContextMenu(null)} />}
      {activeDelete && <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <section role="alertdialog" aria-modal="true" aria-labelledby="delete-note-title" className="bg-white rounded-xl p-6 max-w-md w-full">
          <h2 id="delete-note-title" className="text-lg font-semibold">{t("notesPanel.deleteTitle")}</h2>
          <p className="mt-3 font-medium break-words">{activeDelete.title || t("notesPanel.untitled")}</p>
          <p className="mt-2 text-sm text-gray-600">{t("notesPanel.deleteBody")}</p>
          {writeError && <p role="alert" className="mt-3 text-red-700">{t(writeError)}</p>}
          {writeError === "notesPanel.conflict" && <button disabled={busy} onClick={() => request({ type: "reload" })} className="mt-3 underline">{t("notesPanel.reload")}</button>}
          <div className="mt-5 flex justify-end gap-3">
            <button autoFocus disabled={busy} onClick={() => { setDeleteTarget(null); setWriteError(null); }} className="px-4 py-2 border rounded-lg">{t("notesPanel.cancel")}</button>
            <button disabled={busy} onClick={handleDelete} className="px-4 py-2 bg-red-600 text-white rounded-lg">{t(busy ? "notesPanel.deleting" : "notesPanel.confirmDelete")}</button>
          </div>
        </section>
      </div>}
      {pendingAction && pendingAction.userId === user?.id && <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <section role="alertdialog" aria-modal="true" aria-labelledby="discard-note-title" className="bg-white rounded-xl p-6 max-w-md w-full">
          <h2 id="discard-note-title" className="text-lg font-semibold">{t("notesPanel.discardTitle")}</h2>
          <p className="mt-3 text-sm text-gray-600">{t("notesPanel.discardBody")}</p>
          <div className="mt-5 flex justify-end gap-3">
            <button autoFocus onClick={() => setPendingAction(null)} className="px-4 py-2 border rounded-lg">{t("notesPanel.keepEditing")}</button>
            <button onClick={() => perform(pendingAction)} className="px-4 py-2 bg-red-600 text-white rounded-lg">{t("notesPanel.discard")}</button>
          </div>
        </section>
      </div>}
    </div>
  );
}
