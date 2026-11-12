# Darb — Space Apps 2026 submission text (ready to paste)

> ⚠️ **Re-check before submitting.** The official **2026 Project Submission Guide is published on 13 Nov 2026**.
> The fields and limits below follow the **2025 submission format** and our best knowledge. Compare every field
> and every length limit with the 2026 guide, then paste.
> Submit through your team's project page on spaceappschallenge.org before your Local Event's end time.

---

## Project name
**Darb (دَرْب) — Marswalk Planner**

## Challenge
**Interplanetary Survival Guide: Martian Map** (2026 NASA Space Apps Challenge)

## High-level project summary (≈180 words)
Darb ("path" in Arabic) is an interactive map that helps a suited astronaut plan a **safe walk** on Mars.
We chose lower Mount Sharp in Gale Crater, where NASA's Curiosity rover studied **boxwork** ridges in 2025, and
set a science goal: walk there and collect samples. Darb layers real NASA data — CTX and Viking imagery from
Mars Trek, 1-metre HiRISE elevation, THEMIS night-time infrared (a proxy for loose sand vs. rock), CRISM mineral maps,
Curiosity's REMS weather and RAD radiation, and real rover Navcam photos. The astronaut clicks a start and a goal;
an A* path-finder picks the lowest-cost route, avoiding steep slopes and loose sand, and shows distance, walking
time, oxygen reserve, radiation dose and a 🟢/🟡/🔴 safety score. A helmet-visor **HUD mode** simulates the walk
with a compass and warnings, and **buddy mode** keeps two astronauts on a corridor wide enough for both.
Because a message to Earth takes 4–24 minutes, our assistant **"Ask Darb" runs locally** on the astronaut's own
device (Ollama), answering only from the map's data and saying "I don't know" otherwise. English and Arabic.

## Link to project demo
`[PASTE: link to 30-second video or slide deck — see docs/DEMO-VIDEO.md]`

## Link to final project
`[PASTE: GitHub repository URL]`

## Project details

### What it does
- Shows a Mars map of lower Mount Sharp with **6 toggleable layers**: terrain slope (HiRISE 1 m DEM, 25 m cells), metre-scale rough ground (rocks/small ridges, from the same 1 m DEM), thermal-inertia proxy
  (THEMIS night IR), minerals (CRISM, 4 mineral maps + true colour), elevation hillshade (MOLA), and Curiosity's
  real traverse with 8 stops from its 2025 boxwork campaign.
- **Route planner:** click START and GOAL → the safest walking route is drawn as a dotted trail.
- **Route card:** distance, one-way and round-trip walking time, O₂ reserve after return, climb/descent, max slope,
  % loose sand, radiation dose, and a safety score with reasons.
- **Waypoints:** clicking the route shows the data at that point and the nearest real Curiosity Navcam photo,
  with "what to look for" (boxwork ridges, central fractures, sandy hollows).
- **Weather & radiation panel:** latest REMS sol (air/ground temperature, pressure, UV, sky) and RAD surface dose.
- **HUD mode:** helmet-visor view with compass, distance to goal, O₂ timer, slope, Earth light-delay, and warnings
  ("steep slope ahead", "loose sand ahead", "keep O₂ reserve for return").
- **Buddy mode:** route for two astronauts who must stay within X metres of each other.
- **Snap to safe ground:** a START or GOAL clicked on too-steep ground moves to the nearest walkable spot
  within 150 m, with a message in English or Arabic.
- **Ask Darb:** offline AI assistant (local model via Ollama). Example questions: "Is this route safe?",
  "What minerals are near waypoint 3?", "Explain the rock photo at waypoint 6" (uses a vision model on the real photo).
- Works fully without internet in the study area: map tiles for Mount Sharp are saved on the device, and all
  data, routing and the AI run locally. If the AI is not running, the map still works and shows "Ask Darb is offline".

### How it works
1. A Python script (standard library only) prepares the real data. Elevation comes from the USGS **1 m HiRISE
   DEM of Gale Crater** (a 3.87 GB GeoTIFF), read with our own plain-Python TIFF reader and LZW decoder; MOLA is
   kept as an automatic gap-filler (not needed in our area). It also takes THEMIS tiles, CRISM browse images,
   REMS weather and Curiosity positions/photos, and builds a **515 × 560 grid of ~25 m cells** with elevation,
   slope and a thermal value (about 34 s).
2. Each cell gets a cost: steeper = more expensive, loose sand = more expensive, steeper than 20° = blocked.
   A point clicked on blocked ground is moved to the nearest walkable cell within 150 m.
3. **A\*** finds the lowest-cost path (2–3 ms for the demo, ~82 ms for a 20 km route across the grid).
   Buddy mode widens blocked areas with fast prefix sums (1000 m gap ≈ 4 ms).
4. Walking time uses a Tobler-style hiking formula scaled so flat ground = 2 km/h (suited astronaut).
5. Ask Darb receives the current facts in plain English (route numbers, data at each waypoint, weather) and a
   strict rule to use only those facts.

### Tested results (our demo)
Demo route from Curiosity's sol-4300 site to its sol-4660 boxwork stop: **2.73 km, 1 h 38 min one way,
3 h 05 min round trip, 61 % O₂ reserve (8 h budget), max slope 10.5° (mean 5.4°), 🟡 Caution** ("some slopes
over 10°"). A* time 2–3 ms. With **buddy mode at 100 m**, the goal moves 50 m to safe ground and the route becomes
a **5.29 km detour, 🔴 Danger** (slopes over 15°, 14 % O₂ reserve): two astronauts side by side cannot fit through
the narrow safe gaps near the boxwork. Ask Darb (qwen3.5:9b on an RTX 5060 Ti 16 GB) answered in about **1.5–6 s**.
Our grid elevation matched Curiosity's own recorded elevation within **4.2 m** at its 8 stops in 2025 (the older
MOLA data was up to 44 m off). 17 automated unit tests pass.

