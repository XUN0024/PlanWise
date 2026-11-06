import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";

// Electron 37's Chromium lacks Uint8Array.toHex; use PDF.js's compatibility build.
GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();

export function openPreviewPdf(bytes) {
  const root = new URL("pdf-assets/", document.baseURI).href;
  return getDocument({ data: bytes, isEvalSupported: false,
    cMapUrl: root + "cmaps/", cMapPacked: true, standardFontDataUrl: root + "standard_fonts/", wasmUrl: root + "wasm/" });
}

export async function renderPdfCanvas(pdf, number, canvas, scale, signal) {
  if (signal?.aborted) return;
  const page = await pdf.getPage(number);
  if (signal?.aborted) return;
  const base = page.getViewport({ scale: 1 });
  const safeScale = Math.min(scale, Math.sqrt(8000000 / (base.width * base.height)));
  const viewport = page.getViewport({ scale: safeScale });
  canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
  const task = page.render({ canvasContext: canvas.getContext("2d"), viewport, background: "rgb(255,255,255)" });
  const cancel = () => task.cancel();
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) task.cancel();
  try { await task.promise; return { width: base.width, height: base.height }; }
  finally { signal?.removeEventListener("abort", cancel); }
}

export async function pdfPrintPages(pdf, signal, onProgress) {
  if (pdf.numPages > 1000) throw new Error("PRINT_TOO_LARGE");
  const pages = []; let bytes = 0;
  for (let number = 1; number <= pdf.numPages; number++) {
    if (signal.aborted) return [];
    const canvas = document.createElement("canvas");
    try {
      const size = await renderPdfCanvas(pdf, number, canvas, 2, signal);
      if (signal.aborted || !size) return [];
      const dataUrl = canvas.toDataURL("image/png"); bytes += dataUrl.length;
      if (bytes > 128 * 1024 * 1024) throw new Error("PRINT_TOO_LARGE");
      pages.push({ ...size, dataUrl }); onProgress(number, pdf.numPages);
    } finally { canvas.width = canvas.height = 0; }
  }
  return pages;
}
