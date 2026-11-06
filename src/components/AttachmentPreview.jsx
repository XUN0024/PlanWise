import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDownload, faPrint, faEllipsisVertical, faXmark, faMinus, faPlus } from "@fortawesome/free-solid-svg-icons";
import { downloadAttachment } from "../services/attachmentService";
import { previewKind, previewErrorKey, savePreviewBlob, printPreviewPages } from "../lib/previewFiles";
import { attachmentDiagnostic } from "../lib/attachmentModel";

function PdfPage({ pdf, api, number, width, root, onError }) {
  const wrapper = useRef(null), canvas = useRef(null);
  const [near, setNear] = useState(number === 1);
  const [ratio, setRatio] = useState(1.414);
  useEffect(() => {
    if (!root || typeof IntersectionObserver === "undefined") { setNear(true); return; }
    const observer = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), { root, rootMargin: "500px" });
    observer.observe(wrapper.current);
    return () => observer.disconnect();
  }, [root, number]);
  useEffect(() => {
    if (!near) return;
    const abort = new AbortController();
    const target = document.createElement("canvas");
    target.style.cssText = "display:block;width:100%;height:100%";
    canvas.current.appendChild(target);
    pdf.getPage(number).then((page) => {
      if (abort.signal.aborted) return;
      const size = page.getViewport({ scale: 1 }); setRatio(size.height / size.width);
      return api.renderPdfCanvas(pdf, number, target, width / size.width * Math.min(window.devicePixelRatio || 1, 2), abort.signal);
    }).catch((error) => { if (!abort.signal.aborted) onError(error); })
      .finally(() => { if (abort.signal.aborted) target.width = target.height = 0; });
    return () => { abort.abort(); target.remove(); };
  }, [pdf, api, number, width, near, onError]);
  return <div ref={wrapper} data-pdf-page={number} aria-label={`Page ${number}`} className="bg-white shadow-lg mx-auto mb-5 shrink-0"
    style={{ width, height: width * ratio }}>
    {near && <div ref={canvas} className="w-full h-full" />}
  </div>;
}

function PdfReader({ source, page, setPage, zoom, fit, onError }) {
  const scroll = useRef(null);
  const [width, setWidth] = useState(800);
  const [root, setRoot] = useState(null);
  const jump = useRef(page);
  useEffect(() => {
    setRoot(scroll.current);
    const update = () => setWidth(Math.max(200, scroll.current.clientWidth - 48));
    update();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    observer?.observe(scroll.current); window.addEventListener("resize", update);
    return () => { observer?.disconnect(); window.removeEventListener("resize", update); };
  }, []);
  useEffect(() => {
    if (jump.current === page) return;
    jump.current = page;
    scroll.current.querySelector(`[data-pdf-page="${page}"]`)?.scrollIntoView({ block: "start" });
  }, [page]);
  const visible = React.useCallback((number) => { jump.current = number; setPage(number); }, [setPage]);
  return <div ref={scroll} className="flex-1 min-h-0 overflow-auto p-6 bg-gray-700" onScroll={(event) => {
    const container = event.currentTarget, bounds = container.getBoundingClientRect();
    const line = bounds.top + Math.min(80, bounds.height / 3);
    let low = 0, high = container.children.length - 1;
    while (low < high) { const mid = (low + high) >> 1; if (container.children[mid].getBoundingClientRect().bottom < line) low = mid + 1; else high = mid; }
    if (container.children[low]) visible(Number(container.children[low].dataset.pdfPage));
  }}>
    {Array.from({ length: source.pdf.numPages }, (_, i) => <PdfPage key={i + 1} pdf={source.pdf} api={source.api}
      number={i + 1} width={fit ? width : source.width * zoom} root={root} onError={onError} />)}
  </div>;
}

