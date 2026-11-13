/*
 * cdp.cjs — a very small Chrome DevTools Protocol client (no npm packages needed).
 * Used by the demo-video scripts to drive the REAL Darb app in a headless browser.
 * Needs Node 22+ (built-in WebSocket) and a Chromium/Chrome executable.
 */
"use strict";
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Where to find a browser. DARB_CHROME wins. "chrome" = the installed Google Chrome (uses the graphics card,
// so screen recording is smooth); "shell" = the small headless Chromium from the Playwright cache.
function findChrome(prefer) {
  const installed = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"];
  const shells = [];
  const pw = path.join(process.env.LOCALAPPDATA || "", "ms-playwright");
  if (fs.existsSync(pw)) {
    fs.readdirSync(pw).filter((d) => d.startsWith("chromium_headless_shell-")).sort().reverse().forEach((d) =>
      shells.push(path.join(pw, d, "chrome-headless-shell-win64", "chrome-headless-shell.exe")));
  }
  const order = [process.env.DARB_CHROME].concat(prefer === "shell" ? shells.concat(installed) : installed.concat(shells));
  const hit = order.find((c) => c && fs.existsSync(c));
  if (!hit) throw new Error("No Chrome found. Set DARB_CHROME to a chrome.exe path.");
  return hit;
}

async function launch(opts) {
  const width = opts.width, height = opts.height;
  const exe = findChrome(opts.browser);
  const isShell = /headless-shell/i.test(exe);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "darb-video-"));
  const args = [isShell ? "--headless" : "--headless=new"]
    .concat(isShell ? [] : ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"])
    .concat(["--remote-debugging-port=0", "--user-data-dir=" + profile,
      "--window-size=" + width + "," + height, "--force-device-scale-factor=1", "--hide-scrollbars",
      "--force-color-profile=srgb", "--no-first-run", "--no-default-browser-check", "--mute-audio",
      "--disable-extensions", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "about:blank"]);
  const child = spawn(exe, args, { stdio: ["ignore", "ignore", "pipe"] });
  const wsUrl = await new Promise((resolve, reject) => {
    let buf = "";
    const timer = setTimeout(() => reject(new Error("Chrome did not start: " + buf)), 20000);
    child.stderr.on("data", (d) => {
      buf += d;
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) { clearTimeout(timer); resolve(m[1]); }
    });
    child.on("exit", (c) => reject(new Error("Chrome exited early (" + c + "): " + buf)));
  });
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("CDP socket failed")); });
  let nextId = 1;
  const pending = new Map(), listeners = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id);
      if (msg.error) p.reject(new Error(p.method + ": " + msg.error.message)); else p.resolve(msg.result);
    } else if (msg.method) listeners.forEach((l) => { if (l.method === msg.method) l.fn(msg.params, msg.sessionId); });
  };
  function rawSend(method, params, sessionId) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject, method });
      ws.send(JSON.stringify({ id, method, params: params || {}, sessionId }));
    });
  }
  const { targetId } = await rawSend("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await rawSend("Target.attachToTarget", { targetId, flatten: true });
  const send = (method, params) => rawSend(method, params, sessionId);
  const on = (method, fn) => listeners.push({ method, fn });

  const consoleLines = [], pageErrors = [], requests = [];
  on("Runtime.exceptionThrown", (p) => pageErrors.push(p.exceptionDetails.exception ? p.exceptionDetails.exception.description : p.exceptionDetails.text));
  on("Runtime.consoleAPICalled", (p) => { if (p.type === "error" || p.type === "warning") consoleLines.push(p.type + ": " + p.args.map((a) => a.value || a.description || "").join(" ")); });
  on("Network.requestWillBeSent", (p) => requests.push(p.request.url));
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });

  // Run JavaScript inside the page and return its (JSON) value. Promises are awaited.
  async function evaluate(fnOrSource, arg) {
    const expression = typeof fnOrSource === "function" ? "(" + fnOrSource.toString() + ")(" + JSON.stringify(arg === undefined ? null : arg) + ")" : fnOrSource;
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error("page: " + (r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text));
    return r.result.value;
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function waitFor(fnOrSource, timeoutMs, arg) {
    const end = Date.now() + (timeoutMs || 15000);
    for (;;) {
      if (await evaluate(fnOrSource, arg)) return;
      if (Date.now() > end) throw new Error("waitFor timed out: " + fnOrSource.toString().slice(0, 120));
      await sleep(50);
    }
  }
  async function goto(url) {
    const loaded = new Promise((res) => { const l = { method: "Page.loadEventFired", fn: () => { listeners.splice(listeners.indexOf(l), 1); res(); } }; listeners.push(l); });
    await send("Page.navigate", { url });
    await loaded;
  }
  async function screenshot(file) {
    const r = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(file, Buffer.from(r.data, "base64"));
  }
  async function close() {
    try { await rawSend("Browser.close"); } catch (e) { /* already gone */ }
    await sleep(300);
    try { child.kill(); } catch (e) { /* ignore */ }
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  }
  return { send, on, evaluate, waitFor, goto, screenshot, close, sleep, consoleLines, pageErrors, requests, exe };
}

module.exports = { launch, findChrome };
