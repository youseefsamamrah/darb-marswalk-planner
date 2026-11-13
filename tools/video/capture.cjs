/*
 * capture.cjs — records the REAL Darb app for the demo video, scene by scene.
 *
 *   node tools/video/capture.cjs [http://localhost:8000]
 *
 * It opens the app in headless Chrome, drives the app's own guided tour (window.DarbTour.show(i), zero-based:
 * show(0) is the step the tour panel calls "1 / 10") and records only the browser page: no browser frame,
 * no desktop. Nothing is drawn over the page here: titles, captions and labels are added later by assemble.cjs.
 *
 * Honesty rules built into this script:
 *   - every scene is the live app; the only injected thing is tools/video/capture.css (sizes/visibility);
 *   - the Ask Darb question is typed into the real form and answered by the local model while recording;
 *     the answer, its timing and the model are saved in docs/video/work/capture.json;
 *   - if Ask Darb is offline or fails, the script STOPS. It never fakes or reuses an answer.
 *
 * Output (docs/video/work/takes/): s1.png (still) and s2…s7 as 30 fps JPEG sequences, plus ../capture.json.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { launch } = require("./cdp.cjs");
const { plan, WORK, FPS } = require("./timing.cjs");

const URL = (process.argv[2] || process.env.DARB_URL || "http://localhost:8000").replace(/\/$/, "");
const W = 2560, H = 1168;        // recorded page size; assemble.cjs scales it to 1920 x 876
const ZOOM = 2;                  // browser-style zoom so the interface is readable in a video (layout = 1280 x 584)
// A short route question, so the whole genuine answer can be read in a few seconds.
const QUESTION = "In one sentence: how much oxygen is left after the return?";
const TAKES = path.join(WORK, "takes");
const CSS = fs.readFileSync(path.join(__dirname, "capture.css"), "utf8");
const now = () => Date.now() / 1000;

async function main() {
  const P = plan();
  const dur = (id) => P.scenes.find((s) => s.id === id).duration;
  fs.rmSync(TAKES, { recursive: true, force: true });
  fs.mkdirSync(TAKES, { recursive: true });
  const log = { url: URL, capturedAt: new Date().toISOString(), page: { width: W, height: H, zoom: ZOOM }, takes: {}, checks: {} };
  const b = await launch({ width: W, height: H, browser: "chrome" });
  log.browser = (await b.send("Browser.getVersion")).product;
  const sleep = b.sleep;

  // ---- helpers that run inside the page -------------------------------------------------------------------
  async function openApp() {
    await b.goto(URL + "/");
    await b.waitFor(() => !!(window.Darb && Darb.grid && Darb.map && Darb.layers.rover && window.DarbTour), 20000);
    await b.evaluate((a) => {
      const s = document.createElement("style"); s.id = "captureCss"; s.textContent = a.css; document.head.appendChild(s);
      const z = document.createElement("style"); z.id = "captureZoom"; z.textContent = "html{zoom:" + a.zoom + "}"; document.head.appendChild(z);
      Darb.map.invalidateSize();
    }, { css: CSS, zoom: ZOOM });
    await b.evaluate(SCROLL_PANEL + " true");
  }
  // Scroll the side panel (and only the panel) so that an element sits `gap` px below the panel's top edge.
  // Element.scrollIntoView() is not used: it can also scroll the whole page and hide the app's top bar.
  const SCROLL_PANEL = `window.captureScrollPanel = function (el, gap) {
    var panel = document.getElementById("panel"), zoom = panel.getBoundingClientRect().width / panel.offsetWidth;
    panel.scrollTop += (el.getBoundingClientRect().top - panel.getBoundingClientRect().top) / zoom - gap;   // rectangles are zoomed, scrollTop is not
    window.scrollTo(0, 0); document.documentElement.scrollTop = 0; document.body.scrollTop = 0;
  };`;
  const setZoom = (z) => b.evaluate((z) => { document.getElementById("captureZoom").textContent = "html{zoom:" + z + "}"; Darb.map.invalidateSize(); }, z);
  // Wait until the map has stopped moving and every visible tile and image has loaded
  async function settle(extraMs) {
    await sleep(150);
    await b.waitFor(() => {
      let busy = !!Darb.map._animatingZoom || !!(Darb.map._panAnim && Darb.map._panAnim._inProgress);
      Darb.map.eachLayer((l) => { if (l._loading) busy = true; });
      document.querySelectorAll(".leaflet-popup img, .leaflet-image-layer").forEach((i) => { if (!i.complete) busy = true; });
      return !busy;
    }, 30000);
    await sleep(extraMs === undefined ? 350 : extraMs);
  }
  const rectOf = (selector) => b.evaluate((sel) => {
    const e = document.querySelector(sel); if (!e) return null;
    const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, selector);
  const appState = () => b.evaluate(() => ({
    zoom: Darb.map.getZoom(), hud: document.body.classList.contains("hud-on"),
    layers: ["lySlope", "lyRough", "lyThermal", "lyMinerals", "lyMola", "lyRover"].filter((id) => document.getElementById(id).checked),
    crism: document.getElementById("crismSelect").value,
    stats: Darb.stats && { distanceKm: +(Darb.stats.distanceM / 1000).toFixed(2), hoursOut: Darb.stats.hoursOut, o2ReservePct: Math.round(Darb.stats.o2ReservePct), safety: Darb.stats.safety, reasons: Darb.stats.reasons },
    card: document.getElementById("routeCard").classList.contains("hidden") ? null : document.getElementById("routeCard").innerText,
    delayText: document.querySelector(".delay").textContent
  }));

  // ---- screen recording -------------------------------------------------------------------------------------
  let sink = null;
  b.on("Page.screencastFrame", (e) => {
    if (sink) {
      const file = path.join(sink.dir, "raw-" + String(sink.frames.length).padStart(5, "0") + ".jpg");
      fs.writeFileSync(file, Buffer.from(e.data, "base64"));
      sink.frames.push({ file, t: e.metadata.timestamp });
    }
    b.send("Page.screencastFrameAck", { sessionId: e.sessionId }).catch(() => {});
  });

  /**
   * Record one scene. `actions` = [{at: seconds after the scene starts, name, run: async fn}].
   * The recording runs in real time; afterwards the frames are laid onto an exact 30 fps grid by their timestamps
   * (each output frame = the newest picture the browser had drawn at that instant). Nothing is sped up or slowed down.
   */
  async function take(id, seconds, actions) {
    const dir = path.join(TAKES, "s" + id); fs.mkdirSync(dir, { recursive: true });
    sink = { dir, frames: [] };
    await b.send("Page.startScreencast", { format: "jpeg", quality: 93, everyNthFrame: 1 });
    await sleep(300);
    if (!sink.frames.length) throw new Error("scene " + id + ": the browser sent no picture");
    const t0 = now();
    const events = [];
    for (const a of (actions || []).slice().sort((x, y) => x.at - y.at)) {
      const wait = t0 + a.at - now(); if (wait > 0) await sleep(wait * 1000);
      const started = now() - t0;
      const result = await a.run(t0);
      events.push({ name: a.name, planned: +a.at.toFixed(3), at: +started.toFixed(3), done: +(now() - t0).toFixed(3), result });
    }
    const rest = t0 + seconds + 0.2 - now(); if (rest > 0) await sleep(rest * 1000);
    await b.send("Page.stopScreencast");
    const frames = sink.frames; sink = null;
    const n = Math.round(seconds * FPS);
    let j = 0, unique = 0, last = -1;
    for (let k = 0; k < n; k++) {
      const t = t0 + k / FPS;
      while (j + 1 < frames.length && frames[j + 1].t <= t) j++;
      if (j !== last) { unique++; last = j; }
      fs.copyFileSync(frames[j].file, path.join(dir, "f-" + String(k).padStart(5, "0") + ".jpg"));
      // the first video frame that shows a picture drawn AFTER an action started = where its result becomes visible
      events.forEach((e) => { if (e.firstFrame === undefined && frames[j].t >= t0 + e.at) e.firstFrame = k; });
    }
    events.forEach((e) => { if (e.at === 0) e.firstFrame = 0; });
    frames.forEach((f) => fs.rmSync(f.file));
    const pageScroll = await b.evaluate(() => Math.abs(window.scrollY) + Math.abs(document.documentElement.scrollTop) + Math.abs(document.body.scrollTop));
    if (pageScroll) throw new Error("scene " + id + ": the page itself was scrolled (" + pageScroll + " px), the top bar would be cut off");
    log.takes["s" + id] = Object.assign(log.takes["s" + id] || {}, { seconds, frames: n, browserFrames: frames.length, distinctFramesUsed: unique, events, state: await appState() });
    console.log("scene " + id + ": " + n + " frames (" + frames.length + " pictures from the browser, " + unique + " distinct used)");
    return events;
  }

  // ---- 1. Ask Darb must really work: warm the model up through the app's own tour ---------------------------
  await openApp();
  await b.evaluate(async () => { await AskDarb.checkStatus(); });
  let ai = await b.evaluate(() => ({ online: AskDarb.state.online, model: AskDarb.state.model, ollama: DARB_CONFIG.ollamaUrl }));
  if (!ai.online) throw new Error("STOP: Ask Darb is offline (Ollama is not answering at " + ai.ollama + "). Nothing was recorded.");
  await b.evaluate(() => { DarbTour.open(); DarbTour.show(8); });      // tour step "9 / 10" asks its own question once
  await b.waitFor(() => document.querySelectorAll(".bubble.ai").length > 0, 30000);
  await b.waitFor(() => !Darb.aiBusy, 180000);
  const warm = await b.evaluate(() => ({ log: Darb.aiLog, chat: document.getElementById("chat").innerText, online: AskDarb.state.online }));
  if (!warm.online || !warm.log.length) throw new Error("STOP: the Ask Darb warm-up question failed: " + warm.chat);
  log.askDarb = { model: ai.model, warmUp: { how: "DarbTour.show(8): the tour's own automatic question, asked before recording to load the model", question: warm.log[0].question, seconds: warm.log[0].seconds, firstWordsSeconds: warm.log[0].firstToken, chat: warm.chat } };
  console.log("Ask Darb warm-up OK (" + ai.model + ", " + warm.log[0].seconds + " s)");

  // ---- 2. Fresh page for the recording (empty chat), then visit every scene once so all map tiles are loaded --
  await openApp();
  await b.waitFor(async () => { await AskDarb.checkStatus(); return AskDarb.state.online; }, 20000);
  await b.evaluate(() => DarbTour.open());
  await settle();
  const boxCentre = await b.evaluate(() => { const g = Darb.grid.bounds; return [(g.south + g.north) / 2, (g.west + g.east) / 2]; });
  const thermalOn = () => b.evaluate(() => {      // the real check boxes: rough ground off, THEMIS on
    if (document.getElementById("lyRough").checked) document.getElementById("lyRough").click();
    if (!document.getElementById("lyThermal").checked) document.getElementById("lyThermal").click();
  });
  const showPhoto = async () => {
    await b.evaluate(() => DarbTour.show(5)); await settle(500);
    // the popup must be completely inside the map: pan the map if the tour left it partly outside
    const dy = await b.evaluate(() => {
      const p = document.querySelector(".leaflet-popup").getBoundingClientRect(), m = document.getElementById("map").getBoundingClientRect();
      const zoom = m.width / document.getElementById("map").clientWidth;
      return (p.top - (m.top + 14 * zoom)) / zoom;
    });
    if (dy < 0) { await b.evaluate((d) => { Darb.map.panBy([0, d], { animate: false }); }, Math.floor(dy)); await settle(300); }
  };
  const visits = [() => b.evaluate((c) => { Darb.map.setView(c, 11, { animate: false }); }, boxCentre), () => b.evaluate(() => DarbTour.show(0)),
    () => b.evaluate(() => DarbTour.show(1)), () => b.evaluate(() => DarbTour.show(2)), thermalOn, () => b.evaluate(() => DarbTour.show(3)),
    () => b.evaluate(() => DarbTour.show(4)), showPhoto, () => b.evaluate(() => DarbTour.show(7))];
  for (const visit of visits) { await visit(); await settle(600); }
  await b.evaluate(() => DarbTour.show(0)); await settle();

  // ---- Scene 1: opening. The tour's opening map state in a large window at 100 % zoom, so the terrain is sharp. ----
  await setZoom(1);
  await b.evaluate(() => { document.getElementById("panel").scrollTop = 0; DarbTour.show(0); });
  await settle(900);
  await b.screenshot(path.join(TAKES, "s1.png"));
  log.takes.s1 = { still: "s1.png", map: await rectOf("#map"), state: await appState(), note: "tour step 1/10 (DarbTour.show(0)), page zoom 100 %, one still frame" };
  console.log("scene 1: still (map zoom " + log.takes.s1.state.zoom + ")");
  await setZoom(ZOOM);

  // ---- Scene 2: the whole app. Start one zoom level closer, then the tour's opening step frames the study area. ----
  await b.evaluate(() => DarbTour.show(0)); await settle(400);
  await b.evaluate((c) => { Darb.map.setView(c, 11, { animate: false }); }, boxCentre);
  await settle(700);
  await take(2, dur(2), [{ at: 0.30, name: "tour step 1 (DarbTour.show(0)): map frames the study area", run: () => b.evaluate(() => DarbTour.show(0)) }]);
  log.takes.s2.delayRect = await rectOf(".delay");

  // ---- Scene 3: data layers. slope -> rough ground -> THEMIS (real check box) -> CRISM minerals. ----
  await b.evaluate(() => DarbTour.show(1)); await settle(700);
  const d3 = dur(3);
  await take(3, d3, [
    { at: 0, name: "layer:slope", run: async () => "tour step 2 (DarbTour.show(1)) already on screen" },
    { at: d3 * 0.24, name: "layer:rough", run: () => b.evaluate(() => DarbTour.show(2)) },
    { at: d3 * 0.49, name: "layer:thermal", run: thermalOn },
    { at: d3 * 0.74, name: "layer:minerals", run: () => b.evaluate(() => DarbTour.show(3)) }
  ]);

  // ---- Scene 4: the route. Tour step 5 plans the demo route; the panel is scrolled to the route card. ----
  await b.evaluate(() => { DarbTour.show(1); document.getElementById("panel").scrollTop = 0; }); await settle(700);
  await take(4, dur(4), [{ at: 0.12, name: "tour step 5 (DarbTour.show(4)): demo route + route card", run: () => b.evaluate(() => {
    DarbTour.show(4); captureScrollPanel(document.getElementById("routeMsg"), 6);
    return document.getElementById("routeMsg").textContent;
  }) }]);
  log.takes.s4.o2Rect = await b.evaluate(() => {
    const dd = document.getElementById("stO2").getBoundingClientRect(), dt = document.getElementById("stO2").previousElementSibling.getBoundingClientRect();
    return { x: dt.x, y: Math.min(dt.y, dd.y), w: dd.right - dt.x, h: Math.max(dt.bottom, dd.bottom) - Math.min(dt.y, dd.y) };
  });
  log.takes.s4.cardRect = await rectOf("#routeCard");

  // ---- Scene 5: the real Curiosity photo (tour step 6 opens the popup of stop 6). ----
  await showPhoto();
  await take(5, dur(5), []);
  log.takes.s5.photoRect = await rectOf(".leaflet-popup img");
  log.takes.s5.popupRect = await rectOf(".leaflet-popup");
  log.takes.s5.popupText = await b.evaluate(() => document.querySelector(".leaflet-popup-content").innerText.split("\n").slice(0, 4).join(" | "));
  log.takes.s5.photo = await b.evaluate(() => { const i = document.querySelector(".leaflet-popup img"); return { src: i.getAttribute("src"), natural: [i.naturalWidth, i.naturalHeight], shown: [i.clientWidth, i.clientHeight], alt: i.alt }; });

  // ---- Scene 6: helmet HUD walk simulation (tour step 8). Recording starts once the visor view has settled. ----
  await b.evaluate(() => DarbTour.show(7));
  await sleep(750);
  const hud = () => b.evaluate(() => ["hudDist", "hudO2", "hudSlope", "hudDelay"].map((id) => document.getElementById(id).textContent).concat(document.getElementById("hudWarn").textContent).join(" | "));
  const d6 = dur(6);
  await take(6, d6, [{ at: 0, name: "hud:start", run: hud }, { at: d6 / 2, name: "hud:middle", run: hud }, { at: d6 - 0.05, name: "hud:end", run: hud }]);

  // ---- Scene 7: Ask Darb. Same state as tour step 9 (route + Ask Darb card); the question is typed into the real form. ----
  await b.evaluate(() => { DarbTour.show(4); captureScrollPanel(document.querySelector(".card.ask"), 8);
    document.getElementById("askInput").focus({ preventScroll: true }); });
  await settle(700);
  ai = await b.evaluate(async () => { await AskDarb.checkStatus(); return { online: AskDarb.state.online, model: AskDarb.state.model, before: Darb.aiLog.length, bubbles: document.querySelectorAll(".bubble").length }; });
  if (!ai.online) throw new Error("STOP: Ask Darb went offline before scene 7.");
  if (ai.bubbles !== 0) throw new Error("STOP: the chat is not empty before scene 7.");
  const typeAt = 0.25, perChar = 0.021, enterAt = typeAt + QUESTION.length * perChar + 0.22;
  const ev7 = await take(7, dur(7), [
    { at: typeAt, name: "type question", run: async () => { for (const ch of QUESTION) { await b.send("Input.insertText", { text: ch }); await sleep(perChar * 1000 - 4); } return QUESTION; } },
    { at: enterAt, name: "press Enter", run: async () => {
      const key = { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };
      await b.send("Input.dispatchKeyEvent", Object.assign({ type: "keyDown", text: "\r" }, key));
      await b.send("Input.dispatchKeyEvent", Object.assign({ type: "keyUp" }, key));
      // leave the text box, so the browser does not scroll the panel to follow the (now empty) box
      return b.evaluate(() => { document.getElementById("askInput").blur(); return "panel scroll " + document.getElementById("panel").scrollTop; });
    } },
    { at: enterAt + 0.02, name: "answer", run: async (t0) => {         // watch the real answer arrive; nothing is changed
      const seen = {};
      for (;;) {
        const s = await b.evaluate(() => { const a = document.querySelectorAll(".bubble.ai"), last = a[a.length - 1];
          return { user: document.querySelectorAll(".bubble.user").length, text: last ? last.childNodes[0].textContent : "", busy: !!Darb.aiBusy, scroll: document.getElementById("panel").scrollTop }; });
        const t = +(now() - t0).toFixed(3);
        if (seen.panelScrollStart === undefined) seen.panelScrollStart = s.scroll;
        seen.panelScrollEnd = s.scroll;
        if (s.user && seen.asked === undefined) seen.asked = t;
        if (s.text && s.text !== "Thinking locally…" && seen.firstWords === undefined) seen.firstWords = t;
        if (seen.asked !== undefined && !s.busy) { seen.finished = t; return seen; }
        if (t > 60) throw new Error("STOP: Ask Darb did not finish within 60 s.");
        await sleep(25);
      }
    } }
  ]);
  const answer = await b.evaluate(() => {
    const a = document.querySelector(".bubble.ai"), u = document.querySelector(".bubble.user"), panel = document.getElementById("panel").getBoundingClientRect();
    const r = a.getBoundingClientRect(), q = u.getBoundingClientRect();
    return { question: u.textContent, answer: a.childNodes[0].textContent, meta: a.querySelector(".meta") ? a.querySelector(".meta").textContent : null,
      log: Darb.aiLog[Darb.aiLog.length - 1], logLength: Darb.aiLog.length, online: AskDarb.state.online, status: document.getElementById("aiStatus").textContent,
      fullyVisible: q.top >= panel.top && r.bottom <= panel.bottom, answerRect: { x: r.x, y: r.y, w: r.width, h: r.height }, panelBottom: panel.bottom };
  });
  const timing = ev7.find((e) => e.name === "answer").result;
  log.askDarb.recorded = Object.assign({ typedInto: "#askInput (the app's own form), submitted with the Enter key", sceneSeconds: dur(7), timelineInScene: timing }, answer);
  if (!answer.online || !answer.meta || !answer.log || answer.logLength !== ai.before + 1) throw new Error("STOP: Ask Darb did not answer successfully during the recording: " + answer.answer);
  log.checks.answerFinishedInsideScene = timing.finished < dur(7) - 1.0;
  log.checks.answerFullyVisible = answer.fullyVisible;
  console.log("Ask Darb: \"" + answer.question + "\" -> " + answer.answer.split(/\s+/).length + " words, " + answer.meta);
  console.log("  first words at " + timing.firstWords + " s, finished at " + timing.finished + " s of a " + dur(7).toFixed(2) + " s scene; fully visible: " + answer.fullyVisible);

  log.pageErrors = b.pageErrors; log.consoleProblems = b.consoleLines;
  log.externalHosts = Array.from(new Set(b.requests.filter((u) => /^https?:/.test(u) && !u.startsWith(URL)).map((u) => u.split("/").slice(0, 3).join("/"))));
  log.plan = { total: P.total, scenes: P.scenes.map((s) => ({ id: s.id, start: s.start, duration: s.duration })) };
  fs.writeFileSync(path.join(WORK, "capture.json"), JSON.stringify(log, null, 2));
  await b.close();
  if (log.pageErrors.length) throw new Error("The app reported errors while recording: " + log.pageErrors.join(" / "));
  if (!log.checks.answerFinishedInsideScene) throw new Error("The Ask Darb answer finished too late in scene 7 to be read. Re-run, or give scene 7 more time in script.json.");
  if (!log.checks.answerFullyVisible) throw new Error("The Ask Darb answer does not fit in the visible panel. Re-run, or adjust capture.css.");
  console.log("Capture complete: " + path.join(WORK, "capture.json"));
}

main().catch((e) => { console.error(String(e.stack || e)); process.exit(1); });
