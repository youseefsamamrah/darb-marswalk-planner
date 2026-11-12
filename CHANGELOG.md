# CHANGELOG

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
