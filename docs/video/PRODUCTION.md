# Darb demo video — production notes

**AI-assisted video · AI voice (TTS).** The video is genuine screen footage of the working Darb app, assembled
with AI assistance (Claude Code) and narrated by an AI text-to-speech voice. The app footage is not generated.

| | |
|---|---|
| File | `docs/video/darb-demo.mp4` (not uploaded anywhere by these scripts) |
| Length | **27.867 s** container and video, 27.861 s audio (limit: 30.0 s) — measured with `ffprobe` |
| Format | MP4, H.264 High, 1920×1080, constant 30 fps (836 frames), yuv420p, BT.709, fast-start; AAC stereo 48 kHz |
| Size | 24,402,367 bytes (23.3 MB) |
| SHA-256 | `6804f8b7dd72d0315cc08d6ee480feb2b132d63bdcac1e6ec05096bd222f5c51` |
| Subtitles | `docs/video/darb-demo.srt` (English, same timings as the burned-in captions) |
| Narration source | `docs/video/narration-elevenlabs-george.mp3` (the AI voice take the video is cut from) |
| Stills | `docs/video/stills/scene-1.jpg … scene-7.jpg`, `docs/video/contact-sheet.jpg` (taken from the final MP4) |
| Recorded | 13 Nov 2026 15:52 UTC, app commit `3de09d3`, from `http://localhost:8000` |
| Music / sound effects | none |

## What is real and what is editorial

**Real (recorded from the running app):** every screen, the map and data layers, the route and all route-card
numbers, the Curiosity photo and its credit, the helmet HUD readings, the Ask Darb question, answer, model name
and timing.

**Editorial (added in the edit, drawn outside or clearly on top of the footage):** the top strip and caption
bar, the label "AI-assisted video · AI voice (TTS)" (one fixed image on all 836 frames), the captions, the small
source labels (top left), the opening title "Team Darb · Ramallah / Challenge: the Martian Map", the closing
title "Darb / The path.", and two thin pale-blue outlines around real interface elements (the Earth-delay line
in scene 2, the oxygen row in scene 4).

**Done to the footage:** scaling to 1920×876, clean cuts, a slow push-in (4 % on scene 1, under 2 % on scenes
4, 5 and 7). Nothing is sped up, slowed down or re-ordered. The narration is never time-stretched.

## Scenes (final edit)

`window.DarbTour.show(i)` is zero-based: `show(0)` is the step the tour panel calls "1 / 10".

