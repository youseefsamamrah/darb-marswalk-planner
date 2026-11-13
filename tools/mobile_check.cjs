// AI-assisted: scripted mobile-usability check of the Darb app (playwright-core, headless).
// Emulates iPhone SE (375×667) and Pixel 5 (393×851); checks horizontal overflow,
// touch targets, route flow and Arabic RTL, and saves screenshots.
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('C:/Users/youse/AppData/Local/OpenAI/Codex/runtimes/cua_node/bbc9141fe9f920ac/bin/node_modules/playwright-core');

const outDir = path.resolve('docs/video/work/mobile');
fs.mkdirSync(outDir, { recursive: true });
const results = { devices: [], startedAt: new Date().toISOString() };

const devices = [
  { name: 'iPhone SE 375x667', width: 375, height: 667 },
  { name: 'Pixel 5 393x851', width: 393, height: 851 },
];

// Selectors that must be clickable by touch in the main flow, with minimum size in CSS px.
const TOUCH_TARGETS = [
  { id: '#tourBtn', min: 32 },
  { id: '#hudBtn', min: 32 },
  { id: '#langBtn', min: 32 },
  { id: '#demoBtn', min: 32 },
  { id: '#clearBtn', min: 32 },
  { id: '#simBtn', min: 32 },
];

async function checkDevice(browser, dev) {
  const report = { device: dev.name, issues: [], checks: {} };
  const ctx = await browser.newContext({
    viewport: { width: dev.width, height: dev.height },
    deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://localhost:8000');
  await page.waitForFunction(() => window.Darb?.grid);

  // 1. Horizontal overflow of the whole document.
  report.checks.horizontalOverflow = await page.evaluate(() => {
    const w = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    return w > 1 ? `overflow ${w}px` : 'ok';
  });
  if (!report.checks.horizontalOverflow.startsWith('ok')) report.issues.push(report.checks.horizontalOverflow);

  // 2. Demo route flow by touch: tap Demo, expect the route card stats to fill.
  await page.tap('#demoBtn');
  await page.waitForFunction(() => {
    const c = document.querySelector('#stDist');
    return c && c.textContent.trim() !== '';
  }, { timeout: 20000 });
  report.checks.demoRoute = await page.evaluate(() => ({
    distance: document.querySelector('#stDist').textContent,
    safety: document.querySelector('#safety').textContent,
  }));

  // 3. Touch targets: every main-flow control must be at least its minimum CSS size
  // (Simulate is measured after the route exists, since it lives in the route card).
  const targets = await page.evaluate(els => els.map(el => {
    const r = document.querySelector(el).getBoundingClientRect();
    const visible = r.width > 0 && r.height > 0;
    return { sel: el, visible, w: Math.round(r.width), h: Math.round(r.height) };
  }), TOUCH_TARGETS.map(t => t.id));
  targets.forEach((t, i) => {
    const min = TOUCH_TARGETS[i].min;
    if (!t.visible) report.issues.push(`${TOUCH_TARGETS[i].id} not visible`);
    else if (t.w < min || t.h < min) report.issues.push(`${TOUCH_TARGETS[i].id} too small: ${t.w}x${t.h} (min ${min})`);
  });
  report.checks.touchTargets = targets;
  await page.screenshot({ path: path.join(outDir, `${dev.name.replace(/\s/g, '_')}_route.png`) });

  // 4. Waypoint popup: tap a Curiosity waypoint marker, popup must be on-screen.
  const popupInfo = await page.evaluate(async () => {
    const markers = [...document.querySelectorAll('.leaflet-marker-icon')];
    if (!markers.length) return { markers: 0 };
    markers[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 400));
    const p = document.querySelector('.leaflet-popup');
    if (!p) return { markers: markers.length, popup: false };
    const r = p.getBoundingClientRect();
    return { markers: markers.length, popup: true,
      fitsViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
      rect: { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) } };
  });
  report.checks.popup = popupInfo;
  if (popupInfo.popup && !popupInfo.fitsViewport) report.issues.push('popup outside viewport');

  // 5. Arabic RTL: switch language, dir and layout must flip.
  await page.tap('#langBtn');
  await page.waitForFunction(() => document.documentElement.dir === 'rtl');
  report.checks.arabicRTL = true;
  report.checks.panelTitle = await page.evaluate(() => document.querySelector('[data-i18n="layersTitle"]').textContent);
  await page.screenshot({ path: path.join(outDir, `${dev.name.replace(/\s/g, '_')}_arabic.png`) });

  // 6. Panel scroll: the lower card (Ask Darb) must be reachable inside the panel.
  report.checks.panelScrollable = await page.evaluate(() => {
    const p = document.querySelector('#panel');
    const ask = document.querySelector('.card.ask');
    p.scrollTo(0, p.scrollHeight);
    const r = ask.getBoundingClientRect();
    return { askVisible: r.top < p.getBoundingClientRect().bottom && r.bottom > p.getBoundingClientRect().top,
      scrollHeight: p.scrollHeight, clientHeight: p.clientHeight };
  });
  if (!report.checks.panelScrollable.askVisible) report.issues.push('Ask Darb card not reachable by scrolling panel');

  if (errors.length) report.issues.push('pageerror: ' + errors.join(' | '));
  await ctx.close();
  return report;
}

async function main() {
  const browser = await chromium.launch({ headless: true,
    executablePath: 'C:/Users/youse/AppData/Local/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-win64/chrome-headless-shell.exe' });
  for (const dev of devices) results.devices.push(await checkDevice(browser, dev));
  await browser.close();
  results.endedAt = new Date().toISOString();
  results.allClean = results.devices.every(d => d.issues.length === 0);
  fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
}
main().catch(e => { console.error(e); process.exit(1); });
