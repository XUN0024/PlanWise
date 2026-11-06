const fs = require("node:fs/promises"), path = require("node:path"), http = require("node:http");
const { spawn } = require("node:child_process");
const assert = require("node:assert/strict");
const folder = path.resolve(__dirname, "../.preview-smoke");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
(async () => {
  const server = http.createServer(async (request, response) => {
    const file = path.resolve(folder, "." + new URL(request.url, "http://localhost").pathname);
    if (!file.startsWith(folder + path.sep)) { response.writeHead(403).end(); return; }
    try {
      const data = await fs.readFile(file);
      response.setHeader("Content-Type", file.endsWith(".html") ? "text/html" : /\.(m?js)$/.test(file) ? "application/javascript" : "application/octet-stream");
      response.end(data);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", "--user-data-dir=" + path.join(folder, "browser-profile"), "about:blank"], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
  let socket;
  try {
    const endpoint = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error("Chrome failed to start")), 20000);
      browser.stderr.on("data", (data) => { const match = data.toString().match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
      browser.on("error", reject);
    });
    socket = new WebSocket(endpoint); await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));
    let id = 0; const pending = new Map();
    socket.addEventListener("message", (event) => { const message = JSON.parse(event.data);
      if (message.method === "Runtime.exceptionThrown") console.error("Browser exception:", message.params.exceptionDetails.exception?.description);
      if (message.id) { const waiter = pending.get(message.id); pending.delete(message.id); message.error ? waiter.reject(Error(message.error.message)) : waiter.resolve(message.result); } });
    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const key = ++id; pending.set(key, { resolve, reject }); socket.send(JSON.stringify({ id: key, method, params, ...(sessionId ? { sessionId } : {}) })); });
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    await send("Runtime.enable", {}, sessionId);
    const evaluate = async (expression) => { const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId); if (result.exceptionDetails) throw Error(result.exceptionDetails.text + " " + result.exceptionDetails.exception?.description); return result.result.value; };
    await send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 850, deviceScaleFactor: 1, mobile: false }, sessionId);
    await send("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/index.html` }, sessionId);
    const wait = async (expression) => { const end = Date.now() + 20000; while (Date.now() < end) { if (await evaluate(expression)) return; await delay(100); } throw Error("Timed out: " + expression + "\n" + await evaluate("document.body.innerText")); };
    await wait("!!document.querySelector('#open-preview')"); await evaluate("document.querySelector('#open-preview').click()");
    await wait("document.querySelector('canvas')?.width > 0 && document.querySelector('canvas').getContext('2d').getImageData(20,20,1,1).data[3] > 0");
    await delay(300);
    const screenshot = await send("Page.captureScreenshot", {}, sessionId);
    await fs.writeFile(path.join(folder, "chrome-preview.png"), Buffer.from(screenshot.data, "base64"));
    await evaluate("document.querySelector('[data-pdf-page=\"2\"]').scrollIntoView()");
    await wait("document.querySelector('[aria-label=\"Page\"]').value === '2'");
    await evaluate("document.querySelector('[aria-label=\"Print\"]').click()");
    await wait("!!window.smokePrint"); assert.equal(await evaluate("window.smokePrint.pages.length"), 2);
    await evaluate("document.querySelector('[aria-label=\"Close\"]').click()");
    await wait("!document.querySelector('[role=\"dialog\"]')");
    assert.equal(await evaluate("document.querySelector('textarea').value"), "Unsaved note draft");
    console.log(JSON.stringify({ browser: "Chrome", pdfPages: 2, printPagesPrepared: 2, draftPreserved: true }));
    await send("Browser.close");
  } finally { if (socket) socket.close(); browser.kill(); await new Promise((resolve) => server.close(resolve)); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
