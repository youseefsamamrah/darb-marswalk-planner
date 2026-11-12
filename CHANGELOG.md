# CHANGELOG

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
