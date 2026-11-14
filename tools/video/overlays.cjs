/*
 * overlays.cjs — draws the EDITORIAL graphics of the demo video as transparent PNG files.
 *
 *   node tools/video/overlays.cjs
 *
 * These are the only things in the video that are not app footage: the frame bars, the AI disclosure label,
 * the captions, the small source labels, the opening and closing titles and two thin highlight outlines.
 * They are drawn with the app's own colours and font (Segoe UI) in headless Chrome and saved to
 * docs/video/work/overlays/. assemble.cjs puts them over / around the recorded footage.
 *
 * Frame layout (1920 x 1080):  top strip 56 px | app footage 1920 x 876 | caption bar 148 px
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { launch } = require("./cdp.cjs");
const { plan, WORK } = require("./timing.cjs");

const L = { W: 1920, H: 1080, TOP: 56, FOOT_H: 876, BAR_Y: 932, BAR_H: 148, PAGE_W: 2560, PAGE_H: 1168 };
const DISCLOSURE = "AI-assisted video · AI voice (TTS)";
const OUT = path.join(WORK, "overlays");

// Colours come from css/style.css (:root)
const BASE_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: transparent; overflow: hidden; }
  body { font-family: "Segoe UI", system-ui, sans-serif; color: #fff; -webkit-font-smoothing: antialiased; position: relative; }
  .abs { position: absolute; }
`;

function esc(s) { return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }

function canvasItems(P, cap) {
  const items = [];
  // 1. Frame bars + the AI disclosure. One still image for the whole video: it never moves and never fades.
  items.push({ name: "frame", html: `
    <div class="abs" style="left:0;top:0;width:${L.W}px;height:${L.TOP}px;background:#05070f;border-bottom:1px solid #24305e"></div>
    <div class="abs" style="left:0;top:${L.BAR_Y}px;width:${L.W}px;height:${L.BAR_H}px;background:#05070f;border-top:1px solid #24305e"></div>
    <div class="abs" style="right:28px;top:0;height:${L.TOP - 1}px;display:flex;align-items:center;font-size:26px;font-weight:600;letter-spacing:.2px;color:#fff;white-space:nowrap">${esc(DISCLOSURE)}</div>` });

  // 2. Small source labels (top-left). Each is shown only while its layer / content is really on screen.
  const label = (name, text) => items.push({ name: "label-" + name, html: `
    <div class="abs" style="left:28px;top:0;height:${L.TOP - 1}px;display:flex;align-items:center;gap:12px;font-size:22px;font-weight:400;letter-spacing:.3px;color:#8fd3ff;white-space:nowrap">
      <span style="width:9px;height:9px;border-radius:2px;background:#d9482b;display:inline-block"></span>${esc(text)}</div>` });
  label("terrain", "MRO CTX imagery · NASA/JPL/MSSS via NASA Mars Trek");
  label("slope", "HiRISE · terrain");
  label("rough", "HiRISE · rough ground");
  label("thermal", "THEMIS · thermal proxy");
  label("minerals", "CRISM · mineral signals");
  label("route", "Route and oxygen reserve · computed by the app");
  label("photo", "Curiosity Navcam photo · NASA/JPL-Caltech");
  label("hud", "Helmet display · walk simulation");
  label("ask", "Ask Darb · on-device AI model · real-time answer");

  // 3. Captions = the narration, one image per spoken phrase
  P.scenes.forEach((s) => s.phrases.forEach((p, k) => items.push({ name: "caption-" + s.id + "-" + (k + 1), html: `
    <div class="abs" style="left:120px;top:${L.BAR_Y}px;width:${L.W - 240}px;height:${L.BAR_H}px;display:flex;align-items:center;justify-content:center;text-align:center;
      font-size:46px;line-height:1.22;font-weight:600;letter-spacing:.2px;color:#fff;white-space:pre-line">${esc(p.caption)}</div>` })));

  // 4. Opening title, lower left over the real terrain (clear of the rover stops in the middle of the map)
  const bottom = L.TOP + L.FOOT_H;
  items.push({ name: "title", html: `
    <div class="abs" style="left:0;top:${bottom - 520}px;width:${L.W}px;height:520px;background:linear-gradient(0deg,rgba(5,7,15,.86) 0%,rgba(5,7,15,.62) 38%,rgba(5,7,15,0) 100%);
      -webkit-mask-image:linear-gradient(90deg,#000 0%,#000 42%,transparent 78%);mask-image:linear-gradient(90deg,#000 0%,#000 42%,transparent 78%)"></div>
    <div class="abs" style="left:112px;top:${bottom - 290}px;text-shadow:0 2px 18px rgba(5,7,15,.8)">
      <div style="font-size:80px;line-height:1.08;font-weight:600;letter-spacing:-.5px;white-space:nowrap">Team Darb · Ramallah</div>
      <div style="width:84px;height:4px;background:#d9482b;margin:28px 0 24px;border-radius:2px"></div>
      <div style="font-size:40px;line-height:1.2;font-weight:400;color:#cfe6ff;letter-spacing:.3px;white-space:nowrap">Challenge: the Martian Map</div>
    </div>` });

  // 5. Closing title, in free map space (left of the route), while the narrator says "Darb: the path."
  items.push({ name: "closing", html: `
    <div class="abs" style="left:700px;top:${L.TOP + 250}px;width:470px;padding:34px 44px 38px;background:rgba(7,10,28,.88);border:1px solid #24305e;border-radius:14px;box-shadow:0 12px 40px rgba(5,7,15,.5)">
      <div style="font-size:92px;line-height:1;font-weight:600;letter-spacing:-1px">Darb</div>
      <div style="width:64px;height:4px;background:#d9482b;margin:22px 0 18px;border-radius:2px"></div>
      <div style="font-size:38px;line-height:1.1;font-weight:400;color:#cfe6ff">The path.</div>
    </div>` });
  return items;
}

// Thin outlines around REAL interface elements (positions measured in the recorded page by capture.cjs)
function pageItems(cap) {
  const outline = (r, pad) => `<div class="abs" style="left:${r.x - pad}px;top:${r.y - pad}px;width:${r.w + 2 * pad}px;height:${r.h + 2 * pad}px;border:3px solid #8fd3ff;border-radius:12px;box-shadow:0 0 0 1px rgba(5,7,15,.6), 0 0 22px rgba(143,211,255,.35)"></div>`;
  return [
    { name: "hl-delay", html: outline(cap.takes.s2.delayRect, 14) },
    { name: "hl-oxygen", html: outline(cap.takes.s4.o2Rect, 12) }
  ];
}

async function render(b, items, w, h) {
  await b.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  for (const it of items) {
    await b.evaluate((a) => { document.body.style.width = a.w + "px"; document.body.style.height = a.h + "px"; document.body.innerHTML = a.html; }, { html: it.html, w, h });
    await b.evaluate(() => document.fonts.ready.then(() => true));
    await b.screenshot(path.join(OUT, it.name + ".png"));
  }
}

async function main() {
  const P = plan();
  const cap = JSON.parse(fs.readFileSync(path.join(WORK, "capture.json"), "utf8"));
  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
  const b = await launch({ width: L.W, height: L.H, browser: "shell" });
  await b.send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
  await b.goto("data:text/html;charset=utf-8," + encodeURIComponent("<!doctype html><html><head><meta charset='utf-8'><style>" + BASE_CSS + "</style></head><body></body></html>"));
  const a = canvasItems(P, cap), c = pageItems(cap);
  await render(b, a, L.W, L.H);
  await render(b, c, L.PAGE_W, L.PAGE_H);
  await b.close();
  console.log("drew " + (a.length + c.length) + " overlay images in " + OUT);
}

module.exports = { L, DISCLOSURE };
if (require.main === module) main().catch((e) => { console.error(String(e.stack || e)); process.exit(1); });
