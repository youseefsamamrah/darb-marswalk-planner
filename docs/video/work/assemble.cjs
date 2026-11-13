// Assembles docs/video/darb-demo.mp4 from:
//   frames/frame-NNNNN.jpg  (global numbering, verified in capture.json)
//   voice-N.wav             (Piper TTS, scene N is 1-based)
//   timing.json             (exact scene durations = WAV lengths)
//
// Per scene:  N frames @ 30fps -> stretch with setpts to exactly the WAV
// duration -> re-encode h264/yuv420p -> mux AAC voice -> stream-copy concat.

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const WORK = __dirname;
const OUT = path.join(WORK, '..', 'darb-demo.mp4');
const capture = JSON.parse(fs.readFileSync(path.join(WORK, 'capture.json'), 'utf8'));
const timing = JSON.parse(fs.readFileSync(path.join(WORK, 'timing.json'), 'utf8'));
const FPS = 30;

function run(args, { label, cwd = WORK } = {}) {
  const r = spawnSync('ffmpeg', args, { encoding: 'utf8', cwd });
  if (r.status !== 0) {
    console.error(`FAILED [${label || 'ffmpeg'}] ffmpeg ${args.join(' ')}`);
    console.error(r.stderr ? r.stderr.split(/\r?\n/).slice(-12).join('\n') : '');
    process.exit(1);
  }
  if (label) console.log(`ok [${label}]`);
}

function probeDuration(file) {
  const r = spawnSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', file,
  ], { encoding: 'utf8' });
  const d = parseFloat(r.stdout.trim());
  if (!Number.isFinite(d)) {
    console.error(`probe failed for ${file}: ${r.stderr}`);
    process.exit(1);
  }
  return d;
}

// Frame ranges per scene (1-based scene -> {start, count}) from capture.json.
const takes = capture.takes.map(t => ({
  start: parseInt(t.frames[0].file.replace(/\D+/g, ''), 10),
  count: t.frames.length,
  duration: t.duration,
}));

const finals = [];
for (let i = 0; i < 7; i++) {
  const { start, count, duration } = takes[i];
  const factor = (duration * FPS) / count; // stretch factor: target / (count/30)
  const seg = path.join(WORK, `seg-${i}.mp4`);
  const ava = path.join(WORK, `ava-${i}.mp4`);

  // 1) Frames -> exact-duration video (setpts stretch), h264 yuv420p @30.
  run(
    [
      '-y',
      '-framerate', String(FPS),
      '-start_number', String(start),
      '-i', 'frames/frame-%05d.jpg',
      // trim: take exactly this scene's frames (do NOT use -frames:v, it
      // caps the *output* frames after duplication).
      // setpts: stretch timeline to the scene duration.
      // fps: duplicate to a constant 30fps so each frame is held for
      // duration/count. (do NOT pass -r: it re-timestamps and undoes the
      // stretch)
      '-vf', `trim=end_frame=${count},setpts=PTS*${factor.toFixed(9)},fps=${FPS},format=yuv420p`,
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
      '-pix_fmt', 'yuv420p',
      '-an', seg,
    ],
    { label: `scene ${i + 1} video (${count}f -> ${duration.toFixed(3)}s)` }
  );

  const got = probeDuration(seg);
  const drift = Math.abs(got - duration);
  if (drift > 0.12) {
    // Safety net: pad with cloned last frame + trim to target.
    const pad = Math.max(0, duration - got);
    const tmp = `${seg}.pad.mp4`;
    run(
      [
        '-y', '-i', seg,
        '-vf', `tpad=stop_mode=clone:stop_duration=${pad.toFixed(4)}`,
        '-t', String(duration),
        '-r', String(FPS),
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
        '-pix_fmt', 'yuv420p', '-an', tmp,
      ],
      { label: `scene ${i + 1} pad (drift ${drift.toFixed(3)}s)` }
    );
    fs.renameSync(seg, `${seg}.orig`);
    fs.renameSync(tmp, seg);
  } else {
    console.log(`   duration ${got.toFixed(4)}s (target ${duration.toFixed(4)}s, drift ${drift.toFixed(4)}s)`);
  }

  // 2) Mux voice (video untouched; audio = the WAV).
  run(
    [
      '-y', '-i', seg,
      '-i', `voice-${i + 1}.wav`,
      '-map', '0:v:0', '-map', '1:a:0',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k',
      ava,
    ],
    { label: `scene ${i + 1} audio` }
  );
  finals.push(ava);
}

// 3) Concat (identical encode params -> stream copy).
const listFile = path.join(WORK, 'concat-final.txt');
fs.writeFileSync(listFile, finals.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n') + '\n');
run(
  ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', OUT],
  { label: 'concat 7 scenes -> darb-demo.mp4' }
);

const total = probeDuration(OUT);
console.log(`FINAL: ${OUT}`);
console.log(`duration ${total.toFixed(4)}s  limit 30.000s  ${total <= 30 ? 'OK' : 'OVER LIMIT'}`);
