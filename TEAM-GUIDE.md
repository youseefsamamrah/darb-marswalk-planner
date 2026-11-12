# TEAM-GUIDE — how Darb works (explain it in your own words)

This guide explains every part of the code simply, so each of us can answer judges' questions.

## 1. File map
| File | What it does |
|---|---|
| `index.html` | The page: top bar, side panel (layers, route card, weather, Ask Darb), map, HUD overlay |
| `css/style.css` | Dark theme (navy, Mars orange, light blue), HUD visor look, Arabic right-to-left layout |
| `js/config.js` | All settings in one place: map centre, Mars Trek layer names, slope limits, Ollama address |
| `js/i18n.js` | English and Arabic text; `apply()` swaps every label and flips the page to right-to-left |
| `js/route.js` | The brain: cell cost, A* path-finding, walking time, O₂, safety score. Also runs in Node for tests |
| `js/askdarb.js` | Talks to Ollama on this computer for "Ask Darb" |
| `js/app.js` | Builds the map and layers, handles clicks, draws the route, waypoints, HUD, walk simulation, Ask Darb context |
| `tools/build_data.py` | Downloads the real NASA data and builds the files in `data/` |
| `tools/local_agent.py` | Sends simple jobs (first-pass review, test ideas, summaries) to a local model; output is a draft we check |
| `tests/route.test.js` | 14 automatic tests for `route.js` (`node --test tests`) |
| `data/` | `grid.json`, `environment.json`, `waypoints.json`, `crism/*.png`, `images/wp1-8.jpg` |
| `vendor/leaflet/` | The Leaflet map library, saved locally so it works offline |

## 2. How the data was built (`tools/build_data.py`)
It uses only Python's standard library. Our study box is 4.6935°S–4.9100°S, 137.3012°E–137.5362°E — exactly the
area covered by the CRISM observation, so every layer covers the whole box.

- **MOLA elevation.** The MOLA file for this part of Mars is 130 MB. Each row of the file is one line of latitude, so we
  ask the server for **only the rows we need** (an HTTP *range request*, about 0.8 MB). Values are metres.
- **Bilinear interpolation.** MOLA pixels are ~463 m, our grid cells are ~107 m (0.0018°). For each cell we blend the
  4 nearest MOLA pixels, weighted by how close they are.
- **Slope by central differences.** For each cell: (elevation of right neighbour − left neighbour) ÷ (2 × cell width)
  gives the east–west steepness; the same for north–south. Combine them (Pythagoras), then `atan` → degrees.
- **THEMIS night infrared.** We download the zoom-9 Mars Trek tiles (PNG images, ~81 m per pixel) and decode them with
  our own small PNG decoder. For each cell we average 9 sample pixels. Then a **percentile stretch**: the 2nd-percentile
  brightness becomes 0 and the 98th becomes 1. So the value is *relative* (0 = coldest at night = loose sand/dust,
  1 = warmest = rock).
- **CRISM.** We download 5 browse images of observation FRT0000B6F1 (clays, sulfates, mafic minerals, iron minerals,
  true colour) plus each image's exact corners and band names from its PDS label.
- **REMS weather.** The last 30 sols from NASA's public REMS feed (air and ground temperature, pressure, UV, sky).
- **RAD radiation.** The published surface value 0.64 ± 0.12 mSv/day (Hassler et al. 2014, *Science*).
- **Waypoints.** Curiosity's real positions in our box; 8 evenly spaced stops between sols 4480 and 4800, each with a
  full-frame Navcam photo looking at the terrain ahead (saved locally) and a Mastcam link.
- **Offline map tiles.** `build_tiles()` saves the Mars Trek tiles that cover our area (Viking, CTX, THEMIS, MOLA;
  194 tiles, ~11 MB) into `tiles/` and writes `tiles/index.json`. In `app.js`, the `LocalFirstTiles` layer checks that
  index: if a tile is saved on the device it uses it, otherwise it asks Mars Trek over the internet.

## 3. The cost of a cell (`cellCost` in `js/route.js`)
```
if slope > 20°                → BLOCKED (cost = Infinity)
cost = 1 + 1.5 × (slope / 10)²            ← steeper costs much more
if thermal < 0.25 (loose sand): cost += 2 × (0.25 − thermal) / 0.25
```
Flat hard rock costs 1. A 10° slope costs 2.5. A 20° slope costs 7. Pure sand adds up to 2 more.
These limits are **our assumptions**, not NASA rules.

## 4. A* (A-star) path-finding
**Analogy:** you are in a city and want the quickest way to a friend's house. You always explore the street that looks
best = "how far I've already walked" + "straight-line distance still to go". You never waste time on streets that go the
wrong way, but you never skip the real best route either.

