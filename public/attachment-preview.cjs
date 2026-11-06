const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

function validatePages(pages) {
  if (!Array.isArray(pages) || !pages.length || pages.length > 1000) throw Error("Invalid print pages");
  let total = 0;
  for (const page of pages) {
    if (!Number.isFinite(page.width) || !Number.isFinite(page.height) || page.width < 1 || page.height < 1
      || page.width > 20000 || page.height > 20000 || typeof page.dataUrl !== "string"
      || !/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(page.dataUrl)) throw Error("Invalid print page");
    total += page.dataUrl.length;
    if (total > 128 * 1024 * 1024) throw Error("PRINT_TOO_LARGE");
  }
  return pages;
}
function printHtml(pages) {
  validatePages(pages);
  return `<!doctype html><html><head><meta charset="utf-8"><title>PlanWise attachment</title>
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
    <style>@page{size:${pages[0].width}pt ${pages[0].height}pt;margin:0}html,body{margin:0;padding:0}
    .sheet{overflow:hidden;break-after:page}.sheet:last-child{break-after:auto}img{display:block;width:100%;height:100%;object-fit:contain}</style></head>
    <body>${pages.map((p) => `<div class="sheet" style="width:${pages[0].width}pt;height:calc(${pages[0].height}pt - 1px)"><img src="${p.dataUrl}"></div>`).join("")}</body></html>`;
}
function registerAttachmentPreview({ ipcMain, BrowserWindow, dialog }, owner) {
  let printing = null, saving = false;
  const assertSender = (event) => {
    if (event.sender !== owner.webContents || event.senderFrame !== owner.webContents.mainFrame) throw Error("Invalid preview sender");
  };
  const cancelPrint = () => { if (printing && !printing.isDestroyed()) printing.destroy(); };
  ipcMain.handle("attachment-preview:cancel-print", (event) => { assertSender(event); cancelPrint(); });
  ipcMain.handle("attachment-preview:save", async (event, payload) => {
    assertSender(event);
    if (saving) throw Error("Save already active");
    const bytes = payload?.bytes;
    if (!(bytes instanceof Uint8Array) || bytes.length > 15 * 1024 * 1024) throw Error("Invalid attachment bytes");
    const name = String(payload.name || "attachment").replace(/[\\/:*?"<>|\x00-\x1F]/g, "_").slice(0, 255);
    saving = true;
    try {
      const result = await dialog.showSaveDialog(owner, { defaultPath: name, title: "Save attachment" });
      if (result.canceled || !result.filePath) return { cancelled: true };
      await fs.writeFile(result.filePath, bytes); return { cancelled: false };
    } finally { saving = false; }
  });
  ipcMain.handle("attachment-preview:print", async (event, payload) => {
    assertSender(event);
    if (printing) throw Error("Print already active");
    const html = printHtml(payload?.pages);
    const win = new BrowserWindow({ parent: owner, show: false, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
    printing = win; let folder;
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.webContents.on("will-navigate", (e) => e.preventDefault());
    try {
      folder = await fs.mkdtemp(path.join(os.tmpdir(), "planwise-print-"));
      const file = path.join(folder, "print.html"); await fs.writeFile(file, html);
      if (win.isDestroyed()) return { cancelled: true };
      await win.loadFile(file);
      await win.webContents.executeJavaScript("Promise.all([...document.images].map(image => image.decode()))");
      if (win.isDestroyed()) return { cancelled: true };
      return await new Promise((resolve, reject) => {
        win.once("closed", () => resolve({ cancelled: true }));
        win.webContents.print({ silent: false, printBackground: true, margins: { marginType: "none" },
          pageSize: { width: Math.round(payload.pages[0].width / 72 * 25400), height: Math.round(payload.pages[0].height / 72 * 25400) } }, (success, reason) => {
          if (success) resolve({ cancelled: false });
          else if (/cancel/i.test(reason)) resolve({ cancelled: true });
          else reject(Error(reason || "Print failed"));
        });
      });
    } finally {
      if (!win.isDestroyed()) win.destroy();
      if (printing === win) printing = null;
      // Only these two paths were created by this invocation; no recursive delete.
      if (folder) { await fs.unlink(path.join(folder, "print.html")).catch(() => {}); await fs.rmdir(folder).catch(() => {}); }
    }
  });
  owner.once("closed", () => {
    cancelPrint();
    for (const channel of ["save", "print", "cancel-print"]) ipcMain.removeHandler("attachment-preview:" + channel);
  });
}
module.exports = { validatePages, printHtml, registerAttachmentPreview };
