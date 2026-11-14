/*
 * timing.cjs — the edit plan. Scene lengths are MEASURED from the narration clips (docs/video/work/narration.json,
 * written by narrate.py) plus the pauses in script.json. The voice sets the timing, never the other way round.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "..", "..");
const WORK = path.join(ROOT, "docs", "video", "work");
const FPS = 30;
const MAX_SECONDS = 29.5;       // our own safety line; the Space Apps limit is 30.0

function plan() {
  const script = JSON.parse(fs.readFileSync(path.join(__dirname, "script.json"), "utf8"));
  const narration = JSON.parse(fs.readFileSync(path.join(WORK, "narration.json"), "utf8"));
  let frame = 0;
  const scenes = script.scenes.map((s) => {
    const n = narration.scenes.find((x) => x.id === s.id);
    const frames = Math.round((s.lead + n.duration + s.tail) * FPS);
    const start = frame / FPS, voiceAt = start + s.lead;
    const sc = { id: s.id, name: s.name, startFrame: frame, frames, start, duration: frames / FPS,
      voiceAt, voiceDuration: n.duration, voiceFile: path.join(WORK, n.file),
      phrases: n.phrases.map((p) => ({ text: p.text, caption: p.caption, start: voiceAt + p.start, end: voiceAt + p.end })) };
    frame += frames;
    return sc;
  });
  const total = frame / FPS;
  if (total > MAX_SECONDS) throw new Error("Plan is " + total.toFixed(2) + " s — over " + MAX_SECONDS + " s. Shorten pauses in script.json (never speed up the voice in editing).");
  return { fps: FPS, totalFrames: frame, total, scenes, voice: narration.voice };
}

module.exports = { plan, ROOT, WORK, FPS };
if (require.main === module) {
  const p = plan();
  p.scenes.forEach((s) => console.log("scene " + s.id + "  " + s.start.toFixed(2) + "–" + (s.start + s.duration).toFixed(2) + " s  (" + s.duration.toFixed(2) + " s, voice " + s.voiceDuration.toFixed(2) + " s)  " + s.name));
  console.log("total " + p.total.toFixed(3) + " s = " + p.totalFrames + " frames");
}
