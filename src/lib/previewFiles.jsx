export function previewKind(record) {
  const mime = (record.mime_type || "").toLowerCase();
  const extension = (record.original_name || "").split(".").pop().toLowerCase();
  if (mime === "application/pdf" || extension === "pdf") return "pdf";
  if (["image/png", "image/jpeg", "image/webp"].includes(mime)
    || /^(png|jpe?g|webp)$/.test(extension)) return "image";
  return "unsupported";
}

export async function savePreviewBlob(blob, name) {
  if (window.planwiseAttachments) {
    return window.planwiseAttachments.save({ name, bytes: new Uint8Array(await blob.arrayBuffer()) });
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = name;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { cancelled: false };
}

export function printDocumentHtml(pages, title) {
  const escape = (text) => String(text).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(title)}</title>
    <style>@page{size:${pages[0].width}pt ${pages[0].height}pt;margin:0}html,body{margin:0;padding:0}
    .sheet{overflow:hidden;break-after:page}.sheet:last-child{break-after:auto}.sheet img{display:block;width:100%;height:100%;object-fit:contain}</style></head>
    <body>${pages.map((page) => `<div class="sheet" style="width:${pages[0].width}pt;height:calc(${pages[0].height}pt - 1px)"><img src="${page.dataUrl}"></div>`).join("")}</body></html>`;
}

export async function printPreviewPages(pages, title, signal) {
  if (signal.aborted) return;
  if (window.planwiseAttachments) return window.planwiseAttachments.print({ pages, title });
  const frame = document.createElement("iframe");
  frame.title = title; frame.style.cssText = "position:fixed;left:-10000px;width:1px;height:1px;border:0";
  document.body.appendChild(frame);
  const cleanup = () => { frame.remove(); signal.removeEventListener("abort", cleanup); };
  signal.addEventListener("abort", cleanup, { once: true });
  try {
    const doc = frame.contentDocument;
    doc.open(); doc.write(printDocumentHtml(pages, title)); doc.close();
    await Promise.all([...doc.images].map((image) => image.decode()));
    if (signal.aborted) { cleanup(); return; }
    frame.contentWindow.addEventListener("afterprint", cleanup, { once: true });
    frame.contentWindow.focus(); frame.contentWindow.print();
    // Retain the frame until afterprint (also on browsers where print is async).
  } catch (error) { cleanup(); throw error; }
}

export const previewErrorKey = (error) => error?.name === "PasswordException" ? "preview.password"
  : ["InvalidPDFException", "FormatError"].includes(error?.name) ? "preview.invalidPdf"
    : error?.message === "PRINT_TOO_LARGE" ? "preview.printTooLarge" : "preview.loadError";
