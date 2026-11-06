const { contextBridge, ipcRenderer } = require("electron");
const bridge = Object.freeze({
  save: (payload) => ipcRenderer.invoke("attachment-preview:save", payload),
  print: (payload) => ipcRenderer.invoke("attachment-preview:print", payload),
  cancelPrint: () => ipcRenderer.invoke("attachment-preview:cancel-print").catch(() => {}),
});
if (process.contextIsolated) contextBridge.exposeInMainWorld("planwiseAttachments", bridge);
else window.planwiseAttachments = bridge;
