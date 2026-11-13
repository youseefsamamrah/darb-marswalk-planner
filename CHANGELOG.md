# CHANGELOG

## 30-second demo video (2026-11-13)
- Recorded the running tour of the real app (browser screencast, 169 frames in 7 scenes, `tools/record_demo.cjs`),
  generated a 7-line English voice-over on-device (Piper TTS), burned captions into the app's own caption bar,
  and assembled `docs/video/darb-demo.mp4` with ffmpeg (`docs/video/work/assemble.cjs`).
- Final: 27.74 s, 1920×1080 H.264 + AAC, hosted in the repo, public no-login link added to README and
  SUBMISSION.md ("Link to Project Demo"). Voice lines match the screen; Ask Darb's answer is the real
  on-device answer streamed during recording (10.5° slope, 3 h 05 min, 2.4 s on qwen3.5:9b).

## QA verification follow-up (2026-11-12)
- Isolated each hour/minute pair and the whole duration, including the HUD, so Arabic unit letters cannot reorder
  the time components. Tour durations with Latin units also use `<bdi dir="ltr">`.
- Re-tested in Chromium at 1440×900 and 375×812, 375×667 and 375×568: English/Arabic, all six layer toggles,
  all five CRISM options, opacity, demo route and pane order, buddy mode, HUD, clear, and all ten tour steps in each language.
- All eight waypoint popups scrolled within the map; a deliberately delayed photo triggered `popup.update()`;
  an open popup resized to fit the mobile map. Sources expanded/collapsed by mouse and keyboard, retained live
  credits, translated with the language, and expanded again on desktop. No browser JavaScript errors.
- Verified Arabic hours appear before minutes, Data Check labels distinguish signed mean bias from median absolute
  difference, and team contribution fields remain blank without unsupported idea-origin claims.
- `node --test tests`: 20/20 passed. All app JavaScript syntax checks and `git diff --check` passed.
- Ask Darb's offline message passed. Live AI answer evaluation could not run: Ollama was not listening on port 11434.

## Round 8 — manual QA report + fresh-eyes code review (2026-11-12)
**Why:** a manual QA test and a Reviewer agent (fresh, read-only) each produced a ranked list of problems.

**QA report fixes (all 4)**
1. *Arabic: numbers with units scrambled by RTL; English left in Arabic mode; CRISM drop-down clipped.* Every value with
   a Latin unit is wrapped in `<bdi>` (route card, weather, popups, data check). Times use Arabic units in Arabic
   ("1 س 38 د"). Translated: Opacity, Sources, CRISM options (now short names), "what do the colours mean?", the
   A* route message, HUD warnings, popup labels, REMS words (Sunny/Moderate…), "mean", "per day".
   Drop-down: `min-width:0` + ellipsis. → Tested: "2.73 km" renders left-to-right inside Arabic text; drop-down inside the panel.
2. *Waypoint popup ~626 px tall, top cut off.* `maxHeight: 340` (content scrolls), the photo has width/height
   attributes so the popup knows its size before loading, and `popup.update()` runs after the photo loads so
   auto-pan works. → Tested with the stop near the top edge: popup 364 px, fully inside the map.
3. *Route hard to see over the slope layer.* Dark 12 px halo + 6 px safety-colour line + white dotted centre, drawn
   in its own pane above the Curiosity stop markers (start/goal pins and popups stay on top).
4. *Data check "3.7 m apart on average (median 12.1 m)" confusing.* Now: "signed mean bias (ours − HRSC) +3.7 m
   (ours slightly higher); median absolute difference 12.1 m" — also in Ask Darb's facts, SUBMISSION, SOURCES, TEAM-GUIDE.

**Reviewer findings fixed (verified by the Lead)**
- Scale bar used Earth's radius (≈1.9× wrong) → map CRS now uses the Mars radius; tested: "5 km" bar = 5,029 m.
- Snap could move a point ~180–212 m though the message says 150 m → limit is now a real distance; new unit test.
- Grid edges: overlays used the box, clicks used whole cells (up to ~12 m drift at S/E edges) → exact cell edges
  used everywhere (and written by the build script from now on).
- Tour didn't follow a language switch → captions refresh immediately; tour no longer resets the user's buddy distance;
  step 9 asks Ask Darb only once per tour.
- Repeated/duplicate Ollama requests → one question at a time; a connection lost mid-answer keeps the partial text and
  shows a translated message.
