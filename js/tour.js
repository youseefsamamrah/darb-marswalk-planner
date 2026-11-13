/*
 * AI notice: written with help from an AI coding assistant (Claude Code, Anthropic) and reviewed/tested by the team. See AI-USAGE.md.
 * tour.js — guided demo for the live pitch
 * ------------------------------------------
 * Click "▶ Tour" in the top bar. Each step sets up the map BY ITSELF (layers, route, popups, HUD),
 * so the presenter only clicks "Next" and talks. "Back" works too, because every step starts from a clean state.
 * Numbers in the captions ({dist}, {o2}, {rover}, {maxSlope} …) are filled in live from the app's data.
 * Only the Ask Darb test score (54/54) is a fixed result from docs/ASK-DARB-EVAL.md.
 * Keyboard: → or Space = next, ← = back, Esc = close.
 */
(function () {
  "use strict";
  var D = function () { return window.Darb; };
  var $ = function (id) { return document.getElementById(id); };
  var ar = function () { return DarbI18n.lang === "ar"; };

  // Switch a data layer on/off exactly like clicking its checkbox
  function layer(id, on) {
    var box = $(id);
    if (box.checked !== on) { box.checked = on; box.dispatchEvent(new Event("change")); }
  }
  function onlyLayers(list) {
    ["lySlope", "lyRough", "lyThermal", "lyMinerals", "lyMola"].forEach(function (id) { layer(id, list.indexOf(id) >= 0); });
    layer("lyRover", true);
  }
  function buddy(on) {
    if ($("buddyOn").checked !== on || (on && $("buddyM").value !== "100")) {
      if (on) $("buddyM").value = "100";        // only set the distance when WE turn buddy mode on
      $("buddyOn").checked = on; $("buddyOn").dispatchEvent(new Event("change"));
    }
  }
  function reset() {
    D().setHUD(false); buddy(false); D().map.closePopup();
  }
  function fmtH(h) { var m = Math.round(h * 60); return Math.floor(m / 60) + " h " + String(m % 60).padStart(2, "0") + " min"; }
  function box() { var b = D().grid.bounds; return [[b.south, b.west], [b.north, b.east]]; }

  // Each step: title + text (English / Arabic) + setup function
  var steps = [
    { en: ["Darb — the path", "Planning a SAFE walk on Mars, on Mount Sharp in Gale Crater, to the boxwork ridges Curiosity studied in 2025. Earth is about {delay} light-minutes away today — so everything runs on this device."],
      ar: ["دَرْب — الطريق", "نخطط مشياً آمناً على المريخ، على جبل شارب في فوهة غيل، نحو حواف الصناديق التي درسها كيوريوسيتي عام 2025. الأرض على بعد نحو {delay} دقيقة ضوئية اليوم — لذلك كل شيء يعمل على هذا الجهاز."],
      go: function () { reset(); D().clearRoute(); onlyLayers([]); D().map.fitBounds(box()); } },
    { en: ["Slope from 1-metre elevation", "NASA HiRISE stereo elevation, averaged into 25 m cells. Green = easy, yellow/orange = hard, red = too steep to walk (over {maxSlope}°). It matches Curiosity's own recorded height within {rover} m."],
      ar: ["الانحدار من ارتفاعات بدقة متر", "ارتفاعات HiRISE المجسمة من ناسا، في خلايا 25 م. أخضر = سهل، أصفر/برتقالي = صعب، أحمر = شديد الانحدار (> {maxSlope}°). تطابق ارتفاع كيوريوسيتي المسجل بفارق {rover} م."],
      go: function () { reset(); D().clearRoute(); onlyLayers(["lySlope"]); D().map.fitBounds(box()); } },
    { en: ["Rocks and small ridges", "The rough-ground layer looks at 4-metre steps inside each cell. Purple = very rough: rocks and ridges a suit could trip on. Notice how it traces the ridge lines in the orbital image."],
      ar: ["صخور وحواف صغيرة", "طبقة خشونة الأرض تقيس الدرجات على مسافة 4 م داخل كل خلية. البنفسجي = وعر جداً: صخور وحواف قد يتعثر بها رائد الفضاء."],
      go: function () { reset(); D().clearRoute(); onlyLayers(["lyRough"]); D().map.setView([-4.80, 137.39], 13); } },
    { en: ["Minerals and loose sand", "CRISM spectra show iron minerals like hematite (bright here) — a science target. THEMIS night-time heat tells rock from loose sand: sand cools fast at night."],
      ar: ["المعادن والرمل المفكك", "أطياف CRISM تُظهر معادن الحديد مثل الهيماتيت — هدف علمي. حرارة THEMIS الليلية تميّز الصخر عن الرمل المفكك: الرمل يبرد بسرعة ليلاً."],
      go: function () {
        reset(); D().clearRoute(); $("crismSelect").value = "fem"; $("crismSelect").dispatchEvent(new Event("change"));
        onlyLayers(["lyMinerals"]); D().map.setView([-4.80, 137.40], 12);
      } },
    { en: ["The safest route (A*)", "From Curiosity's 2024 site to its 2025 boxwork stop. A* searched the whole grid in a few milliseconds: {dist} km, {time} one way, {o2}% oxygen reserve after return. Rated {safety}."],
      ar: ["المسار الأكثر أماناً (A*)", "من موقع كيوريوسيتي عام 2024 إلى محطته عند الصناديق عام 2025. بحث A* في الشبكة كلها خلال أجزاء من الثانية: {dist} كم، {time} ذهاباً، احتياطي أكسجين {o2}% بعد العودة. التقييم: {safety}."],
      go: function () { reset(); onlyLayers(["lySlope"]); D().demoRoute(); } },
    { en: ["What you will see there", "Click any stop: a real Curiosity Navcam photo from that exact spot, and what to look for — ridges about 1–2 m tall with sandy hollows between them."],
      ar: ["ماذا سترى هناك", "انقر أي محطة: صورة Navcam حقيقية من كيوريوسيتي من نفس المكان، وما يجب البحث عنه — حواف بارتفاع 1–2 م بينها تجاويف رملية."],
      go: function () {
        reset(); onlyLayers(["lySlope"]); if (!D().route) D().demoRoute();
        var w6 = D().wp.waypoints.find(function (w) { return w.id === 6; });
        D().map.setView([w6.lat + 0.004, w6.lon], 14);
        D().layers.rover.eachLayer(function (l) {
          if (l.getLatLng && Math.abs(l.getLatLng().lat - w6.lat) < 1e-6) l.openPopup();
        });
      } },
    { en: ["Two astronauts: buddy mode", "The challenge suggests astronauts may work in pairs. If they must stay within 100 m of each other, the narrow safe gaps near the boxwork are too tight: Darb finds a {dist} km detour and rates it {safety}."],
      ar: ["رائدان معاً: وضع الرفيق", "يقترح التحدي أن يعمل الرواد في أزواج. إذا كان عليهما البقاء ضمن 100 م، فالممرات الآمنة الضيقة قرب الصناديق لا تكفي: يجد دَرْب طريقاً أطول {dist} كم بتقييم {safety}."],
      go: function () { reset(); onlyLayers(["lySlope"]); D().demoRoute(); buddy(true); D().map.fitBounds(box()); } },
    { en: ["Helmet HUD", "The same route on the visor: compass, distance to goal, oxygen timer, slope under your feet, Earth delay and warnings, updated as you walk."],
      ar: ["شاشة الخوذة", "نفس المسار على زجاج الخوذة: بوصلة، المسافة للهدف، مؤقت الأكسجين، الانحدار تحت قدميك، تأخير الأرض والتحذيرات أثناء المشي."],
      go: function () { reset(); onlyLayers(["lySlope"]); D().demoRoute(); D().simulateWalk(); } },
    { en: ["Ask Darb — AI with no internet", "A local open model answers from the map's own data, in English or Arabic, and says \"I don't know\" when the data has no answer. Tested: 54/54 correct over 3 runs."],
      ar: ["اسأل دَرْب — ذكاء بلا إنترنت", "نموذج مفتوح محلي يجيب من بيانات الخريطة نفسها، بالعربية أو الإنجليزية، ويقول «لا أعرف» عندما لا تتوفر الإجابة. الاختبار: 54/54 صحيحة في 3 جولات."],
      go: function () {
        reset(); onlyLayers(["lySlope"]); D().demoRoute();
        var card = document.querySelector(".card.ask"); if (card) card.scrollIntoView({ behavior: "smooth", block: "start" });
        if (!askedThisTour) { askedThisTour = true; D().askQuestion(DarbI18n.t("q1")); }   // ask once, not on every Back/Next
      } },
    { en: ["Darb — the path", "Real NASA data (HiRISE, CTX, MOLA, THEMIS, CRISM, Curiosity REMS, RAD, Navcam), safe routes in milliseconds, and an AI that works 4–24 light-minutes from Earth. All sources: SOURCES.md."],
      ar: ["دَرْب — الطريق", "بيانات ناسا الحقيقية، مسارات آمنة خلال أجزاء من الثانية، وذكاء اصطناعي يعمل على بعد 4–24 دقيقة ضوئية من الأرض. كل المصادر في SOURCES.md."],
      go: function () { reset(); onlyLayers(["lySlope"]); D().demoRoute(); D().map.fitBounds(box()); } }
  ];

  var idx = -1, panel = null, askedThisTour = false;

  function fill(text) {
    var s = D().stats;
    return text
      .replace("{delay}", D().earthDelayMinutes(Date.now()).toFixed(0))
      .replace("{dist}", s ? (s.distanceM / 1000).toFixed(2) : "?")
      .replace("{time}", s ? fmtH(s.hoursOut) : "?")
      .replace("{o2}", s ? Math.round(s.o2ReservePct) : "?")
      .replace("{safety}", s ? DarbI18n.t(s.safety) : "?")
      .replace("{rover}", D().roverMaxDiff().toFixed(1))
      .replace("{maxSlope}", DARB_CONFIG.routeOptions.maxSlope);
  }

  function show(i) {
    idx = Math.max(0, Math.min(steps.length - 1, i));
    steps[idx].go();
    // captions use numbers from the step we just set up, so wait a moment for the route to finish
    setTimeout(refresh, 250);
  }

  // Write the caption + buttons of the current step in the current language (also called when the language changes)
  function refresh() {
    if (idx < 0 || !panel) return;
    var st = steps[idx], t = ar() ? st.ar : st.en;
    panel.querySelector(".tour-step").textContent = (idx + 1) + " / " + steps.length;
    panel.querySelector(".tour-title").textContent = t[0];
    panel.querySelector(".tour-text").textContent = fill(t[1]);
    panel.querySelector(".tour-back").disabled = idx === 0;
    panel.querySelector(".tour-next").textContent = idx === steps.length - 1 ? (ar() ? "إنهاء" : "Finish") : (ar() ? "التالي ←" : "Next →");
    panel.querySelector(".tour-close").setAttribute("aria-label", ar() ? "إغلاق" : "Close");
  }

  function open() {
    if (!D() || !D().grid) return;
    if (!panel) {
      panel = document.createElement("div");
      panel.className = "tour";
      panel.setAttribute("role", "dialog");
      panel.innerHTML = '<div class="tour-head"><span class="tour-step"></span><button class="tour-close">✕</button></div>' +
        '<h3 class="tour-title"></h3><p class="tour-text"></p>' +
        '<div class="tour-nav"><button class="btn ghost tour-back">←</button><button class="btn primary tour-next"></button></div>';
      document.querySelector(".map-wrap").appendChild(panel);
      panel.querySelector(".tour-close").onclick = close;
      panel.querySelector(".tour-back").onclick = function () { show(idx - 1); };
      panel.querySelector(".tour-next").onclick = function () { if (idx === steps.length - 1) close(); else show(idx + 1); };
    }
    panel.classList.remove("hidden");
    askedThisTour = false;
    show(0);
  }

  function close() {
    if (panel) panel.classList.add("hidden");
    idx = -1;
    D().setHUD(false); buddy(false);
  }

  document.addEventListener("keydown", function (e) {
    if (idx < 0 || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); if (idx < steps.length - 1) show(idx + 1); }
    else if (e.key === "ArrowLeft") show(idx - 1);
    else if (e.key === "Escape") close();
  });

  document.addEventListener("DOMContentLoaded", function () {
    var btn = $("tourBtn");
    if (btn) btn.addEventListener("click", open);
  });
  window.DarbTour = { open: open, close: close, show: function (i) { show(i); }, count: steps.length, refresh: refresh };
})();
