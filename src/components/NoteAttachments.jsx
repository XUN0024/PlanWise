import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faFile, faFileImage, faFilePdf, faFileExcel, faFilePowerpoint,
  faFileZipper, faFileAudio, faFileVideo, faFileLines,
} from "@fortawesome/free-solid-svg-icons";
import { attachmentDiagnostic, attachmentKind, formatAttachmentSize, isFileDrag, validateAttachmentBatch } from "../lib/attachmentModel";
import { getAttachments as getNoteAttachments, uploadAttachment as uploadNoteAttachment, removeAttachment as removeNoteAttachment, discardAttachment as discardNoteAttachment, downloadAttachment as downloadNoteAttachment } from "../services/attachmentService";
import AttachmentPreview from "./AttachmentPreview";

const icons = {
  image: faFileImage, pdf: faFilePdf, spreadsheet: faFileExcel, presentation: faFilePowerpoint,
  archive: faFileZipper, audio: faFileAudio, video: faFileVideo, document: faFileLines, file: faFile,
};
const errorKey = (error) => ({
  ATTACHMENT_TOO_MANY: "tooMany", ATTACHMENT_TOO_LARGE: "tooLarge",
  ATTACHMENT_EMPTY: "emptyDrop", ATTACHMENT_INVALID_NAME: "invalidName",
  ATTACHMENT_AUTH: "authError", ATTACHMENT_DIRECTORY: "directory",
  EXPENSE_RECEIPTS_SETUP_REQUIRED: "receiptSetupRequired",
}[error?.code] || "uploadError");
const noteServices = {
  getAttachments:getNoteAttachments,uploadAttachment:({parentId,...options})=>uploadNoteAttachment({...options,noteId:parentId}),
  removeAttachment:removeNoteAttachment,discardAttachment:discardNoteAttachment,downloadAttachment:downloadNoteAttachment,
};

