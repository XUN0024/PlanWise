export async function downloadAttachment(_record, _userId, { signal } = {}) {
  if (signal?.aborted) throw Error("Aborted");
  return new Blob([Uint8Array.from(atob(__PREVIEW_FIXTURE__), (c) => c.charCodeAt(0))], { type: "application/pdf" });
}
