import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import LanguageSwitcher from "./LanguageSwitcher";
import ExpenseEditor from "./ExpenseEditor";
import ExpenseDialog from "./ExpenseDialog";
import { getExpenses, createExpense, updateExpense, deleteExpense } from "../services/expenseService";
import { expenseToday, expenseIsDirty, expenseErrorKey, formatExpenseRM, expensePayload } from "../lib/expenseModel";

export default function Expenses() {
  const { user, signOut } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState({ userId: null, page: 0, items: [], hasMore: false, loading: true, error: null });
  const [page, setPage] = useState(0), [reload, setReload] = useState(0);
  const [editor, setEditor] = useState(null), [deleting, setDeleting] = useState(null);
  const [pending, setPending] = useState(null), [busy, setBusy] = useState(false);
  const [writeError, setWriteError] = useState(null), [notice, setNotice] = useState(null);
  const operation = useRef(null), currentUser = useRef(user?.id);
  currentUser.current = user?.id;
  useEffect(() => {
    setPage(0); setEditor(null); setDeleting(null); setPending(null); setBusy(false);
    setWriteError(null); setNotice(null); operation.current = null;
    return () => { operation.current = null; };
  }, [user?.id]);
  useEffect(() => {
    let cancelled = false;
    const userId = user?.id;
    setSnapshot({ userId, page, items: [], hasMore: false, loading: !!userId, error: null });
    if (userId) getExpenses(userId, page).then((result) => {
      if (cancelled || currentUser.current !== userId) return;
      if (!result.items.length && page > 0) { setPage((value) => value - 1); return; }
      setSnapshot({ ...result, userId, page, loading: false, error: null });
    }).catch((error) => {
      if (!cancelled && currentUser.current === userId) setSnapshot({ userId, page, items: [], hasMore: false, loading: false,
        error: expenseErrorKey(error, "expensesPanel.loadError") });
    });
    return () => { cancelled = true; };
  }, [user?.id, page, reload]);

  const current = snapshot.userId === user?.id && snapshot.page === page ? snapshot
    : { items: [], hasMore: false, loading: true, error: null };
  const activeEditor = editor?.userId === user?.id ? editor : null;
  const activeDelete = deleting?.userId === user?.id ? deleting.record : null;
  const activePending = pending?.userId === user?.id ? pending : null;
  const dirty = !!activeEditor && expenseIsDirty(activeEditor.draft, activeEditor.base);
  useEffect(() => {
    if ((!dirty && !busy) || typeof window === "undefined") return;
    const warn = (event) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, busy]);

  const perform = (action) => {
    setEditor(null); setDeleting(null); setPending(null); setWriteError(null); setNotice(null);
    if (action.type === "new") {
      const draft = { id: crypto.randomUUID(), description: "", amount: "", date: expenseToday(), category: "Food", currency: "MYR" };
      setEditor({ userId: user.id, isNew: true, draft, base: { ...draft } });
    } else if (action.type === "edit" || action.type === "delete") {
      const record = current.items.find((item) => item.id === action.id);
      if (!record) return;
      if (action.type === "edit") setEditor({ userId: user.id, isNew: false, draft: { ...record }, base: { ...record } });
      else setDeleting({ userId: user.id, record });
    } else if (action.type === "reload") setReload((value) => value + 1);
    else if (action.type === "page") setPage(action.page);
    else if (action.type === "navigate") navigate(action.to);
    else if (action.type === "signOut") {
      Promise.resolve(signOut()).catch(() => { if (currentUser.current === user.id) setWriteError("expensesPanel.signOutError"); });
    }
  };
  const request = (action) => {
    if (operation.current || !user?.id) return;
    if (current.loading && !["close", "navigate", "signOut"].includes(action.type)) return;
    if (dirty) setPending({ ...action, userId: user.id }); else perform(action);
  };
  const navigateHeader = (event) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest("a"); if (!link) return;
    if (dirty || operation.current) {
      event.preventDefault(); event.stopPropagation();
      if (!operation.current) request({ type: "navigate", to: link.getAttribute("href") });
    }
  };
  const mutate = async (action, success, fallback, resetPage = false) => {
    if (operation.current || !user?.id) return;
    const token = {}, userId = user.id;
    operation.current = token; setBusy(true); setWriteError(null); setNotice(null);
    try {
      await action(userId);
      if (operation.current !== token || currentUser.current !== userId) return;
      if (resetPage) setPage(0);
      setEditor(null); setDeleting(null); setNotice(success);
      setReload((value) => value + 1); // Read failure after a committed write is a load error, not a failed save.
    } catch (error) {
      if (operation.current === token && currentUser.current === userId) setWriteError(expenseErrorKey(error, fallback));
    } finally { if (operation.current === token) { operation.current = null; setBusy(false); } }
  };
  const save = (event) => {
    event.preventDefault();
    if (!activeEditor || operation.current) return;
    try { expensePayload(activeEditor.draft); } catch (error) { setWriteError(expenseErrorKey(error)); return; }
    const submitted = activeEditor;
    mutate(async (userId) => {
      if (submitted.isNew) await createExpense(submitted.draft, userId);
      else await updateExpense(submitted.draft, userId, submitted.base.updatedAt);
    }, "expensesPanel.saved", "expensesPanel.saveError", submitted.isNew);
  };
  const remove = () => {
    if (activeDelete) mutate((userId) => deleteExpense(activeDelete, userId), "expensesPanel.deleted", "expensesPanel.deleteError");
  };
  return <div className="min-h-screen bg-gray-50">
    <header className="bg-white border-b shadow-sm" onClickCapture={navigateHeader}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap items-center justify-between gap-4 py-4">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2"><span className="h-8 w-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg text-white flex items-center justify-center text-sm font-bold">PW</span><span className="text-xl font-semibold">PlanWise</span></div>
          <nav className="hidden md:flex gap-5 text-sm font-medium">{["dashboard", "tasks", "expenses", "notes"].map((name) =>
            <Link key={name} to={`/${name}`} className={name === "expenses" ? "text-blue-600" : "text-gray-500 hover:text-gray-700"}>{t(name)}</Link>)}</nav>
        </div>
        <div className="flex items-center gap-3"><LanguageSwitcher /><span className="hidden sm:block text-sm text-gray-600">{user?.email}</span>
          <button disabled={busy} onClick={() => request({ type: "signOut" })} className="bg-gray-600 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50">{t("signOut")}</button>
        </div>
      </div>
    </header>
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div><h1 className="text-2xl font-semibold text-gray-900">{t("expenses")}</h1><p className="text-sm text-gray-500 mt-1">{t("expensesPanel.listOrder")} · MYR (RM)</p></div>
        <button disabled={busy || current.loading || !!current.error || !user?.id} onClick={() => request({ type: "new" })}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50">+ {t("expensesPanel.add")}</button>
      </div>
      {notice && <p role="status" className="text-sm text-green-700 mb-4">{t(notice)}</p>}
      {writeError && !activeEditor && !activeDelete && <p role="alert" className="text-red-700 mb-4">{t(writeError)}</p>}
      {current.loading ? <p role="status" className="p-6 text-gray-500">{t("expensesPanel.loading")}</p>
        : current.error ? <div role="alert" className="bg-red-50 rounded-lg p-5 text-red-700"><p>{t(current.error)}</p>
          <button disabled={busy} onClick={() => request({ type: "reload" })} className="underline mt-3">{t("expensesPanel.retry")}</button></div>
        : !current.items.length ? <div role="status" className="bg-white border rounded-xl p-10 text-center text-gray-500">{t("expensesPanel.empty")}</div>
        : <div className="space-y-3">{current.items.map((record) => <article key={record.id} className="bg-white border rounded-xl p-4 flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-0"><h2 className="font-medium text-gray-900 break-words">{record.description}</h2>
            <p className="mt-2 text-xs text-gray-500 flex flex-wrap gap-3"><time dateTime={record.date}>{record.date}</time>
              <span className="bg-gray-100 rounded-full px-2 py-0.5">{t(`expensesPanel.categories.${record.category}`)}</span></p>
          </div>
          <strong className="text-gray-900">{formatExpenseRM(record.cents)}</strong>
          <div className="flex gap-3 text-sm">
            <button disabled={busy} aria-label={t("expensesPanel.editNamed", { name: record.description })} onClick={() => request({ type: "edit", id: record.id })} className="text-blue-600">{t("edit")}</button>
            <button disabled={busy} aria-label={t("expensesPanel.deleteNamed", { name: record.description })} onClick={() => request({ type: "delete", id: record.id })} className="text-red-600">{t("delete")}</button>
          </div>
        </article>)}</div>}
      {!current.error && !current.loading && (page > 0 || current.hasMore) && <nav aria-label={t("expensesPanel.pagination")} className="mt-6 flex items-center justify-center gap-4 text-sm">
        <button disabled={busy || page === 0} onClick={() => request({ type: "page", page: page - 1 })} className="px-3 py-2 border rounded-lg disabled:opacity-40">{t("expensesPanel.previous")}</button>
        <span>{t("expensesPanel.page", { page: page + 1 })}</span>
        <button disabled={busy || !current.hasMore} onClick={() => request({ type: "page", page: page + 1 })} className="px-3 py-2 border rounded-lg disabled:opacity-40">{t("expensesPanel.next")}</button>
      </nav>}
    </main>
    {activePending ? <ExpenseDialog role="alertdialog" title={t("expensesPanel.discardTitle")} onClose={() => setPending(null)}>
      <p className="text-sm text-gray-600">{t("expensesPanel.discardBody")}</p>
      <div className="mt-5 flex justify-end gap-3"><button onClick={() => setPending(null)} className="px-4 py-2 border rounded-lg">{t("expensesPanel.keepEditing")}</button>
        <button onClick={() => perform(activePending)} className="px-4 py-2 bg-red-600 text-white rounded-lg">{t("expensesPanel.discard")}</button></div>
    </ExpenseDialog> : activeEditor ? <ExpenseEditor draft={activeEditor.draft} isNew={activeEditor.isNew} busy={busy} error={writeError}
      onChange={(updates) => { if (!operation.current) { setEditor((value) => ({ ...value, draft: { ...value.draft, ...updates } })); setWriteError(null); } }}
      onSave={save} onClose={() => request({ type: "close" })} onReload={() => request({ type: "reload" })} />
      : activeDelete && <ExpenseDialog role="alertdialog" title={t("expensesPanel.deleteTitle")} onClose={() => { if (!operation.current) { setDeleting(null); setWriteError(null); } }}>
        <p className="font-medium break-words">{activeDelete.description}</p><p className="mt-2">{formatExpenseRM(activeDelete.cents)} · {activeDelete.date}</p>
        <p className="text-sm text-gray-600 mt-3">{t("expensesPanel.deleteBody")}</p>
        {writeError && <p role="alert" className="text-red-700 mt-3">{t(writeError)}</p>}
        {writeError === "expensesPanel.conflict" && <button disabled={busy} onClick={() => request({ type: "reload" })} className="underline mt-3">{t("expensesPanel.reload")}</button>}
        <div className="mt-5 flex justify-end gap-3"><button disabled={busy} onClick={() => { setDeleting(null); setWriteError(null); }} className="px-4 py-2 border rounded-lg">{t("cancel")}</button>
          <button disabled={busy} onClick={remove} className="px-4 py-2 bg-red-600 text-white rounded-lg">{t(busy ? "expensesPanel.deleting" : "expensesPanel.confirmDelete")}</button></div>
      </ExpenseDialog>}
  </div>;
}