In Darb: the map is a grid; from each cell you can step to 8 neighbours. A step costs
`distance in metres × average cost of the two cells`. The "guess" (heuristic) is the straight-line distance to the goal
× 1 (the cheapest possible cost), so it never overestimates → A* is guaranteed to find the lowest-cost path.
A *priority queue* (binary heap) always gives us the most promising cell next. It takes about 1 ms.

Error messages: outside the box, start = goal, start blocked, goal blocked, no possible path.

## 5. Walking time, O₂ and the safety score (`routeStats`)
- **Speed:** Tobler's hiking formula, scaled so flat ground = **2 km/h** for a suited astronaut. Slightly downhill is
  fastest; steep up or down is slower; never slower than 0.3 km/h. We compute the trip out *and* the trip back.
- **O₂ budget:** we assume **8 hours** of life support for the whole EVA (out and back).
  O₂ reserve = 1 − round-trip time ÷ 8 h.
- **Safety score:**
  | Rule | Result |
  |---|---|
  | max slope > 15° | 🔴 Danger |
  | max slope > 10° | 🟡 Caution |
  | round trip > 8 h (more than the budget) | 🔴 Danger |
  | round trip > 6 h (reserve < 25 %) | 🔴 Danger |
  | round trip > 4 h (reserve < 50 %) | 🟡 Caution |
  | more than 20 % of the route on loose sand | 🟡 Caution |
  The worst rule wins, and the card lists the reasons.
- **Radiation dose:** 0.64 mSv/day × round-trip hours ÷ 24.

## 6. Buddy mode
Two astronauts walk side by side up to X metres apart, so the path must be wide. We "grow" every blocked cell by half
of X: any cell closer than X/2 to a blocked cell is also blocked. Then A* runs as normal.

## 7. The map (`js/app.js`)
- Leaflet with `L.CRS.EPSG4326` (plain latitude/longitude). Mars Trek tiles use the same tiling (2 × 1 tiles at zoom 0),
  so the tile URL `{z}/{y}/{x}` lines up exactly.
- Base: Viking colour mosaic everywhere + CTX mosaic over Gale Crater (sharper, up to zoom 12).
- The slope layer is drawn by us: one coloured pixel per grid cell on a canvas, stretched over the box.
- CRISM images are placed with their exact corners. Hovering reads the data under the mouse.

## 8. HUD mode and the Earth delay
HUD mode hides the panel and shows a visor overlay: compass (direction to a point a few steps ahead), distance to goal,
O₂ time left, slope, and warnings (steep slope ahead, loose sand ahead, keep O₂ for return). "Simulate walk" moves an
astronaut marker along the route.
**Earth delay:** we model Earth and Mars as planets on circles around the Sun (1 AU and 1.524 AU) moving at their average
speeds, find the distance between them today, and convert: 1 AU = 8.317 light-minutes. It is an estimate (≈ ±1 min).

## 9. Ask Darb (`js/askdarb.js` + `buildContext` in `js/app.js`)
- Talks to Ollama at `http://localhost:11434`. If it does not answer within 2.5 s, the app shows
  "Ask Darb is offline" and everything else keeps working. Status is re-checked every 15 s.
- **Grounding:** before each question we write the current facts in plain English: the place, our slope rules, weather,
  radiation, the route numbers and safety score, and data at the start/middle/goal and at all 8 waypoints. CRISM colour
  values are turned into words (strong / moderate / weak / none).
- Settings: `num_ctx: 8192` (so the facts are never cut off — our first test failed because they were!),
  `think: false` (faster), `temperature: 0.2` (fewer made-up facts).
- Rule: use only the facts; otherwise say **"I don't know"**.
- **Photos:** if a question mentions a photo and a waypoint number, the local Navcam image is sent to a vision model
  (qwen3.5:9b), which first describes what it sees, then links it to the data.
- The app shows the model name and response time for every answer.

## 10. Known limits (say these honestly)
- MOLA pixels are ~463 m, so slopes are smoothed; small steep spots and boulders can be missed.
- THEMIS values are relative (stretched image), a proxy for thermal inertia, not exact numbers.
- CRISM browse images are qualitative colour maps, not mineral identifications.
- The REMS feed is outreach data (from Centro de Astrobiología); scientific data is in NASA's PDS.
- Map tiles are saved only for our study area (zoom up to 12); zooming further out or elsewhere needs internet.
- Slope limits, 2 km/h and the 8 h budget are our assumptions.
- The AI can still be wrong; it explains but does not decide the safety score.

## 11. Who explains what (fill in)
| Topic | Team member |
|---|---|
| The idea, location and science goal (boxwork) | ________ |
| NASA data and how we built it | ________ |
| Cost function and A* | ________ |
| Walking time, O₂, safety score, buddy mode | ________ |
| Map, layers, HUD, Arabic | ________ |
| Ask Darb (offline AI) and its limits | ________ |
| Demo driver | ________ |
