# PLAN.md — Darb (دَرْب) Marswalk Planner

NASA Space Apps Challenge 2026 · Challenge: **Interplanetary Survival Guide: Martian Map**

## 1. Goal
An offline-first web map that helps a suited astronaut plan a **safe walk** on Mount Sharp
(Gale Crater, Mars) to the **boxwork** formations Curiosity studied in 2025, using real NASA data.
The AI assistant ("Ask Darb") runs locally on the astronaut's device because Earth is 4–24 light-minutes away.

## 2. Study area (verified)
| Item | Value | Source |
|---|---|---|
| Gale Crater centre | ~5.4°S, 137.8°E | USGS Gazetteer |
| Curiosity on sol 5070 (latest) | 4.8257°S, 137.3892°E | MSL MMGIS waypoints feed |
| Curiosity in boxwork region (sols ~4560–4680, Jun–Sep 2025) | ~4.80°S, 137.38°E | MSL MMGIS waypoints feed |
| Planning box | 4.91°S–4.69°S, 137.30°E–137.54°E | = footprint of CRISM FRT0000B6F1, so every layer covers it |

## 3. File structure
```
index.html            app page
css/style.css         dark UI theme
js/config.js          constants, layer URLs, source list
js/i18n.js            English / Arabic strings
js/route.js           cost grid + A* (works in browser AND Node for tests)
js/askdarb.js         offline AI client for Ollama (localhost:11434)
js/app.js             map, layers, clicks, route card, HUD, waypoints
vendor/leaflet/       Leaflet 1.9.4 (local copy so the app works offline)
data/grid.json        elevation/slope/thermal grid built from real data
data/environment.json REMS weather + RAD radiation values
data/waypoints.json   Curiosity positions + raw image links (2025 boxwork campaign)
data/crism/*.png      CRISM browse images (real, from PDS)
tools/build_data.py   rebuilds every file in data/ from NASA servers (Python stdlib only)
tests/route.test.js   unit tests for the A* planner (node --test)
start.bat             starts a local web server on Windows
```

## 4. Tasks and owners
| # | Task | Owner agent | Status |
|---|---|---|---|
| 1 | Laptop check, Ollama + model selection | Local AI | done (no download needed) |
| 2 | Verify every data URL, build data/*.json, SOURCES.md | Data | done |
| 3 | route.js: cost grid, A*, route stats + unit tests | Algorithm | done (14 tests) |
| 4 | index.html, CSS, Leaflet map, layer toggles, route card, Arabic toggle | Map/UI | done |
| 5 | Ask Darb (Ollama client, grounding, timing, offline state) | Local AI | done |
| 6 | Integrate | Lead | done |
| 7 | Click-test every feature + edge cases, bug list | QA/Tester | done (round 0) |
| 8 | Code review: bugs, comments, rule check | Reviewer | done (local model first pass + Lead) |
| 9 | Extras: waypoints + rover photos, HUD, buddy mode | Map/UI + Algorithm | done |
| 10 | README, TEAM-GUIDE, AI-USAGE, submission text, pitch, video script | Pitch | README/AI-USAGE/SOURCES done; rest in progress |

Agents never edit the same file at once; the Lead merges.

## 5. Definition of done (MVP)
- `start.bat` → open http://localhost:8000 → Mars map of Mount Sharp loads with zero console errors.
- ≥3 toggleable data layers (slope, THEMIS thermal, CRISM minerals) + radiation/weather panel.
- Click START and GOAL → dotted safest route appears in < 1 s.
- Route card: distance, walking time, O2/time budget, safety 🟢/🟡/🔴.
- Edge cases handled with a clear message: start = goal, goal on blocked cell, no route, click outside the data area.
- Ask Darb answers when Ollama runs and shows "Ask Darb is offline" when it does not.
- Every number shown is traceable to SOURCES.md, or labelled **SAMPLE DATA**.
- `node --test tests` passes.

## 6. Improvement loop
QA + Reviewer rank issues → Lead picks top 1–3 (bugs → MVP gaps → extras → polish → judging criteria)
→ fix → re-test → CHANGELOG.md entry → git commit → 3-line summary.