### Benefits and intended impact
- Puts the safety-critical layers (slope, ground hardness, radiation, weather, time/O₂) into **one** hyper-local
  view at walking scale — what global tools like Mars Trek were not built for.
- Shows that a useful AI assistant can work **with no link to Earth**, which matters for any crewed Mars mission.
- Every number is traceable to a NASA source (SOURCES.md); limits are stated openly.
- Arabic + English: makes Mars exploration data accessible to more students.

### What makes it creative
- An Arabic name and bilingual interface for a Mars tool.
- Uses Curiosity's **real path and photos** as "preview what you will see" waypoints.
- A helmet HUD simulation and a buddy-mode corridor, both suggested by the challenge.
- On-device AI that looks at real rover photos and refuses to invent facts.

### Tools, languages, hardware, software
- **Languages:** HTML, CSS, JavaScript; Python (data preparation).
- **Libraries:** Leaflet.js 1.9.4 (stored locally). No other dependencies.
- **AI (in the product):** Ollama with local open models — qwen3.5:9b (chat + vision). Others installed and
  selectable: gpt-oss:20b, qwen3.6:27b.
- **Testing:** Node.js built-in test runner (`node --test tests`).
- **Hardware used:** Windows 11 laptop/PC, Intel Core i7-14700F, 32 GB RAM, NVIDIA RTX 5060 Ti 16 GB.

## NASA data used
| Data | Use in Darb | Link |
|---|---|---|
| Viking MDIM 2.1 colour mosaic (Mars Trek WMTS) | base map, wide view | https://trek.nasa.gov/mars/ |
| MRO CTX Gale Crater mosaic (Mars Trek WMTS) | detailed base map | https://trek.nasa.gov/mars/ |
| MGS MOLA colour hillshade (Mars Trek WMTS) | elevation layer | https://trek.nasa.gov/mars/ |
| Mars Odyssey THEMIS night IR mosaic v2 (Mars Trek WMTS) | thermal-inertia proxy layer + sand cost | https://trek.nasa.gov/mars/ |
| MSL Gale DEM Mosaic 1m v3 — HiRISE stereo (USGS Astrogeology; NASA/JPL/UArizona) | elevation & slope grid for routing (25 m cells) | https://planetarymaps.usgs.gov/mosaic/Mars/MSL/MSL_Gale_DEM_Mosaic_1m_v3.tif |
| MGS MOLA MEGDR 128 pixels/degree (PDS Geosciences) | automatic gap-filler for the elevation grid | https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg128/ |
| MRO CRISM MTRDR FRT0000B6F1 browse products (PDS Geosciences) | mineral layers | https://pds-geosciences.wustl.edu/mro/mro-m-crism-5-rdr-mptargeted-v1/mrocr_4001/browse/2008/2008_191/frt0000b6f1/ |
| MSL Curiosity waypoints (MMGIS) | rover traverse and 2025 stops | https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json |
| MSL raw images (Navcam / Mastcam) | waypoint photos | https://mars.nasa.gov/msl/multimedia/raw-images/ |
| MSL REMS weather feed | weather panel | https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json |
| MSL RAD surface dose — Hassler et al. 2014, *Science* 343 | radiation dose | https://doi.org/10.1126/science.1244797 |
| NASA/JPL article on Curiosity and boxwork (Feb 2026) | science goal, "what to look for" | https://www.nasa.gov/missions/mars-science-laboratory/curiosity-rover/nasas-curiosity-rover-sees-martian-spiderwebs-up-close/ |

## Space agency partner data
- **REMS** (Rover Environmental Monitoring Station) was provided to the Curiosity mission by Spain; the weather
  feed we use is published by the **Centro de Astrobiología (CAB, CSIC-INTA)**. We use it through NASA's public
  feed. (Check whether CAB/Spain counts as a "Space Agency Partner" in the 2026 list before ticking that box.)
- No other partner-agency data is used.

## Use of Artificial Intelligence (AI / "SI")
> Note: the 2026 Participant FAQ now uses the term **"Super Intelligence (SI)"** for these tools and says every
> submission must describe how they were used. Use whichever term the 2026 form asks for.

AI tools were used in two ways. **(1) During development:** a cloud coding assistant (Claude Code, Anthropic)
helped write code, data-processing scripts and documentation drafts, and local open models (gpt-oss:20b,
qwen3.5:9b via Ollama) did first-pass code review. The team chose the challenge, location and science goal,
checked the datasets, made design decisions, tested every feature and reviewed all AI output before using it.
**(2) Inside the product:** "Ask Darb" runs an open model locally (qwen3.5:9b) with no internet; it is given only
the map's data and must say "I don't know" otherwise. It can still make mistakes, so the route safety score is
computed by our own algorithm, not by the AI. Full details: `AI-USAGE.md`.

## Tags
`#Mars` `#GaleCrater` `#MountSharp` `#Curiosity` `#Boxwork` `#EVA` `#RoutePlanning` `#Astar` `#Leaflet`
`#MarsTrek` `#HiRISE` `#MOLA` `#THEMIS` `#CRISM` `#OfflineAI` `#Ollama` `#HUD` `#Arabic` `#HumanExploration`

## References
See `SOURCES.md` in the repository for every data source, link and licence/credit line.
Image credit for rover photos: NASA/JPL-Caltech (Navcam), NASA/JPL-Caltech/MSSS (Mastcam).