export default function NoteAttachments({ noteId, userId, saved, disabled = false, onBusyChange, children,
  services = noteServices, titleKey = "attachments.title", saveFirstKey = "attachments.saveFirst", allowFilePicker = false, ConfirmDialog }) {
  const { t } = useTranslation();
  const { getAttachments, uploadAttachment, removeAttachment, discardAttachment, downloadAttachment } = services;
  const [records, setRecords] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(!!saved);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [working, setWorking] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [preview, setPreview] = useState(null);
  const [reload, setReload] = useState(0);
  const depth = useRef(0);
  const zone = useRef(null);
  const picker = useRef(null), modal = useRef(false);
  const alive = useRef(true);
  const locked = useRef(false);
  const controller = useRef(null);
  const reportBusy = useRef(onBusyChange);
  reportBusy.current = onBusyChange;
  const markBusy = (value) => {
    locked.current = value;
    if (alive.current) setWorking(value);
    reportBusy.current?.(value || modal.current);
  };
  useEffect(() => {
    alive.current = true;
    const reset = () => { depth.current = 0; setDragging(false); };
    const preventFileNavigation = (event) => {
      if (!isFileDrag(event.dataTransfer)) return;
      event.preventDefault();
      if (event.type === "drop") reset();
      else if (!zone.current?.contains(event.target)) event.dataTransfer.dropEffect = "none";
    };
    window.addEventListener("dragover", preventFileNavigation);
    window.addEventListener("drop", preventFileNavigation);
    window.addEventListener("dragend", reset);
    window.addEventListener("blur", reset);
    return () => {
      alive.current = false;
      controller.current?.abort();
      reportBusy.current?.(false);
      window.removeEventListener("dragover", preventFileNavigation);
      window.removeEventListener("drop", preventFileNavigation);
      window.removeEventListener("dragend", reset);
      window.removeEventListener("blur", reset);
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    setRecords([]);
    setLoadError(false);
    if (!saved || !noteId || !userId) return;
    setLoading(true);
    getAttachments(noteId, userId).then((data) => {
      if (!cancelled) setRecords(data);
    }).catch(() => { if (!cancelled) setLoadError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [noteId, userId, saved, reload, getAttachments]);

  const patchJob = (id, updates) => {
    if (alive.current) setJobs((list) => list.map((job) => job.id === id ? { ...job, ...updates } : job));
  };
  const runJobs = async (batch) => {
    if (locked.current || disabled || deleting || preview || !saved || loading || loadError) return;
    setError(null);
    const abort = new AbortController();
    controller.current = abort;
    markBusy(true);
    setJobs((list) => [
      ...list.filter((job) => !batch.some((item) => item.id === job.id)),
      ...batch.map((job) => ({ ...job, status: "queued", progress: 0 })),
    ]);
    let index = 0;
    const worker = async () => {
      while (!abort.signal.aborted && index < batch.length) {
        const job = batch[index++];
        patchJob(job.id, { status: "uploading" });
        try {
          const record = await uploadAttachment({
            file: job.file, parentId: noteId, userId, id: job.id, signal: abort.signal,
            onProgress: (progress) => patchJob(job.id, { progress }),
          });
          if (alive.current && !abort.signal.aborted) {
            setRecords((list) => [...list.filter((item) => item.id !== record.id), record]);
            setJobs((list) => list.filter((item) => item.id !== job.id));
          }
        } catch (failure) {
          if (alive.current && !abort.signal.aborted) {
            const diagnostic = attachmentDiagnostic(failure);
            console.error("Attachment upload failed", diagnostic);
            patchJob(job.id, { status: "failed", error: errorKey(failure), diagnostic });
          }
        }
      }
    };
    try { await Promise.all([worker(), worker()]); }
    finally {
      if (alive.current && controller.current === abort) {
        controller.current = null;
        markBusy(false);
      }
    }
  };
  const receiveFiles = (files, items = []) => {
    if (!saved || !noteId) { setError("saveFirst"); return; }
    if (locked.current || disabled || deleting || preview || loading) { setError("wait"); return; }
    if (loadError) { setError("loadError"); return; }
    try {
      if (Array.from(items).some((item) => item.webkitGetAsEntry?.()?.isDirectory)) {
        throw { code: "ATTACHMENT_DIRECTORY" };
      }
      validateAttachmentBatch(files);
      runJobs(files.map((file) => ({ id: crypto.randomUUID(), file })));
    } catch (failure) { setError(errorKey(failure)); }
  };
  const onDrop = (event) => {
    if (!isFileDrag(event.dataTransfer)) return;
    event.preventDefault(); event.stopPropagation();depth.current = 0; setDragging(false);
    receiveFiles(Array.from(event.dataTransfer.files),event.dataTransfer.items || []);
  };
  const openDelete = (target) => { modal.current=true;setDeleting(target);reportBusy.current?.(true); };
  const closeDelete = () => { if(!locked.current) {modal.current=false;setDeleting(null);reportBusy.current?.(false);} };
  const remove = async (target) => {
    if (locked.current) return;
    markBusy(true); setError(null);
    try {
      if (target.file) await discardAttachment(target.id, noteId, userId);
      else await removeAttachment(target, userId);
      if (alive.current) {
        setRecords((list) => list.filter((item) => item.id !== target.id));
        setJobs((list) => list.filter((item) => item.id !== target.id));
        setDeleting(null);
        modal.current=false;
      }
    } catch {
      if (alive.current) setError("removeError");
    } finally { if (alive.current) markBusy(false); }
  };
  const download = async (record) => {
    if (locked.current) return;
    markBusy(true); setError(null);
    try {
      const blob = await downloadAttachment(record, userId);
      if (!alive.current) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = record.original_name;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      if (alive.current) setError("downloadError");
    } finally { if (alive.current) markBusy(false); }
  };
  const fileIcon = (name, mime) => <FontAwesomeIcon icon={icons[attachmentKind(name, mime)]} className="w-6 h-6 text-blue-600 shrink-0" />;
  const jobIds = new Set(jobs.map((job) => job.id));
  const canDrop = saved && !working && !disabled && !deleting && !preview && !loading && !loadError;
  const confirmation = deleting && <>
    <p className="my-4 break-words">{deleting.original_name || deleting.file.name}</p>
    {error && <p role="alert" className="text-sm text-red-700 mb-3">{t("attachments." + error)}</p>}
    <div className="flex justify-end gap-3">
      <button type="button" autoFocus disabled={working} onClick={closeDelete}>{t("notesPanel.cancel")}</button>
      <button type="button" disabled={working} onClick={() => remove(deleting)} className="text-red-600">{t("notesPanel.confirmDelete")}</button>
    </div>
  </>;
  return (
    <div ref={zone} className="relative" onDrop={onDrop}
      onDragEnter={(event) => { if (isFileDrag(event.dataTransfer)) { event.preventDefault(); depth.current++; setDragging(true); } }}
      onDragOver={(event) => { if (isFileDrag(event.dataTransfer)) { event.preventDefault(); event.dataTransfer.dropEffect = canDrop ? "copy" : "none"; setDragging(true); } }}
      onDragLeave={(event) => { if (isFileDrag(event.dataTransfer)) { depth.current = Math.max(0, depth.current - 1); if (!depth.current) setDragging(false); } }}>
      {children}
      {allowFilePicker && <div className="mt-3">
        <input ref={picker} type="file" multiple hidden aria-label={t("attachments.chooseFiles")} onChange={event=>{
          const files=Array.from(event.target.files || []);event.target.value="";if(files.length)receiveFiles(files);
        }} />
        <button type="button" disabled={!canDrop} onClick={()=>picker.current?.click()} className="text-sm text-blue-600 disabled:opacity-40">{t("attachments.chooseFiles")}</button>
      </div>}
      {dragging && <div role="status" className="absolute inset-0 z-30 min-h-[160px] pointer-events-none rounded-xl border-2 border-dashed border-blue-500 bg-blue-50/95 flex flex-col items-center justify-center p-6 text-center">
        <p className="text-xl font-semibold text-blue-700">{t(!saved ? saveFirstKey : canDrop ? "attachments.dropHere" : "attachments.wait")}</p>
        <p className="text-sm text-blue-600 mt-2">{t("attachments.limits")}</p>
      </div>}
      {loadError && <div role="alert" className="mt-4 p-3 bg-red-50 text-red-700 rounded-lg">
        {t("attachments.loadError")} <button disabled={working} onClick={() => setReload((value) => value + 1)} className="underline">{t("notesPanel.retry")}</button>
      </div>}
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{t(error==="saveFirst"?saveFirstKey:"attachments." + error)}</p>}
      {(records.length > 0 || jobs.length > 0) && <section aria-label={t(titleKey)} className="mt-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">{t(titleKey)}</h2>
          {working && controller.current && <button className="text-sm text-gray-600" onClick={() => {
            controller.current?.abort();
            setJobs((list) => list.map((job) => ["queued", "uploading"].includes(job.status)
              ? { ...job, status: "failed", error: "cancelled" } : job));
          }}>{t("attachments.cancelUpload")}</button>}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {records.filter((record) => !jobIds.has(record.id)).map((record) =>
            <div key={record.id} className="flex items-center gap-3 min-w-0 rounded-lg border bg-white p-3">
              {fileIcon(record.original_name, record.mime_type)}
              <div className="min-w-0 flex-1">
                <button disabled={working || record.status !== "ready"} onClick={() => download(record)} className="block text-left text-sm text-blue-700 truncate max-w-full" title={record.original_name}>{record.original_name}</button>
                <p className="text-xs text-gray-500">{formatAttachmentSize(Number(record.size_bytes))}{record.status !== "ready" && " · " + t("attachments.incomplete")}</p>
              </div>
              <button disabled={working || disabled || record.status !== "ready"} onClick={() => {
                modal.current=true;setPreview(record); reportBusy.current?.(true);
              }} className="text-xs text-blue-600 disabled:opacity-40">{t("preview.open")}</button>
              <button disabled={working || disabled} onClick={() => openDelete(record)} className="text-xs text-red-600">{t("notesPanel.delete")}</button>
            </div>
          )}
          {jobs.map((job) => <div key={job.id} className="flex items-center gap-3 min-w-0 rounded-lg border bg-white p-3">
            {fileIcon(job.file.name, job.file.type)}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm" title={job.file.name}>{job.file.name}</p>
              <p role="status" className="text-xs text-gray-500">{t("attachments." + (job.status || "queued"))} {job.status === "uploading" && job.progress != null && job.progress + "%"}</p>
              {job.status === "uploading" && <progress value={job.progress == null ? undefined : job.progress} max="100" className="w-full h-1" />}
              {job.status === "failed" && <p className="text-xs text-red-600">{t("attachments." + job.error)}</p>}
              {job.status === "failed" && job.diagnostic && <details className="text-xs text-gray-600 mt-1">
                <summary className="cursor-pointer">{t("attachments.errorDetails")}</summary>
                <p className="mt-1">{t("attachments.stage." + job.diagnostic.stage)}
                  {job.diagnostic.transport ? " · " + job.diagnostic.transport : ""}
                  {job.diagnostic.status ? " · HTTP " + job.diagnostic.status : ""}
                  {job.diagnostic.code ? " · " + job.diagnostic.code : ""}</p>
                <p className="mt-1 whitespace-pre-wrap break-words">{job.diagnostic.message}</p>
              </details>}
            </div>
            {job.status === "failed" && <div className="flex gap-2 text-xs">
              <button disabled={working} onClick={() => runJobs([job])} className="text-blue-600">{t("notesPanel.retry")}</button>
              <button disabled={working || disabled} onClick={() => openDelete(job)} className="text-red-600">{t("notesPanel.delete")}</button>
            </div>}
          </div>)}
        </div>
      </section>}
      {preview && <AttachmentPreview key={userId + ":" + preview.id} record={preview} userId={userId} downloadFile={downloadAttachment} onClose={() => {
        modal.current=false;setPreview(null); reportBusy.current?.(false);
      }} />}
      {deleting && (ConfirmDialog ? <ConfirmDialog role="alertdialog" title={t("attachments.deleteTitle")} onClose={closeDelete}>{confirmation}</ConfirmDialog> : <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onContextMenu={(event) => event.preventDefault()}>
        <section role="alertdialog" aria-modal="true" aria-labelledby="delete-attachment-title" className="bg-white rounded-xl p-6 max-w-md w-full">
          <h2 id="delete-attachment-title" className="font-semibold">{t("attachments.deleteTitle")}</h2>
          {confirmation}
        </section>
      </div>)}
    </div>
  );
}
