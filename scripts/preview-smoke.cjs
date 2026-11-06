const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises"), path = require("node:path"), assert = require("node:assert/strict");
const { printHtml } = require("../public/attachment-preview.cjs");
const folder = path.resolve(__dirname, "../.preview-smoke");
app.disableHardwareAcceleration();
const waitFor = async (win, expression) => {
  const end = Date.now() + 30000;
  while (Date.now() < end) {
    if (await win.webContents.executeJavaScript(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw Error("Timed out: " + expression);
};
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1200, height: 850, webPreferences: { offscreen: true, backgroundThrottling: false, nodeIntegration: true, contextIsolation: false, webSecurity: false } });
  const errors = [];
  win.webContents.on("console-message", (event) => { console.log("Renderer:", event.message); if (event.level === "error") errors.push(event.message); });
  try {
    await win.loadFile(path.join(folder, "index.html"));
    await waitFor(win, "!!document.querySelector('#open-preview')");
    await win.webContents.executeJavaScript("document.querySelector('#open-preview').click()");
    await waitFor(win, "document.querySelector('canvas')?.width > 0 && document.querySelector('canvas').getContext('2d').getImageData(20,20,1,1).data[3] > 0");
    await waitFor(win, "!document.querySelector('[role=\"status\"]') && !document.querySelector('[role=\"alert\"]')");
    await new Promise((resolve) => setTimeout(resolve, 350));
    await fs.writeFile(path.join(folder, "preview.png"), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript("document.querySelector('[data-pdf-page=\"2\"]').scrollIntoView()");
    await waitFor(win, "document.querySelector('[aria-label=\"Page\"]').value === '2'");
    await win.webContents.executeJavaScript("document.querySelector('[aria-label=\"Print\"]').click()");
    await waitFor(win, "!!window.smokePrint");
    const payload = await win.webContents.executeJavaScript("window.smokePrint");
    assert.equal(payload.pages.length, 2);
    const printed = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
    const file = path.join(folder, "print.html"); await fs.writeFile(file, printHtml(payload.pages));
    await printed.loadFile(file);
    await printed.webContents.executeJavaScript("Promise.all([...document.images].map(image => image.decode()))");
    const bytes = await printed.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true });
    await fs.writeFile(path.join(folder, "printed.pdf"), bytes); printed.destroy();
    const count = await win.webContents.executeJavaScript("window.inspectPrinted(" + JSON.stringify(Array.from(bytes)) + ")");
    assert.equal(count, 2, "print output should contain both PDF pages");
    await win.webContents.executeJavaScript("document.querySelector('[aria-label=\"Download original\"]').click()");
    await waitFor(win, "window.smokeSavedBytes > 0");
    await win.webContents.executeJavaScript("document.querySelector('[aria-label=\"Close\"]').click()");
    await waitFor(win, "!document.querySelector('[role=\"dialog\"]')");
    assert.equal(await win.webContents.executeJavaScript("document.querySelector('textarea').value"), "Unsaved note draft");
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ pdfPages: 2, printedPages: count, draftPreserved: true, rendererErrors: errors, screenshot: path.join(folder, "preview.png") }));
    app.exit(0);
  } catch (error) {
    console.error(error); console.error(errors);
    console.error(await win.webContents.executeJavaScript("document.body.innerText"));
    await fs.writeFile(path.join(folder, "failure.png"), (await win.webContents.capturePage()).toPNG());
    app.exit(1);
  }
});
