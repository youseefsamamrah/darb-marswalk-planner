/*
 * assemble.cjs — edits the demo video with ffmpeg.
 *
 *   node tools/video/assemble.cjs
 *
 * Takes the recorded app footage (capture.cjs), the narration clips (narrate.py) and the editorial overlay
 * images (overlays.cjs) and writes:
 *   docs/video/darb-demo.mp4   H.264 + AAC, 1920x1080, constant 30 fps, yuv420p, fast-start
 *   docs/video/darb-demo.srt   English subtitles with the same timings as the burned-in captions
 *   docs/video/work/edit.json  the exact edit decision list (what is on screen and when)
 *
 * What is done to the footage: scaling to 1920x876, clean cuts, and a slow push-in (4 % on scene 1, under 2 % on scenes 4, 5 and 7).
 * The footage is never sped up, slowed down or re-ordered inside a scene. The narration is never time-stretched.
 * The AI disclosure label is part of one fixed image laid over every frame (it never moves or fades).
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { plan, ROOT, WORK, FPS } = require("./timing.cjs");
const { L, DISCLOSURE } = require("./overlays.cjs");

const OUT_DIR = path.join(ROOT, "docs", "video");
const OUT = path.join(OUT_DIR, "darb-demo.mp4");
const TAKES = path.join(WORK, "takes"), OV = path.join(WORK, "overlays");
// Narration loudness. -18 LUFS was chosen by measurement: at this level the peak limiter only touches the very
// highest peaks of the voice (it costs about 0.5 dB); pushing to -16 LUFS made it work 1.2 dB hard, risking a squashed sound.
const TARGET_LUFS = -18, PEAK_LIMIT_DB = -1.5;
const f = (x) => (+x).toFixed(3);

function ffmpeg(args, capture) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-y"].concat(args), { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) { console.error(r.stderr.slice(-4000)); throw new Error("ffmpeg failed"); }
  return capture ? r.stderr : "";
}

function main() {
  const P = plan();
  const cap = JSON.parse(fs.readFileSync(path.join(WORK, "capture.json"), "utf8"));
  if (Math.abs(cap.plan.total - P.total) > 1e-6) throw new Error("The footage was recorded for a different timing plan. Run capture.cjs again.");
  const S = (id) => P.scenes.find((s) => s.id === id);
  const T = P.total;
  const inputs = [], graph = [];
  const input = (args) => { inputs.push(args); return inputs.length - 1; };
  const still = (file, seconds) => input(["-loop", "1", "-framerate", String(FPS), "-t", f(seconds), "-i", file]);

  // ---------------------------------------------------------------- footage, scene by scene
  // push-in: zoom factor grows from 1 to 1+k over the scene, around the anchor point (ax, ay) of the frame
  // (kept small so that nothing at the edges of the app, e.g. the buttons in its top bar, is cut off)
  const pushIn = { 4: { k: 0.018, ax: 0.4, ay: 0.5 }, 5: { k: 0.018, ax: 0.4, ay: 0.5 }, 7: { k: 0.015, ax: 0.4, ay: 0.5 } };
  // thin outlines around real interface elements (scene-local seconds)
  const p4 = S(4).phrases[1];
  const highlight = {
    2: { file: "hl-delay.png", from: 0.95, to: S(2).duration - 0.05 },
    4: { file: "hl-oxygen.png", from: p4.start - S(4).start + 0.85, to: S(4).duration - 0.05 }
  };
  const edit = { total: T, fps: FPS, frames: P.totalFrames, layout: L, scenes: [], overlays: [] };

  // Scene 1: one still of the real map, slow push-in on the study area
  {
    const s = S(1), m = cap.takes.s1.map, n = s.frames, cx = m.x + m.w / 2, cy = m.y + m.h / 2;
    const z0 = L.PAGE_W / 2000, z1 = L.PAGE_W / 1920;           // window 2000 px -> 1920 px wide = 4 % push-in, ends at 1:1 pixels
    const i = input(["-i", path.join(TAKES, "s1.png")]);
    graph.push(`[${i}:v]format=gbrp,scale=${L.PAGE_W * 2}:${L.PAGE_H * 2}:flags=bicubic,` +
      `zoompan=z='${z0}+(${z1}-${z0})*on/${n - 1}':x='${cx * 2}-iw/zoom/2':y='${cy * 2}-ih/zoom/2':d=${n}:s=${L.W}x${L.FOOT_H}:fps=${FPS},` +
      `trim=end_frame=${n},setpts=PTS-STARTPTS,format=gbrp,setsar=1[v1]`);
    edit.scenes.push({ id: 1, name: s.name, start: s.start, end: s.start + s.duration, footage: "takes/s1.png (still)", treatment: "crop to the map, 4 % push-in" });
  }
  for (let id = 2; id <= 7; id++) {
    const s = S(id), n = s.frames;
    const i = input(["-framerate", String(FPS), "-start_number", "0", "-i", path.join(TAKES, "s" + id, "f-%05d.jpg")]);
    let cur = `[${i}:v]format=gbrp`;
    const hl = highlight[id];
    if (hl) {
      const h = still(path.join(OV, hl.file), s.duration);
      graph.push(`[${h}:v]format=rgba,fade=t=in:st=${f(hl.from)}:d=0.35:alpha=1,fade=t=out:st=${f(hl.to - 0.2)}:d=0.2:alpha=1[hl${id}]`);
      graph.push(`${cur}[b${id}];[b${id}][hl${id}]overlay=0:0:format=gbrp:enable='between(t,${f(hl.from)},${f(hl.to)})'[h${id}]`);
      cur = `[h${id}]`;
      edit.overlays.push({ what: "thin outline around a real interface element (" + hl.file + ")", from: s.start + hl.from, to: s.start + hl.to });
    }
    const z = pushIn[id];
    const view = z
      ? `zoompan=z='1+${z.k}*on/${n - 1}':x='(iw-iw/zoom)*${z.ax}':y='(ih-ih/zoom)*${z.ay}':d=1:s=${L.W}x${L.FOOT_H}:fps=${FPS}`
      : `scale=${L.W}:${L.FOOT_H}:flags=lanczos`;
    graph.push(`${cur}${cur.endsWith("]") ? "" : ","}${view},trim=end_frame=${n},setpts=PTS-STARTPTS,format=gbrp,setsar=1[v${id}]`.replace("],", "]"));
    edit.scenes.push({ id, name: s.name, start: s.start, end: s.start + s.duration, footage: "takes/s" + id + "/ (" + n + " frames, real time)",
      treatment: z ? (z.k * 100).toFixed(1) + " % push-in" : "none", appEvents: cap.takes["s" + id].events });
  }
  graph.push(`[v1][v2][v3][v4][v5][v6][v7]concat=n=7:v=1:a=0,pad=${L.W}:${L.H}:0:${L.TOP}:color=0x05070f,format=gbrp[c0]`);

  // ---------------------------------------------------------------- editorial overlays on the 1920x1080 canvas
  let cur = "c0", step = 0;
  function over(file, from, to, o) {
    o = o || {};
    const i = still(path.join(OV, file), T), fin = o.fadeIn || 0, fout = o.fadeOut || 0, tag = "o" + (++step), next = "c" + step;
    let chain = `[${i}:v]format=rgba`;
    if (fin) chain += `,fade=t=in:st=${f(from)}:d=${f(fin)}:alpha=1`;
    if (fout) chain += `,fade=t=out:st=${f(to - fout)}:d=${f(fout)}:alpha=1`;
    graph.push(chain + `[${tag}]`);
    graph.push(`[${cur}][${tag}]overlay=x=0:y='${o.y || 0}':format=gbrp:enable='gte(t,${f(from - 0.002)})*lt(t,${f(to - 0.002)})'[${next}]`);
    cur = next;
    edit.overlays.push({ what: file, from: +f(from), to: +f(to) });
  }
  // opening title: fades in with a 14 px upward move, gone before the cut to scene 2
  const s1 = S(1), t0 = 0.20;
  over("title.png", t0, s1.start + s1.duration - 0.04, { fadeIn: 0.6, fadeOut: 0.3, y: `14*pow(max(0,1-(t-${t0})/0.7),2)` });
  // closing title, while the narrator says "Darb: the path."
  const last = S(7).phrases[S(7).phrases.length - 1];
  over("closing.png", last.start - 0.15, T + 1, { fadeIn: 0.45 });
  // frame bars + AI disclosure: every frame, first to last
  over("frame.png", 0, T + 1);
  // source labels
  // scene 3: each label changes on the exact video frame where its layer first appears (frame numbers measured by capture.cjs)
  const ev3 = cap.takes.s3.events, at3 = (name) => {
    const e = ev3.find((x) => x.name === name);
    if (typeof e.firstFrame !== "number") throw new Error("capture.json has no frame for " + name + ": run capture.cjs again");
    return (S(3).startFrame + e.firstFrame) / FPS;
  };
  const s2end = S(2).start + S(2).duration, s3end = S(3).start + S(3).duration;
  over("label-terrain.png", 0, s2end);
  over("label-slope.png", S(3).start, at3("layer:rough"));
  over("label-rough.png", at3("layer:rough"), at3("layer:thermal"));
  over("label-thermal.png", at3("layer:thermal"), at3("layer:minerals"));
  over("label-minerals.png", at3("layer:minerals"), s3end);
  [[4, "route"], [5, "photo"], [6, "hud"], [7, "ask"]].forEach((x) => over("label-" + x[1] + ".png", S(x[0]).start, x[0] === 7 ? T + 1 : S(x[0]).start + S(x[0]).duration));
  // captions (same timings go into the .srt file)
  const cues = [];
  P.scenes.forEach((s) => s.phrases.forEach((p, k) => {
    const nextStart = s.phrases[k + 1] ? s.phrases[k + 1].start - 0.10 : (s.id === 7 ? T : s.start + s.duration);
    const from = Math.max(s.start, p.start - 0.10), to = Math.min(p.end + 0.40, nextStart - 0.04);
    cues.push({ from, to: s.id === 7 && !s.phrases[k + 1] ? T : to, text: p.caption });
    over("caption-" + s.id + "-" + (k + 1) + ".png", from, s.id === 7 && !s.phrases[k + 1] ? T + 1 : to, { fadeIn: 0.10, fadeOut: s.id === 7 && !s.phrases[k + 1] ? 0 : 0.10 });
  }));
  graph.push(`[${cur}]scale=out_color_matrix=bt709:out_range=limited,format=yuv420p,fps=${FPS},tpad=stop_mode=clone:stop_duration=0.5,trim=end_frame=${P.totalFrames},setpts=PTS-STARTPTS,setparams=range=tv:colorspace=bt709:color_primaries=bt709:color_trc=bt709[vout]`);

  // ---------------------------------------------------------------- narration: placed, never stretched
  const aIn = P.scenes.map((s) => input(["-i", s.voiceFile]));
  const mix = P.scenes.map((s, k) => `[${aIn[k]}:a]adelay=delays=${Math.round(s.voiceAt * 1000)}:all=1[a${s.id}]`).join(";") + ";" +
    P.scenes.map((s) => `[a${s.id}]`).join("") + `amix=inputs=${P.scenes.length}:normalize=0:dropout_transition=0,highpass=f=60`;
  // Loudness: ONE fixed gain for the whole narration (found by measuring), then a peak limiter as a safety net.
  const audioInputs = P.scenes.reduce((a, s) => a.concat(["-i", s.voiceFile]), []);
  const mixLocal = P.scenes.map((s, k) => `[${k}:a]adelay=delays=${Math.round(s.voiceAt * 1000)}:all=1[a${s.id}]`).join(";") + ";" +
    P.scenes.map((s) => `[a${s.id}]`).join("") + `amix=inputs=${P.scenes.length}:normalize=0:dropout_transition=0,highpass=f=60`;
  const limit = Math.pow(10, PEAK_LIMIT_DB / 20).toFixed(3);
  const finish = (gainDb) => `,volume=${gainDb.toFixed(2)}dB,alimiter=limit=${limit}:attack=3:release=60:level=false,aresample=48000,` +
    `aformat=sample_fmts=fltp:channel_layouts=stereo,apad=whole_dur=${f(T)},atrim=end=${f(T)}`;
  const loudnessWith = (gainDb) => {
    const log = ffmpeg(audioInputs.concat(["-filter_complex", mixLocal + finish(gainDb) + ",ebur128=peak=true[m]", "-map", "[m]", "-f", "null", "-"]), true);
    const v = +(/I:\s+(-?[\d.]+) LUFS/.exec(log.slice(log.lastIndexOf("Summary:"))) || [])[1];
    if (!isFinite(v)) throw new Error("could not measure narration loudness");
    return v;
  };
  const measuredI = loudnessWith(0);
  let gain = Math.min(12, TARGET_LUFS - measuredI);
  gain = Math.min(12, gain + (TARGET_LUFS - loudnessWith(gain)));        // one correction step
  graph.push(mix + finish(gain) + "[aout]");

  // ---------------------------------------------------------------- export
  const voice = P.voice.describe || (P.voice.engine === "sapi" ? "Windows built-in voice " + P.voice.model
    : P.voice.engine === "elevenlabs" ? "ElevenLabs text-to-speech, stock voice " + P.voice.voice_name + " (model " + P.voice.model + ")"
    : "Piper text-to-speech, stock voice " + P.voice.model);
  const disclosure = DISCLOSURE + ". Genuine screen footage of the working Darb web app, assembled with AI assistance " +
    "(Claude Code, Anthropic). Narration: AI text-to-speech voice (" + voice + "), not a human recording. The app footage itself is not AI-generated. No music.";
  const meta = {
    title: "Darb — Marswalk Planner · Team Darb · Ramallah · NASA Space Apps 2026 demo",
    artist: "Team Darb · Ramallah",
    comment: disclosure,
    description: disclosure + " Challenge: Interplanetary Survival Guide: Martian Map. Imagery and data: NASA Mars Trek (MRO CTX, NASA/JPL/MSSS), " +
      "HiRISE (NASA/JPL/University of Arizona, USGS), THEMIS (NASA/JPL/ASU), CRISM (NASA PDS), Curiosity Navcam (NASA/JPL-Caltech).",
    date: "2026", language: "eng"
  };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const args = inputs.reduce((a, x) => a.concat(x), []).concat(["-filter_complex", graph.join(";"), "-map", "[vout]", "-map", "[aout]",
    "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-profile:v", "high", "-pix_fmt", "yuv420p", "-r", String(FPS), "-g", String(FPS * 2),
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", "-frames:v", String(P.totalFrames), "-movflags", "+faststart"]);
  Object.keys(meta).forEach((k) => { if (k !== "language") args.push("-metadata", k + "=" + meta[k]); });
  args.push("-metadata:s:v:0", "language=eng", "-metadata:s:a:0", "language=eng", OUT);
  console.log("encoding " + f(T) + " s (" + P.totalFrames + " frames), narration gain " + gain.toFixed(2) + " dB (measured " + measuredI + " LUFS) …");
  ffmpeg(args);

  // ---------------------------------------------------------------- subtitles (.srt) from the same cue list
  const stamp = (t) => { const ms = Math.round(Math.min(t, T) * 1000); const p = (n, w) => String(n).padStart(w, "0");
    return p(Math.floor(ms / 3600000), 2) + ":" + p(Math.floor(ms / 60000) % 60, 2) + ":" + p(Math.floor(ms / 1000) % 60, 2) + "," + p(ms % 1000, 3); };
  fs.writeFileSync(path.join(OUT_DIR, "darb-demo.srt"), cues.map((c, i) => (i + 1) + "\n" + stamp(c.from) + " --> " + stamp(c.to) + "\n" + c.text + "\n").join("\n"), "utf8");
  edit.cues = cues.map((c) => ({ from: +f(c.from), to: +f(Math.min(c.to, T)), text: c.text }));
  edit.audio = { narrationMeasuredLUFS: measuredI, gainDb: +gain.toFixed(2), targetLUFS: TARGET_LUFS, peakLimitDb: PEAK_LIMIT_DB, music: "none", effects: "none",
    clips: P.scenes.map((s) => ({ scene: s.id, startsAt: +f(s.voiceAt), seconds: s.voiceDuration })) };
  edit.metadata = meta; edit.voice = P.voice;
  fs.writeFileSync(path.join(WORK, "edit.json"), JSON.stringify(edit, null, 2));
  console.log("wrote " + OUT);
}

main();
