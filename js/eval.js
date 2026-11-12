/*
 * eval.js — a test set for "Ask Darb" (the offline AI)
 * -----------------------------------------------------
 * Open the app with  http://localhost:8000/?eval  to run it (Ollama must be running).
 * Add a model name to test another one:  http://localhost:8000/?eval=gpt-oss:20b
 * Repeat the whole set (answers vary a little each time):  http://localhost:8000/?eval=qwen3.5:9b&runs=3
 *
 * How it works:
 *  1. Plans the demo route (so every run uses the same facts).
 *  2. Asks each question below, with the SAME grounded facts the app uses.
 *  3. Checks the answer automatically. The expected answers are NOT typed in by hand:
 *     they are read from the app's real data (route stats, grid, waypoints, RAD), so if the
 *     data changes, the test follows.
 *  4. Shows a score table and prints it to the console (copy it into docs/ASK-DARB-EVAL.md).
 *
 * Kinds of check:
 *  "number"  — the answer must contain the right number (small rounding allowed)
 *  "word"    — the answer must contain one of the given words
 *  "unknown" — the facts do NOT contain the answer, so Darb must say it doesn't know
 *              (this measures whether the model invents things = "hallucination")
 */
(function () {
  "use strict";
  var params = new URLSearchParams(location.search);
  if (!params.has("eval")) return;

  // Models write the same thing in different ways: "one‑way" (special hyphen), "2 682" (thin space),
  // "don’t" (curly apostrophe). Make them all plain before checking.
  function normalise(text) {
    return text.replace(/[‐-―−]/g, "-").replace(/[‘’ʼ]/g, "'")
      .replace(/(\d)[\s   ](?=\d{3}\b)/g, "$1");
  }

  // Does the text contain this number (allowing different rounding, e.g. 2.73 → "2.7" or "2.73")?
  function hasNumber(text, value, tolerance) {
    text = normalise(text);
    var nums = (text.replace(/,/g, "").replace(/[٠-٩]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩".indexOf(d); })
      .match(/-?\d+(\.\d+)?/g) || []).map(Number);
    return nums.some(function (n) { return Math.abs(n - value) <= tolerance; });
  }
  function hasWord(text, words) {
    var t = normalise(text).toLowerCase();
    return words.some(function (w) { return t.indexOf(w.toLowerCase()) >= 0; });
  }
  var UNKNOWN = ["don't know", "do not know", "not in the facts", "no data", "not available", "cannot", "can't",
                 "not provided", "not listed", "not included", "no information", "لا أعرف", "لا توجد", "غير متوفر"];

  // The questions. `expect` is a function so it can read the real data at run time.
  function questions() {
    var s = Darb.stats, wp = Darb.wp.waypoints, rad = Darb.env.rad.surfaceDoseEquivalent_mSv_per_day;
    var w5 = wp.find(function (w) { return w.id === 5; });
    var e5 = Darb.cellInfo(w5.lat, w5.lon).elevationM;
    var safetyWord = { safe: ["safe"], caution: ["caution"], danger: ["danger", "unsafe"] }[s.safety];
    var w3 = wp.find(function (w) { return w.id === 3; });
    var min3 = Darb.mineralWords(w3.lat, w3.lon);          // e.g. "...ferric iron (e.g. hematite) strong"
    var strongest = /ferric iron \(e\.g\. hematite\) strong/.test(min3) ? ["hematite", "ferric"] :
      /olivine strong/.test(min3) ? ["olivine"] : /clay signal strong/.test(min3) ? ["clay"] : ["sulfate"];
    return [
      { q: "Is this route safe? Answer with the app's safety score.", kind: "word", expect: safetyWord },
      { q: "How long is the route in kilometres?", kind: "number", expect: s.distanceM / 1000, tol: 0.06 },
      { q: "What is the O2 reserve after return, in percent?", kind: "number", expect: Math.round(s.o2ReservePct), tol: 1 },
      { q: "What is the maximum slope on the route in degrees?", kind: "number", expect: s.maxSlope, tol: 0.15 },
      { q: "How many metres do we climb on this route?", kind: "number", expect: Math.round(s.elevationGainM), tol: 2 },
      { q: "What is the elevation at waypoint 5 in metres?", kind: "number", expect: e5, tol: 1.5 },
      { q: "What is the strongest mineral signal at waypoint 3?", kind: "word", expect: strongest },
      { q: "What is the radiation dose per day on the surface?", kind: "number", expect: rad, tol: 0.005 },
      { q: "Is there loose sand on the route? Give the percentage.", kind: "number", expect: Math.round(s.sandFraction * 100), tol: 1 },
      { q: "ما طول المسار بالكيلومتر؟", kind: "number", expect: s.distanceM / 1000, tol: 0.06 },
      // Traps found in round 4 (the model used to invent these details):
      { q: "Is the 2.7 km route distance one way or round trip?", kind: "word", expect: ["one way", "one-way"] },
      { q: "How far from the start is the steepest point of the route, in metres?", kind: "number",
        expect: Math.round(Darb.steepestPoint().fromStartM), tol: 3 },
      { q: "What is the official safe daily radiation limit for astronauts?", kind: "unknown" },
      { q: "What is the gravity at the goal?", kind: "unknown" },
      { q: "Is there water ice at the goal?", kind: "unknown" },
      { q: "What is the name of the astronaut on this EVA?", kind: "unknown" },
      { q: "What will the wind speed be tomorrow at the goal?", kind: "unknown" },
      { q: "How many boulders bigger than 1 metre are on the route?", kind: "unknown" }
    ];
  }

  function check(item, answer) {
    if (item.kind === "number") return hasNumber(answer, item.expect, item.tol);
    if (item.kind === "word") return hasWord(answer, item.expect);
    return hasWord(answer, UNKNOWN);
  }

  async function run() {
    var panel = document.createElement("div");
    panel.style.cssText = "position:fixed;inset:20px;z-index:2000;overflow:auto;background:#070a1c;border:1px solid #8fd3ff;" +
      "border-radius:12px;padding:16px;color:#e6ebff;font:13px/1.4 system-ui";
    panel.innerHTML = "<h2 style='color:#8fd3ff;margin-top:0'>Ask Darb test set</h2><p id='evalStatus'>Starting…</p><table id='evalTable' style='width:100%;border-collapse:collapse'></table>";
    document.body.appendChild(panel);
    var status = panel.querySelector("#evalStatus"), table = panel.querySelector("#evalTable");

    await AskDarb.checkStatus();
    if (!AskDarb.state.online) { status.textContent = "Ollama is not running — cannot run the test set."; return; }
    if (params.get("eval")) AskDarb.state.model = params.get("eval");
    Darb.demoRoute();
    await new Promise(function (r) { setTimeout(r, 1500); });       // let CRISM images load for mineral facts

    // AI answers change a little each time, so we can repeat the whole set:  ?eval=qwen3.5:9b&runs=3
    var runs = Math.max(1, Math.min(10, +params.get("runs") || 1));
    var items = questions(), results = [];
    table.innerHTML = "<tr><th align=left>Run</th><th align=left>#</th><th align=left>Question</th><th align=left>Expected</th><th>OK</th><th>Time</th><th align=left>Answer</th></tr>";
    for (var k = 0; k < runs * items.length; k++) {
      var run = Math.floor(k / items.length) + 1, i = k % items.length, it = items[i];
      status.textContent = "Model " + AskDarb.state.model + " — run " + run + " of " + runs + ", question " + (i + 1) + " of " + items.length + "…";
      var ans = "", secs = 0;
      try {
        var res = await AskDarb.ask(it.q, Darb.buildContext(), null, null);
        ans = res.text; secs = res.seconds;
      } catch (e) { ans = "ERROR: " + e.message; }
      var ok = check(it, ans);
      var expected = it.kind === "unknown" ? "says it doesn't know" :
        it.kind === "number" ? (+it.expect.toFixed(3)) + " ± " + it.tol : it.expect.join(" / ");
      results.push({ run: run, n: i + 1, kind: it.kind, question: it.q, expected: expected, ok: ok, seconds: +secs.toFixed(1), answer: ans });
      var tr = document.createElement("tr");
      tr.style.borderTop = "1px solid #24305e";
      [run, i + 1, it.q, expected, ok ? "✅" : "❌", secs.toFixed(1) + " s", ans.slice(0, 220)].forEach(function (v) {
        var td = document.createElement("td"); td.textContent = v; td.style.padding = "4px 6px"; td.style.verticalAlign = "top"; tr.appendChild(td);
      });
      table.appendChild(tr);
    }
    var pass = results.filter(function (r) { return r.ok; }).length;
    var facts = results.filter(function (r) { return r.kind !== "unknown"; }), unk = results.filter(function (r) { return r.kind === "unknown"; });
    var avg = results.reduce(function (a, r) { return a + r.seconds; }, 0) / results.length;
    var summary = {
      model: AskDarb.state.model, runs: runs, score: pass + "/" + results.length,
      percent: Math.round(100 * pass / results.length),
      factQuestions: facts.filter(function (r) { return r.ok; }).length + "/" + facts.length,
      saysIDontKnow: unk.filter(function (r) { return r.ok; }).length + "/" + unk.length,
      averageSeconds: +avg.toFixed(1)
    };
    status.textContent = "Done. " + JSON.stringify(summary);
    window.DarbEval = { summary: summary, results: results };
    console.log("ASK DARB EVAL", JSON.stringify(window.DarbEval));
  }

  window.addEventListener("load", function () { setTimeout(run, 1500); });
})();