export default function AttachmentPreview({ record, userId, onClose }) {
  const { t } = useTranslation();
  const panel = useRef(null), controls = useRef(null);
  const [blob, setBlob] = useState(null), [source, setSource] = useState(null);
  const [error, setError] = useState(null), [actionError, setActionError] = useState(null);
  const [loading, setLoading] = useState(true), [reload, setReload] = useState(0);
  const [page, setPage] = useState(1), [pageInput, setPageInput] = useState("1");
  const [zoom, setZoom] = useState(1), [fit, setFit] = useState(true);
  const [action, setAction] = useState(null), [progress, setProgress] = useState("");
  const live = useRef(true), printController = useRef(null), closeRef = useRef(onClose);
  closeRef.current = onClose;
  const kind = previewKind(record);
  useEffect(() => {
    live.current = true;
    const previous = document.activeElement, previousOverflow = document.body.style.overflow;
    const app = document.getElementById("root"), previousInert = app?.inert;
    if (app && !app.contains(panel.current)) app.inert = true;
    document.body.style.overflow = "hidden";
    controls.current?.focus();
    const keyboard = (event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeRef.current(); }
      if (event.key === "Tab") {
        const nodes = [...panel.current.querySelectorAll("button:not(:disabled),input:not(:disabled)")];
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && (document.activeElement === first || !panel.current.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !panel.current.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", keyboard, true);
    return () => {
      live.current = false; printController.current?.abort();
      window.planwiseAttachments?.cancelPrint();
      document.removeEventListener("keydown", keyboard, true); document.body.style.overflow = previousOverflow;
      if (app) app.inert = previousInert;
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  useEffect(() => {
    const abort = new AbortController(); let pdfTask, url;
    setLoading(true); setError(null); setBlob(null); setSource(null);
    setPage(1); setZoom(1); setFit(true);
    (async () => {
      try {
        if (record.status !== "ready") throw Error("Attachment not ready");
        const file = await downloadAttachment(record, userId, { signal: abort.signal });
        if (abort.signal.aborted) return;
        setBlob(file);
        if (kind === "pdf") {
          const api = await import("../lib/pdfPreview");
          if (abort.signal.aborted) return;
          const bytes = new Uint8Array(await file.arrayBuffer());
          if (abort.signal.aborted) return;
          pdfTask = api.openPreviewPdf(bytes);
          const pdf = await pdfTask.promise;
          if (abort.signal.aborted) return;
          const first = await pdf.getPage(1);
          if (!abort.signal.aborted) {
            const next = { pdf, api, width: first.getViewport({ scale: 1 }).width };
            setSource(next);
          }
        } else if (kind === "image") {
          // Raster images only: don't embed arbitrary uploaded HTML or SVG.
          url = URL.createObjectURL(file); setSource({ url });
        }
      } catch (failure) { if (!abort.signal.aborted) { console.warn("Attachment preview failed", JSON.stringify(attachmentDiagnostic(failure))); setError(previewErrorKey(failure)); } }
      finally { if (!abort.signal.aborted) setLoading(false); }
    })();
    return () => { abort.abort(); if (pdfTask) Promise.resolve(pdfTask.destroy()).catch(() => {}); if (url) URL.revokeObjectURL(url); };
  }, [record.id, userId, reload, kind]);
  useEffect(() => setPageInput(String(page)), [page]);
  const renderError = React.useCallback((failure) => setError(previewErrorKey(failure)), []);
  const save = async () => {
    if (!blob || action) return;
    setAction("save"); setActionError(null);
    try { await savePreviewBlob(blob, record.original_name); }
    catch { if (live.current) setActionError("preview.downloadError"); }
    finally { if (live.current) setAction(null); }
  };
  const print = async () => {
    if (action || !source) return;
    const abort = new AbortController(); printController.current = abort;
    setAction("print"); setActionError(null); setProgress("");
    try {
      let pages;
      if (kind === "pdf") pages = await source.api.pdfPrintPages(source.pdf, abort.signal, (n, total) => {
        if (!abort.signal.aborted) setProgress(`${n} / ${total}`);
      });
      else {
        const image = new Image(); image.src = source.url; await image.decode();
        if (abort.signal.aborted) return;
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, Math.sqrt(8000000 / (image.naturalWidth * image.naturalHeight)));
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
        pages = [{ width: image.naturalWidth > image.naturalHeight ? 842 : 595, height: image.naturalWidth > image.naturalHeight ? 595 : 842, dataUrl: canvas.toDataURL("image/png") }];
        canvas.width = canvas.height = 0;
      }
      if (!abort.signal.aborted) await printPreviewPages(pages, record.original_name, abort.signal);
    } catch (failure) { if (!abort.signal.aborted && live.current) setActionError(failure.message === "PRINT_TOO_LARGE" ? "preview.printTooLarge" : "preview.printError"); }
    finally { if (live.current && printController.current === abort) { setAction(null); setProgress(""); } }
  };
  const icon = (name, symbol, click, disabled, ref) => <button ref={ref} type="button" title={t(name)} aria-label={t(name)} disabled={disabled}
    onClick={click} className="p-2 rounded hover:bg-gray-600 focus-visible:ring-2 focus-visible:ring-blue-300 disabled:opacity-35"><FontAwesomeIcon icon={symbol} /></button>;
  return createPortal(<div className="fixed inset-0 z-[70] bg-black/65 flex items-center justify-center p-2 sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={panel} role="dialog" aria-modal="true" aria-labelledby="preview-title" className="flex flex-col w-full max-w-7xl h-[92vh] bg-gray-800 text-white rounded-xl shadow-2xl overflow-hidden">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-gray-600">
        <h2 id="preview-title" className="flex-1 truncate min-w-0 text-sm font-medium" title={record.original_name}>{record.original_name}</h2>
        {icon("preview.download", faDownload, save, !blob || !!action)}
        {icon("preview.print", faPrint, print, loading || !!error || !source || !!action || kind === "unsupported")}
        {icon("preview.more", faEllipsisVertical, undefined, true)}
        {icon("notesPanel.close", faXmark, onClose, false, controls)}
      </header>
      {kind !== "unsupported" && <div className="flex flex-wrap justify-center gap-3 items-center px-3 py-2 text-sm bg-gray-900/50">
        {source?.pdf && <label className="flex items-center gap-2">{t("preview.page")}
          <input type="number" min="1" max={source.pdf.numPages} value={pageInput} aria-label={t("preview.page")}
            onChange={(event) => setPageInput(event.target.value)} onBlur={() => { const next = Number(pageInput); setPage(Number.isInteger(next) ? Math.max(1, Math.min(source.pdf.numPages, next)) : page); setPageInput(String(Number.isInteger(next) ? Math.max(1, Math.min(source.pdf.numPages, next)) : page)); }}
            onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} className="w-16 bg-gray-700 rounded px-2 py-1" />
          <span>/ {source.pdf.numPages}</span>
        </label>}
        {icon("preview.zoomOut", faMinus, () => { setFit(false); setZoom((n) => Math.max(.25, +(n - .25).toFixed(2))); }, !source || zoom <= .25)}
        <span>{fit ? t("preview.fit") : Math.round(zoom * 100) + "%"}</span>
        {icon("preview.zoomIn", faPlus, () => { setFit(false); setZoom((n) => Math.min(3, +(n + .25).toFixed(2))); }, !source || zoom >= 3)}
        <button type="button" disabled={!source} onClick={() => setFit(true)} className="underline disabled:opacity-35">{t("preview.fit")}</button>
      </div>}
      {action === "print" && <p role="status" className="text-xs text-center py-2">{t("preview.preparingPrint")} {progress}</p>}
      {actionError && <p role="alert" className="bg-red-950 text-red-100 p-3 text-sm">{t(actionError)}</p>}
      {loading ? <p role="status" className="m-auto p-8">{t("preview.loading")}</p>
        : error ? <div role="alert" className="m-auto p-8 text-center"><p>{t(error)}</p><button type="button" onClick={() => setReload((n) => n + 1)} className="mt-4 underline">{t("notesPanel.retry")}</button></div>
        : kind === "pdf" && source ? <PdfReader source={source} page={page} setPage={setPage} zoom={zoom} fit={fit} onError={renderError} />
        : kind === "image" && source ? <div className="flex-1 min-h-0 overflow-auto p-6 bg-gray-700 text-center">
          <img src={source.url} alt={record.original_name} onError={() => setError("preview.invalidImage")}
            onLoad={(event) => { const width = event.currentTarget.naturalWidth; setSource((value) => ({ ...value, width })); }}
            className={fit ? "max-w-full max-h-full object-contain inline-block" : "inline-block max-w-none"}
            style={fit ? undefined : { width: source.width * zoom }} />
        </div> : <p className="m-auto p-8 text-center">{t("preview.unsupported")}</p>}
    </section>
  </div>, document.body);
}