- HUD distance (2.71 km) vs card (2.73 km) used different methods → both use cell-to-cell metres.
- CRISM images: "not loaded yet" no longer reported to the AI as "outside coverage"; image loaded only once.
- Popup/weather values from data files are HTML-escaped.
- Numbers typed into the tour/AI facts/eval (4.2 m, 20°, 2.7 km) are now computed live from the data.
- Eval checker reads the Arabic decimal mark "٫". SOURCES "3 × 3 samples" → "6 × 6, 4 m apart". Outdated comments fixed;
  thresholds read from `route.js` instead of typed in.
**Found during re-testing:** the browser served a cached old `index.html` → new `tools/serve.py` (Python's server +
`Cache-Control: no-cache`), used by `start.bat`.
**Team edits included in this commit:** a collapsible "ⓘ Sources" box for the map credits on small screens,
`{distance}`/`{algorithm}` placeholders in messages, popup width that fits narrow screens.

**Tested:** `node --test tests` 20/20; browser (separate tab): demo 2.73 km 🟡; start = goal, outside, too-steep goal
(snapped 50 m), south-east edge click; buddy; all 10 tour steps + language switch mid-tour; HUD; Arabic + English;
Ask Darb **offline** path in both languages (Ollama was not running during this re-test).
**Not re-verified this round:** the Ask Darb 18-question test set, because Ollama was stopped — re-run
`http://localhost:8000/?eval=qwen3.5:9b&runs=2` once Ollama is running.

