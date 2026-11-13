/*
 * review.cjs — quality gate for the finished video. It only READS docs/video/darb-demo.mp4.
 *
 *   node tools/video/review.cjs
 *
 * Writes:
 *   docs/video/stills/scene-1.jpg … scene-7.jpg   one representative frame per scene, taken from the final MP4
 *   docs/video/contact-sheet.jpg                  the seven stills on one sheet
 *   docs/video/work/review/                       first/last frame, the frames on both sides of every cut,
 *                                                 every label change of scene 3, and phone-sized previews
 *   docs/video/work/review.json                   measured facts: duration, streams, metadata, loudness, peak
 * and exits with an error if a hard rule is broken (longer than 30.0 s, wrong format, missing disclosure tag).
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { ROOT, WORK, FPS } = require("./timing.cjs");

const MP4 = path.join(ROOT, "docs", "video", "darb-demo.mp4");
const STILLS = path.join(ROOT, "docs", "video", "stills"), REVIEW = path.join(WORK, "review");
const run = (cmd, args) => { const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }); if (r.status !== 0) throw new Error(cmd + " failed: " + r.stderr.slice(-1500)); return r; };
// exact frame number -> image (decoded with the video's BT.709 colour matrix, so stills keep the true colours)
const grab = (frame, file, filter) => run("ffmpeg", ["-hide_banner", "-y", "-i", MP4, "-vf", "select=eq(n\\," + frame + "),scale=in_color_matrix=bt709:in_range=tv:out_color_matrix=bt601:out_range=pc,format=yuvj420p" + (filter ? "," + filter : ""), "-frames:v", "1", "-q:v", "2", file]);

function main() {
  const edit = JSON.parse(fs.readFileSync(path.join(WORK, "edit.json"), "utf8"));
  [STILLS, REVIEW].forEach((d) => { fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); });
  const probe = JSON.parse(run("ffprobe", ["-v", "error", "-show_format", "-show_streams", "-of", "json", MP4]).stdout);
  const v = probe.streams.find((s) => s.codec_type === "video"), a = probe.streams.find((s) => s.codec_type === "audio");
  const tags = probe.format.tags || {};
  const report = {
    file: path.relative(ROOT, MP4).replace(/\\/g, "/"), sizeBytes: +probe.format.size, sizeMB: +(probe.format.size / 1048576).toFixed(2),
    containerDuration: +probe.format.duration, videoDuration: +v.duration, audioDuration: +a.duration, videoFrames: +v.nb_frames,
    video: v.codec_name + " " + v.profile + " " + v.width + "x" + v.height + " " + v.pix_fmt + " r=" + v.r_frame_rate + " avg=" + v.avg_frame_rate,
    audio: a.codec_name + " " + a.sample_rate + " Hz " + a.channels + " ch " + Math.round(a.bit_rate / 1000) + " kb/s",
    fastStart: null, metadata: { title: tags.title, artist: tags.artist, comment: tags.comment, description: tags.description }
  };
  // fast-start = the 'moov' box comes before the 'mdat' box
  const head = fs.readFileSync(MP4).subarray(0, 4096).toString("latin1");
  const whole = fs.readFileSync(MP4).toString("latin1");
  report.fastStart = whole.indexOf("moov") > 0 && whole.indexOf("moov") < whole.indexOf("mdat");
  void head;

  // constant frame rate: every frame must last exactly 1/30 s
  const pts = run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "packet=pts_time", "-of", "csv=p=0", MP4]).stdout.trim().split(/\s+/).map(Number).sort((x, y) => x - y);
  let maxDev = 0; for (let i = 1; i < pts.length; i++) maxDev = Math.max(maxDev, Math.abs(pts[i] - pts[i - 1] - 1 / FPS));
  report.constantFrameRate = maxDev < 0.0005;

  // audio: loudness, true peak, clipping, silence at the very end
  const ebu = run("ffmpeg", ["-hide_banner", "-i", MP4, "-map", "0:a", "-af", "ebur128=peak=true", "-f", "null", "-"]).stderr;
  const sum = ebu.slice(ebu.lastIndexOf("Summary:"));
  report.loudnessLUFS = +(/I:\s+(-?[\d.]+) LUFS/.exec(sum) || [])[1];
  report.truePeakDb = +(/Peak:\s+(-?[\d.]+) dBFS/.exec(sum) || [])[1];
  const stats = run("ffmpeg", ["-hide_banner", "-i", MP4, "-map", "0:a", "-af", "astats=metadata=0", "-f", "null", "-"]).stderr;
  report.samplePeakDb = +(/Overall[\s\S]*?Peak level dB:\s+(-?[\d.]+)/.exec(stats) || [])[1];
  const sil = run("ffmpeg", ["-hide_banner", "-i", MP4, "-map", "0:a", "-af", "silencedetect=noise=-45dB:d=0.15", "-f", "null", "-"]).stderr;
  const starts = Array.from(sil.matchAll(/silence_start: (-?[\d.]+)/g)).map((m) => +m[1]);
  const ends = Array.from(sil.matchAll(/silence_end: (-?[\d.]+)/g)).map((m) => +m[1]);
  report.silences = starts.map((s, i) => [+s.toFixed(2), ends[i] === undefined ? report.audioDuration : +ends[i].toFixed(2)]);
  const lastSil = report.silences[report.silences.length - 1];
  report.quietTailSeconds = lastSil && lastSil[1] >= report.audioDuration - 0.05 ? +(report.audioDuration - lastSil[0]).toFixed(2) : 0;

  // stills: one representative frame per scene
  const where = { 1: 0.62, 2: 0.62, 3: 0.12, 4: 0.80, 5: 0.60, 6: 0.60, 7: 0.90 };
  const frameOf = (t) => Math.min(report.videoFrames - 1, Math.round(t * FPS));
  report.stills = edit.scenes.map((s) => {
    const fr = frameOf(s.start + (s.end - s.start) * where[s.id]), file = path.join(STILLS, "scene-" + s.id + ".jpg");
    grab(fr, file);
    grab(fr, path.join(REVIEW, "phone-" + s.id + ".png"), "scale=640:360:flags=area");
    return { scene: s.id, name: s.name, frame: fr, time: +(fr / FPS).toFixed(2), file: "docs/video/stills/scene-" + s.id + ".jpg" };
  });
  // contact sheet: 4 columns x 2 rows, numbered
  const font = "C\\:/Windows/Fonts/seguisb.ttf";
  const ins = [], parts = [];
  report.stills.forEach((s, i) => {
    ins.push("-i", path.join(STILLS, "scene-" + s.scene + ".jpg"));
    parts.push("[" + i + ":v]scale=960:540:flags=lanczos,pad=960:592:0:0:color=0x05070f,drawtext=fontfile='" + font + "':text='" +
      s.scene + "  " + s.name.replace(/'/g, "") + "   " + s.time.toFixed(1) + " s':x=16:y=552:fontsize=26:fontcolor=0x8fd3ff,pad=968:600:4:4:color=0x24305e[t" + i + "]");
  });
  parts.push("color=c=0x05070f:s=968x600:d=1[t7]");
  parts.push(report.stills.map((s, i) => "[t" + i + "]").join("") + "[t7]xstack=inputs=8:layout=0_0|w0_0|w0+w1_0|w0+w1+w2_0|0_h0|w0_h0|w0+w1_h0|w0+w1+w2_h0[sheet]");
  run("ffmpeg", ["-hide_banner", "-y"].concat(ins, ["-filter_complex", parts.join(";"), "-map", "[sheet]", "-frames:v", "1", "-q:v", "2", path.join(ROOT, "docs", "video", "contact-sheet.jpg")]));

  // frames for the human/AI reviewer: first, last, both sides of every cut, label changes in scene 3
  grab(0, path.join(REVIEW, "first-frame.png")); grab(report.videoFrames - 1, path.join(REVIEW, "last-frame.png"));
  edit.scenes.slice(1).forEach((s) => { const c = Math.round(s.start * FPS); grab(c - 1, path.join(REVIEW, "cut-" + s.id + "-before.jpg")); grab(c, path.join(REVIEW, "cut-" + s.id + "-after.jpg")); });
  edit.overlays.filter((o) => /label-(rough|thermal|minerals)/.test(o.what)).forEach((o) => {
    const c = Math.round(o.from * FPS), name = /label-(\w+)/.exec(o.what)[1];
    grab(c - 1, path.join(REVIEW, "label-" + name + "-before.jpg")); grab(c, path.join(REVIEW, "label-" + name + "-after.jpg")); grab(c + 14, path.join(REVIEW, "label-" + name + "-settled.jpg"));
  });

  // hard rules
  const problems = [];
  if (!(report.containerDuration <= 30.0)) problems.push("container duration " + report.containerDuration + " s is over 30.0 s");
  if (!(report.videoDuration <= 30.0 && report.audioDuration <= 30.0)) problems.push("a stream is longer than 30.0 s");
  if (v.codec_name !== "h264" || a.codec_name !== "aac") problems.push("codecs are not H.264 + AAC");
  if (v.width !== 1920 || v.height !== 1080 || v.pix_fmt !== "yuv420p") problems.push("not 1920x1080 yuv420p");
  if (v.r_frame_rate !== "30/1" || v.avg_frame_rate !== "30/1" || !report.constantFrameRate) problems.push("not constant 30 fps");
  if (!report.fastStart) problems.push("fast-start is not enabled");
  if (!/AI-assisted video/.test(tags.comment || "") || !/AI text-to-speech|AI voice/.test(tags.comment || "")) problems.push("AI disclosure is missing from the MP4 comment tag");
  if (report.truePeakDb > -0.5) problems.push("audio true peak too high: " + report.truePeakDb + " dBFS");
  report.problems = problems;
  fs.writeFileSync(path.join(WORK, "review.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (problems.length) { console.error("QUALITY GATE FAILED:\n - " + problems.join("\n - ")); process.exit(1); }
  console.log("Automatic checks passed. Now LOOK at the stills and LISTEN to the video.");
}

main();
