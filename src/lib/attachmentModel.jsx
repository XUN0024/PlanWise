export const ATTACHMENT_BUCKET = "note-attachments";
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
export const MAX_ATTACHMENT_BATCH = 5;
export const attachmentError = (code) => Object.assign(new Error(code), { code });

export const validateAttachmentBatch = (files) => {
  if (!files.length) throw attachmentError("ATTACHMENT_EMPTY");
  if (files.length > MAX_ATTACHMENT_BATCH) throw attachmentError("ATTACHMENT_TOO_MANY");
  if (files.some((file) => !Number.isFinite(file.size) || file.size < 0 || file.size > MAX_ATTACHMENT_BYTES)) {
    throw attachmentError("ATTACHMENT_TOO_LARGE");
  }
  if (files.some((file) => !file.name?.trim() || [...file.name].length > 255)) {
    throw attachmentError("ATTACHMENT_INVALID_NAME");
  }
};

export const isFileDrag = (transfer) => !!transfer && (
  Array.from(transfer.types || []).includes("Files")
  || Array.from(transfer.items || []).some((item) => item.kind === "file")
);

export const attachmentKind = (name, mime = "") => {
  const extension = name.split(".").pop().toLowerCase();
  if (mime.startsWith("image/") || /^(png|jpe?g|gif|webp|svg|bmp|heic|avif)$/.test(extension)) return "image";
  if (mime === "application/pdf" || extension === "pdf") return "pdf";
  if (/^(xlsx?|csv|ods)$/.test(extension) || /spreadsheet|excel/.test(mime)) return "spreadsheet";
  if (/^(pptx?|odp)$/.test(extension) || /presentation|powerpoint/.test(mime)) return "presentation";
  if (/^(zip|rar|7z|gz|tar)$/.test(extension) || /zip|compressed/.test(mime)) return "archive";
  if (mime.startsWith("audio/") || /^(mp3|wav|ogg|flac|m4a)$/.test(extension)) return "audio";
  if (mime.startsWith("video/") || /^(mp4|mov|avi|mkv|webm)$/.test(extension)) return "video";
  if (/^(docx?|txt|md|rtf|odt)$/.test(extension) || mime.startsWith("text/")) return "document";
  return "file";
};

export const formatAttachmentSize = (bytes) => bytes >= 1024 * 1024
  ? (bytes / (1024 * 1024)).toFixed(1) + " MB"
  : bytes >= 1024 ? (bytes / 1024).toFixed(1) + " KB" : bytes + " B";

// Expose useful failure details without rendering request headers, URLs or tokens.
export const attachmentDiagnostic = (error) => {
  let response = {};
  let body = "";
  let status = error?.status || error?.statusCode || null;
  try {
    status = error?.originalResponse?.getStatus?.() || status;
    body = error?.originalResponse?.getBody?.() || "";
    try {
      const parsed = JSON.parse(body);
      response = parsed && typeof parsed === "object" ? parsed : {};
    } catch { /* TUS can return plain text. */ }
  } catch { /* A network failure may not have a response. */ }
  const clean = (value) => String(value || "")
    .replace(/Bearer\s+[^\s"',;]+/gi, "Bearer [redacted]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/https?:\/\/[^\s"'<>]+/g, "[URL]")
    .slice(0, 500);
  return {
    stage: error?.attachmentStage || "unknown",
    transport: error?.attachmentTransport || "",
    code: clean(error?.code || response.code || response.error_code || ""),
    status,
    message: clean(response.message || response.msg || response.error || body || error?.message || "Unknown error"),
  };
};