| # | Time (s) | Real app state | Narration (AI voice) | Voice clip |
|---|---|---|---|---|
| 1 | 0.00–2.87 | Tour step 1 (`show(0)`): Mount Sharp map, cropped to the map, one still frame | "On Mars, every step matters." | 0.45–2.42 |
| 2 | 2.87–5.37 | Tour step 1 (`show(0)`): whole app; the tour frames the study area | "Earth is minutes away." | 3.17–4.48 |
| 3 | 5.37–10.13 | Tour steps 2–4: slope (`show(1)`) → rough ground (`show(2)`) → THEMIS (the app's own check boxes) → CRISM minerals (`show(3)`) | "Darb brings NASA terrain, heat and mineral data together." | 5.62–9.17 |
| 4 | 10.13–15.10 | Tour step 5 (`show(4)`): demo route + route card | "Choose your destination. Check your path and oxygen reserve." | 10.43–14.11 |
| 5 | 15.10–18.40 | Tour step 6 (`show(5)`): Curiosity Navcam photo popup, stop 6, sol 4609 | "See the ground through Curiosity's eyes." | 15.40–17.64 |
| 6 | 18.40–21.07 | Tour step 8 (`show(7)`): helmet HUD walk simulation | "Walk with a helmet display." | 18.70–20.16 |
| 7 | 21.07–27.87 | Ask Darb with the demo route (state of tour step 9) | "Ask Darb about your route. Intelligence on your device. Darb: the path." | 21.37–27.02 |

Narration: 50 words, 19.9 s of speech including the pauses inside scenes (about 2.5 words per second),
8.0 s of silence around it, a 0.86 s quiet tail at the end. Scene lengths were calculated from the measured
narration clips (`tools/video/timing.cjs`).

Scene 3 label changes are frame-exact: the recording script notes the first video frame on which each layer
appears (frames 35, 71 and 107 of the scene) and the label switches on that frame.

## Values shown, checked against the app's own data in the recording session

- Route card (scene 4, also visible in scene 5): **Caution** (some slopes over 10°) · distance **2.73 km** ·
  walk time **1 h 38 min** · round trip 3 h 05 min · O₂ reserve after return **61% of 8 h** · climb/descent
  +135 m / −59 m · max slope 10.5° (mean 5.5°) · loose sand 0% · very rough ground 0% · radiation dose 0.082 mSv.
  These equal `Darb.stats` in the same page session (distance 2.73 km, O₂ reserve 61 %, safety "caution").
- Earth-delay line (scene 2, top bar): "Earth is 4–24 light-minutes away: Darb's AI runs on this device."
- Photo (scene 5): `data/images/wp6.jpg`, 1024×1024, shown square (aspect ratio kept). Popup text:
  "Curiosity stop #6 · sol 4609 (2025-07-24) … NAV_LEFT_B · NASA/JPL-Caltech · original".
- HUD (scene 6): goal 2.64 → 2.52 → 2.38 km, O₂ 7 h 57 min → 7 h 48 min, slope 7.8° → 4.5° → 6.2°,
  Earth delay 9.0 min (the app's own estimate for the recording date). No warning appeared in this part of the walk.

## Ask Darb — production log (genuine, recorded live)

- Ollama 0.40.13, model **qwen3.5:9b** (the app's first preferred model), running on this laptop.
- Warm-up before recording, through the app's own tour (`show(8)` asks its automatic question once):
  "Is this route safe?" → answered in 8.6 s (first words 5.7 s; the model had to load). Then the page was
  reloaded for an empty chat.
- **Recorded question** (typed into the app's own text box and sent with the Enter key, during the recording):
  "In one sentence: how much oxygen is left after the return?"
- **Recorded answer** (unchanged, at its real speed):
  "After returning, 61% of the O2 reserve remains [CURRENT ROUTE]."
- App status line under the answer: "qwen3.5:9b · 0.7 s (first words 0.4 s) · on-device, no internet".
- Timing inside scene 7: typing 0.26–1.84 s, Enter at 1.85 s, first words at 2.33 s, finished at 2.59 s
  (video time 22.9 s, 23.4 s and 23.7 s). The answer then stays on screen for 4.2 s.
- The answer agrees with the route card (61 %).
- Why not the tour's own question: tour step 9 automatically asks "Is this route safe?", whose honest answer is
  about 100 words and takes 3–9 s — too long to read in this scene. So scene 7 uses the same app state (demo
  route + Ask Darb card) and a shorter typed question.
- Full disclosure about retakes: the whole recording was run several times while the scripts were developed and
  again when the narration voice was replaced (every run records all scenes again and replaces the previous
  one; the answer is worded slightly differently each time). Two early runs used the question "How much oxygen
  is left after the return?"; the answers were correct (61 %) but 60–73 words long and did not fit in the
  visible panel, so the question was changed to ask for one sentence. No run was rejected because of a wrong
  answer. The run in the video is the last one.
- The complete machine-written log is `docs/video/work/capture.json` (local, not in git).

## Narration voice

- Service: **ElevenLabs text-to-speech** (cloud, https://elevenlabs.io), model **Eleven Multilingual v2**.
- Voice: **"George - Warm, Captivating Storyteller"** — one of ElevenLabs' ready-made ("premade") stock voices,
  voice ID `JBFqnCBsd6RMkjVDRZzb` (British English, middle-aged male, listed for narration). It is a stock voice
  of the service: nobody's voice was cloned or imitated for this video.
- How it was made: on 13 Nov 2026 the ten narration lines (320 characters, one line per paragraph) were typed
  into the ElevenLabs web app (Text to Speech) in a team member's signed-in browser, with the default settings
  (speed 1.0, stability 50 %, similarity 75 %, style 0, MP3 44.1 kHz 128 kb/s). The app produced two
  generations; the first one is used and kept as `docs/video/narration-elevenlabs-george.mp3`
  (384,741 bytes, 22.99 s, SHA-256 `5be8060e180da34585080f28275285c1cf2bfddf9b61f799d4dddc5e5e0784e9`).
  Only the narration text was sent to ElevenLabs.
- Why not the API: the account's API access for free use was refused by ElevenLabs ("unusual activity"), so the
  web app was used instead. `tools/video/narrate.py` still contains an API engine for later use.
- Cutting: `narrate.py` cuts that one take into its ten phrases at the pauses listed in `script.json`
  (`splitAt`, found with ffmpeg silence detection: nine pauses of 0.37–0.66 s between the lines) and joins them
  with the pauses the edit needs. Each phrase was checked against its text by length (14–19 characters per
  second; the last one, "Darb. The path.", is slower because of its own pause after "Darb"). The speech itself is not sped up, slowed down or pitch-shifted.
- Measured: median pitch about 123 Hz (range 83–145 Hz), about 2.8 words per second inside phrases, no clipped
  samples. Final loudness −18.0 LUFS, true peak −4.5 dBFS.
- Licence: ElevenLabs Terms of Use (https://elevenlabs.io/terms-of-use, version of 9 Oct 2026) say an account
  used free of charge may use the service for **non-commercial purposes only**, and that the user keeps the
  rights in the output. The account showed the 10,000-credit allowance. This hackathon video is non-commercial.
- History: the first version of this video (28.2 s) used a local voice, Piper `en_US-john-medium`. The team
  rejected how it sounded, so the narration was replaced. Its settings are kept in `script.json`
  (`voice_piper_first_version`).

## Tools

| Tool | Used for |
|---|---|
| Claude Code (Anthropic), model Claude Fable 5.2 | wrote the scripts, chose framing and timing, operated the ElevenLabs web app in the team member's browser, reviewed the stills, wrote these notes |
| ElevenLabs text-to-speech (cloud), stock voice George, Eleven Multilingual v2 | narration |
| Google Chrome 157 (headless, DevTools Protocol) | recording the app page only — no browser frame, no desktop |
| Chromium headless shell (Playwright cache) | drawing the editorial overlay images |
| FFmpeg 9.0.2 (gyan.dev full build, GPL) with libx264 and AAC | editing, encoding, measuring |
| Ollama 0.40.13 + qwen3.5:9b | the Ask Darb answer inside the app |
| Node.js 26, Python 3.15 (standard library only) | running the scripts |

Editorial text uses Segoe UI, the same font as the app.

## Capture-only changes to the page (`tools/video/capture.css`)

Injected only while recording; the app's files are unchanged. Browser-style page zoom 200 % in a 2560×1168
window (scaled to 1920×876 in the edit); larger text in the side panel, route card, chat, popup and HUD; side
panel 400 px wide; larger photo popup that shows title, photo and credit together; empty space under the last
card so the Ask Darb card can scroll to the top. Hidden: the Arabic-letter logo and the Arabic language button
(English-only video) and the tour's own instruction panel (the video has its own captions; the tour still sets
up every scene). No value, text or calculation is changed.

## How to rebuild

Needs: Python 3, Node.js 22+, FFmpeg on PATH, Google Chrome, and Ollama running with `qwen3.5:9b`. The narration
file is already in the project, so no ElevenLabs account is needed to rebuild the same video.

```
python tools/serve.py 8000                          (or start.bat) — the app
python tools/video/narrate.py                       cuts the narration take into scene clips, measures them
node tools/video/capture.cjs http://localhost:8000  records the seven scenes (stops if Ask Darb fails)
node tools/video/overlays.cjs                       captions, labels, titles as images
node tools/video/assemble.cjs                       docs/video/darb-demo.mp4 + .srt
node tools/video/review.cjs                         quality gate + stills + contact sheet
```

Ask Darb is not deterministic: a new recording gives a differently worded answer. If the narration or the
pauses in `script.json` change, run `capture.cjs` again (`assemble.cjs` refuses mismatched timings).
Working files go to `docs/video/work/` (ignored by git).

## Checks performed on the final file

- `ffprobe`: container 27.867 s; video 27.867 s; audio 27.861 s; H.264 High 1920×1080 yuv420p 30/1 fps, every
  frame exactly 1/30 s; AAC 48 kHz stereo; `moov` before `mdat` (fast-start); comment and description tags
  contain the AI disclosure.
- Looked at: one still per scene, the first and last frame, both sides of every cut, every label change in
  scene 3, and 640×360 phone-sized previews. Disclosure label present in every one; captions readable at phone
  size; route-card values readable; no error messages, people, names, NASA logos or non-English interface text.
- Colours: sampled pixels of the MP4 match the recording (for example the app's orange `#d9482b` → `#d9462a`).
- Audio by measurement: speech starts and ends inside each planned window (silence detection), no clipped
  samples, 0.86 s of silence after the last word, captions and SRT cover each spoken phrase.

## Limits — please read

- **Checked by ear by a person, not by the AI.** The AI that built the video cannot hear: the cut points of
  the narration were set and checked by measurement only. A team member listened to the final video on
  13 Nov 2026 and approved the narration voice.
- The narrator speaks a little faster inside phrases (about 2.8 words per second) than the 2–2.5 planned; the
  pauses between scenes were lengthened instead of slowing the voice.
- The narration is a cloud AI voice under ElevenLabs' free-use terms (non-commercial only).
- Scene 1 is one still frame of the real map (with an editorial push-in); scene 5 is a still popup.
- The Leaflet credit line, including Leaflet's own small flag icon, is the app's real attribution control.
- The Ask Darb answer writes "O2" and cites "[CURRENT ROUTE]": that is the model's real wording.
- Darb is a prototype, not certified navigation or life-support equipment.