## Round 7 — Space Agency Partner data: ESA Mars Express HRSC elevation cross-check (2026-11-12)
**Why:** the guide encourages 2026 Space Agency Partner data; an independent check also strengthens "validity".
**What we looked at**
- UAE Hope mission (Mohammed Bin Rashid Space Center): its Science Data Center sends both data search and quicklook to a
  sign-in page, so we did not use it (creating an account is the team's decision).
- ESA: Mars Express HRSC is available as the USGS "MOLA – MEX HRSC Blended DEM Global 200m v2" (11.4 GB BigTIFF).
**What changed**
- New `tools/hrsc_check.py`: parses the BigTIFF header and reads only ~65 rows over our box with HTTP range requests
  (no big download); compares each 200 m pixel with the mean of our 25 m HiRISE cells → `data/hrsc_check.json`.
- Result: **3.7 m mean difference**, median 12.1 m, 95th percentile 44 m over 4,416 pixels. At Curiosity's stops the
  HRSC blend is 4–18 m off the rover's altitude; our HiRISE grid is within 4.2 m.
- App: new "Data check" card (EN/AR); Ask Darb facts include the check.
- SUBMISSION.md partner-data field, SOURCES.md, README, TEAM-GUIDE updated.
**Tested:** Ask Darb test set 36/36 (2 runs, 1.8 s); Ask Darb answers the ESA question correctly; `node --test tests` 19/19.

## Round 6 — matched the official 2026 Project Submission Guide (2026-11-12)
**Why:** the guide was published today; a submission that breaks a rule (demo length, SI markers) can lose eligibility.
**What changed**
- `docs/SUBMISSION.md` rewritten with the **official field names** (Project Name, High-Level Project Summary, Link to
  Project Demo, Link to Final Project, Detailed Project Description, Use of SI, NASA Data, Space Agency Partner Data and
  Other References), submission times (Sat 14 Nov 9:00 → Sun 15 Nov 23:59 local), English-only rule, current numbers
  (19 tests, 54/54 Ask Darb test set, 0 internet requests). Partner data: honestly "none used directly".
- `docs/DEMO-VIDEO.md`: ≤ 30 s video or ≤ 7 slides (over the limit = not eligible for Global Judging); English subtitles;
  slide deck must show team name, member names and challenge
  — flagged for the team to decide, because our own rule was "no names".
**Tested:** all JS/Python files still parse; `node --test tests` 19/19; app loads, demo route 2.73 km 🟡, tour and Ask Darb work.

## Round 5 — guided tour for the pitch + offline audit (2026-11-12)
**Why:** judging criterion "presentation" — a live demo must not depend on the presenter's memory or on Wi-Fi.
**What changed**
- New `js/tour.js` + "▶ Tour" button: 10 steps (EN/AR) matching the pitch script; each step sets the map up from a
  clean state; captions use live numbers; keys → / Space / ← / Esc.
- Offline audit of the full tour: first run found 6 map tiles at zoom 9 just outside the cache → wider tile margin at
  zoom 8–10 (322 tiles, 18 MB total). Second run still requested them: the browser used a stale `tiles/index.json`
  → all data now loads with `cache: "no-cache"`. Final audit: **108 requests, 0 to the internet**.
- Narrow screens: the tour box was covered by Leaflet's attribution bar (Next not clickable) → moved above Leaflet's
  controls and to the top of the map on small screens.
- Step 7 wording: "NASA expects pairs" → "the challenge suggests astronauts may work in pairs" (matches the source).
- PITCH.md: tour instructions + demo-day checklist (Wi-Fi off, warm up the AI, step through once).
**Tested:** all 10 steps (layers, popup, buddy, HUD, Ask Darb) in English and Arabic; Next clickable at 268 px width;
`node --test tests` 19/19.

## Round 4 — measured Ask Darb accuracy (2026-11-12)
**Why:** judging criterion "validity". "The AI seems right" is not evidence; a score is.
**What changed**
- New `js/eval.js` (runs only with `?eval`): 18 fixed questions — 12 facts (expected answers read from the app's real
  data), 6 "unknown" questions (must say "I don't know"). `&runs=N` repeats the set.
- Reading the first answers by hand found 3 invented details (steepest point "at waypoint 7", Arabic "2.73 km includes
  the return", "within normal radiation limits"). Fixes: facts now say the distance is ONE WAY and give the steepest
  point's position; system prompt forbids judgements not in the facts; 3 trap questions added.
- Checker normalises special hyphens, thin spaces and curly apostrophes (it had failed correct gpt-oss answers).
- `docs/ASK-DARB-EVAL.md` with method, results and limits; linked from README, AI-USAGE, TEAM-GUIDE.
**Tested**
- qwen3.5:9b: **54/54 over 3 runs**, 1.9 s per answer. gpt-oss:20b: 54/54, 2.8 s (answered once in Spanish in an
  earlier run). Default stays qwen3.5:9b (faster, vision).
- `node --test tests` 19/19; normal app (without `?eval`) unchanged.

## Round 3 — metre-scale roughness from the 1 m HiRISE data (2026-11-12)
**Why:** validity. The 25 m slope cannot see rocks or the 1–2 m boxwork ridges (our own "honest limit" from round 2).
**What changed**
- `build_data.py`: each cell now reads a 6×6 patch of 1 m HiRISE pixels, 4 m apart (mean elevation + **roughness** =
  90th-percentile slope between neighbouring samples). Grid file 6.4 MB, build 67 s.
- `route.js`: roughness above 25° adds cost (never blocks); routes with > 15 % very rough ground (> 40°) → 🟡 Caution.
- UI: new "Rough ground" layer (yellow 25–40°, purple > 40°), route-card row, hover value, HUD "ROUGH GROUND AHEAD",
  roughness in Ask Darb's facts; English + Arabic.
- Thresholds calibrated on Curiosity's 2025 stops (roughness 10–22°, places the rover chose as safe); written as our assumption.
**Tested**
- `node --test tests` → **19/19** (new: rough costs more but is not blocked; route walks around a rocky strip).
- Browser: demo route unchanged (2.73 km, 🟡 Caution) with 0 % very rough ground — A* threads between rough ridges;
  20 km route 5 % very rough; layer shows ridge lines that match the CTX image; Arabic labels; HUD; no new console errors.

## Round 2 — HiRISE 1 m elevation: 25 m route grid (2026-11-12)
**Why:** validity. MOLA (463 m pixels) smoothed the terrain; slopes and elevations were too rough for a walk.
**What changed**
- Downloaded the USGS "MSL Gale DEM Mosaic 1m v3" (HiRISE stereo, 3.87 GB) to `raw/hirise_dem/` (git-ignored) — approved by the team.
- New `tools/hirise_dem.py`: reads that GeoTIFF with the Python standard library only (TIFF tags + LZW decoder);
  can also read just the needed rows over HTTP range requests, so teammates don't need the 3.9 GB file.
- `build_grid()` now samples HiRISE (3×3 per cell) into a **515 × 560 grid of ~25 m cells** (was 120 × 131, ~107 m);
  MOLA fills any HiRISE gaps (0 cells needed). Build time 34 s.
- `route.js`: buddy-mode check rewritten with prefix sums (1000 m gap: 4 ms instead of ~480 M checks);
  new "snap" — a START/GOAL on blocked ground moves to the nearest walkable cell within 150 m, with a message (EN/AR).
- `app.js`: walk simulation lasts ~20 s for any route length; labels/attribution/Ask Darb facts now say "HiRISE DEM".
- `index.html`: `?v=3` version tags so browsers don't use stale cached JS (found when the snap message showed a raw key).
- CSS: no sideways scroll on narrow screens; top bar wraps.
- Docs agent updated README, SOURCES, TEAM-GUIDE, AI-USAGE, SUBMISSION, PITCH, DEMO-VIDEO with the new numbers.
**Tested**
- Grid vs Curiosity's own recorded elevation at 8 stops: max difference **4.2 m** (MOLA: 44 m).
- Slopes: median 10.6°, 15.6 % of cells > 20° (blocked) — real ridges and scarps now visible.
- `node --test tests` → **17/17** (new: fast buddy check = brute force on random grids; 2 snapping tests).
- Browser: demo 2.73 km, 1 h 38 min, 🟡 Caution (max 10.5°), A* 2–3 ms; 20 km route 82 ms; buddy 100 m → goal snapped 50 m,
  5.29 km 🔴 Danger; buddy 300 m → "no safe route"; Arabic snap message; narrow layout OK.

## Round 1 — offline map tiles + pitch documents (2026-11-12)
**Why:** the core pitch is "works on Mars with no internet", but the map imagery still came from the internet (MVP gap).
**What changed**
- `tools/build_data.py tiles` saves the Mars Trek tiles covering the study area (Viking, CTX, THEMIS, MOLA:
  194 tiles, 10.9 MB) to `tiles/` + `tiles/index.json`.
- `js/app.js`: new `LocalFirstTiles` layer — uses the saved tile when it exists, otherwise Mars Trek online
  (the index avoids 404 errors).
- CRISM legend shortened to one line with a fold-out "what do the colours mean?" (polish).
- Pitch agent wrote `docs/SUBMISSION.md`, `docs/PITCH.md`, `docs/DEMO-VIDEO.md`, `TEAM-GUIDE.md`; Lead checked them
  and updated the "tiles need internet" statements.
**Tested:** demo view at zoom 12 → 13/13 tiles from the device, 0 from the internet; route still 2.19 km 🟢;
`node --test tests` 14/14; no new console errors.

## Round 0 — MVP (2026-11-12)
**What changed**
- Laptop check: i7-14700F, 32 GB RAM, RTX 5060 Ti 16 GB VRAM, 650 GB free. Ollama 0.40.13 and suitable
  models were already installed → no installs or downloads needed.
- Data agent: verified every NASA URL; `tools/build_data.py` builds `data/` (MOLA range read, THEMIS tile
  decode, CRISM browse, REMS, RAD, Curiosity waypoints + 8 Navcam photos).
- Algorithm agent: `js/route.js` (cost grid, A*, Tobler-style walking time, O₂ budget, safety score,
  buddy mode) + 14 unit tests.
- Map/UI agent: Leaflet map in EPSG:4326 matching Mars Trek tiling, 5 toggleable layers, route card,
  waypoint popups, HUD mode + walk simulation, Arabic RTL toggle.
- Local AI agent: Ask Darb (Ollama streaming, grounding, timing, offline state, vision); `tools/local_agent.py`.

**Bugs found and fixed during the round**
1. Ask Darb said the place was "Venus": the raw JSON context was too long, so Ollama's default context
   window cut off the system prompt. Fix: plain-English facts (CRISM numbers → strong/moderate/weak/none),
   `num_ctx: 8192`, stronger "use only the FACTS" instruction.
2. Photo answers ignored the image, then became over-cautious ("I don't know"). Fix: separate prompt for
   photo questions (describe what is visible → link to facts → safety tip).
3. Raw-image picker chose a poor Mastcam close-up. Fix: full-frame Navcam, mast elevation closest to −20°.
4. Unit test expectation for buddy mode was wrong (correct answer is "no-path"); test fixed, code was right.
5. Route longer than the O₂ budget only said "< 25 % reserve". Fix: new reason "round trip is LONGER than the O₂ budget".
6. Demo goal moved to Curiosity's sol 4660 stop (Sept 2025), inside the boxwork period NASA documents.

**Local-model review (gpt-oss:20b) — Lead decisions**
- Used: skip zero-length steps in `routeStats` (avoids divide-by-zero).
- Not used (7 items): extra NaN checks for missing grid fields — our grid is generated and never has
  missing values; duplicate heap entries are the standard "lazy deletion" A* approach and are correct.

**What was tested**
- `node --test tests` → 14/14 pass (incl. real Mars grid route in < 1 s).
- Browser: map loads with 0 console errors; demo route 2.19 km, 🟢 Safe, A* 1 ms; errors for start = goal,
  outside area, start blocked, goal blocked; buddy mode; Arabic RTL; HUD + simulated walk;
  Ask Darb online (1.4–6.3 s answers) and offline (shows "Ask Darb is offline", recovers).
