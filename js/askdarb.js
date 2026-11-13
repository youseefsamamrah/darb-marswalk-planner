/*
 * AI notice: written with help from an AI coding assistant (Claude Code, Anthropic) and reviewed/tested by the team. See AI-USAGE.md.
 * askdarb.js — "Ask Darb", the offline AI assistant (Local AI agent)
 * ------------------------------------------------------------------
 * Talks to Ollama running on THIS computer (http://localhost:11434).
 * No internet and no cloud: on Mars, Earth is 4–24 light-minutes away.
 *
 * Grounding: every question is sent together with the CURRENT facts from the app
 * (route stats, waypoints, layer values, weather). The model is told to use only those
 * facts and to say "I don't know" otherwise.
 *
 * Ollama API docs: https://github.com/ollama/ollama/blob/main/docs/api.md
 */
var AskDarb = (function () {
  "use strict";
  var state = { online: false, model: null, models: [] };

  var SYSTEM_PROMPT =
    "You are Darb, the offline safety assistant inside a spacesuit EVA planner on MARS " +
    "(lower Mount Sharp, Gale Crater). Answer using ONLY the FACTS you are given and, " +
    "if an image is attached, what you can clearly see in it. If the answer is not in the context, " +
    "say \"I don't know\" and say which data would be needed. Never invent numbers, minerals or places. " +
    "Do not add judgements that are not in the FACTS (for example 'within safe limits' or 'at waypoint 7') " +
    "and copy numbers exactly as written; the route distance is one way unless the FACTS say round trip. " +
    "Safety first: if anything looks risky, say so clearly. Keep answers under 120 words, " +
    "use simple words, and name which data layer each fact comes from (HiRISE DEM, THEMIS, CRISM, REMS, RAD, Curiosity). " +
    "Reply in the same language as the question.";

  // Check if Ollama is running and which models are installed.
  async function checkStatus() {
    try {
      var ctrl = new AbortController();
      var timer = setTimeout(function () { ctrl.abort(); }, 2500);
      var res = await fetch(DARB_CONFIG.ollamaUrl + "/api/tags", { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error("HTTP " + res.status);
      var data = await res.json();
      state.models = (data.models || []).map(function (m) {
        return { name: m.name, vision: (m.capabilities || []).indexOf("vision") >= 0 || /vl|llava|vision|gemma3|qwen3\.5|qwen3\.6/i.test(m.name) };
      });
      if (!state.models.length) throw new Error("no models installed");
      if (!state.model || !state.models.some(function (m) { return m.name === state.model; })) {
        var pick = DARB_CONFIG.preferredModels.find(function (p) { return state.models.some(function (m) { return m.name === p; }); });
        state.model = pick || state.models[0].name;
      }
      state.online = true;
    } catch (e) {
      state.online = false;
    }
    return state;
  }

  function modelHasVision(name) {
    var m = state.models.find(function (x) { return x.name === name; });
    return !!(m && m.vision);
  }

  // Turn a local image (same website) into base64 so we can send it to a vision model.
  async function imageToBase64(url) {
    var res = await fetch(url);
    var blob = await res.blob();
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result).split(",")[1]); };
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  /**
   * Ask a question.
   * context: the current app facts as plain-English text (built by buildContext() in app.js)
   * imageUrl: optional local image path for the vision model
   * onToken: called with the text so far (streaming), so the answer appears word by word
   * Returns {text, seconds, firstTokenSeconds, model, usedImage}
   */
  async function ask(question, context, imageUrl, onToken) {
    if (!state.online) await checkStatus();
    if (!state.online) throw new Error("offline");
    var t0 = performance.now(), tFirst = null;
    var facts = typeof context === "string" ? context : JSON.stringify(context);
    var userMsg = { role: "user", content: "FACTS (from the Darb app, planet Mars):\n" + facts + "\n\nQUESTION: " + question };
    var usedImage = false;
    if (imageUrl && modelHasVision(state.model)) {
      // Photo question: the picture itself is a second trusted source.
      userMsg.images = [await imageToBase64(imageUrl)];
      userMsg.content += "\n(The attached image is a real black-and-white Navcam photo taken by the Curiosity rover at that " +
        "waypoint. Step 1: describe in 2-3 sentences what is visible: ridges, layered rock, veins, boulders, loose sand or " +
        "ripples, slopes, rover hardware in the foreground. Step 2: link it to the FACTS for that waypoint. " +
        "Step 3: one safety tip for walking there. Do not claim to see colours or minerals in a black-and-white photo.)";
      usedImage = true;
    } else {
      userMsg.content += "\n(Use only the FACTS above. If they do not answer the question, say \"I don't know\".)";
    }
    var res = await fetch(DARB_CONFIG.ollamaUrl + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: state.model,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, userMsg],
        stream: true,
        think: false,                       // skip long hidden "thinking" for faster answers
        // low temperature = fewer made-up facts; num_ctx = bigger memory so the facts are never cut off
        options: { temperature: 0.2, num_ctx: 8192 }
      })
    });
    if (!res.ok) throw new Error("Ollama error " + res.status + ": " + (await res.text()));

    // Ollama streams one JSON object per line
    var reader = res.body.getReader(), decoder = new TextDecoder(), buf = "", text = "";
    for (;;) {
      var chunk = await reader.read();
      if (chunk.done) break;
      buf += decoder.decode(chunk.value, { stream: true });
      var lines = buf.split("\n");
      buf = lines.pop();
      lines.forEach(function (line) {
        if (!line.trim()) return;
        var obj = JSON.parse(line);
        if (obj.error) throw new Error(obj.error);
        if (obj.message && obj.message.content) {
          if (tFirst === null) tFirst = performance.now();
          text += obj.message.content;
          if (onToken) onToken(text);
        }
      });
    }
    return {
      text: text.trim(),
      seconds: (performance.now() - t0) / 1000,
      firstTokenSeconds: tFirst ? (tFirst - t0) / 1000 : null,
      model: state.model,
      usedImage: usedImage
    };
  }

  return { state: state, checkStatus: checkStatus, ask: ask, modelHasVision: modelHasVision };
})();
