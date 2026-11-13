# Darb — Space Apps 2026 submission text (ready to paste)

> ✅ **Checked against the official 2026 Project Submission Guide** (published 12 Nov 2026):
> https://www.spaceappschallenge.org/resources/project-submission-guide/
> - Submission opens **Sat 14 Nov, 9:00** and closes **Sun 15 Nov, 23:59** (your Local Event's time zone).
> - Paste each block below into the field with the **same name** on your team's **Project** tab (My Team → Project → Edit).
>   Save often ("Save Progress"); turn the edit **Lock** on so teammates don't overwrite you.
> - Everything on the page and in linked material must be in **English**.
> - All required fields must be filled, then tick **Terms and Conditions** + **Confirm All Work is Original** → **Submit for Judging**.
> - The guide lists no character limits; the texts below are kept short so judges can read them quickly.
> - Judging criteria: **Impact, Creativity, Validity, Relevance, Presentation** (details in the 2026 Judging and Awards
>   Guide — not yet online when this was written).

---

## Project Name
Darb (دَرْب) — Marswalk Planner

## High-Level Project Summary
Darb ("path" in Arabic) helps an astronaut plan a safe walk on Mars. We chose lower Mount Sharp in Gale Crater, where
NASA's Curiosity rover studied boxwork ridges in 2025, and set a science goal: walk there and collect samples. Darb layers
real NASA data — 1-metre HiRISE elevation, CTX and Viking imagery, THEMIS night-time infrared (rock vs. loose sand), CRISM
minerals, Curiosity's REMS weather, RAD radiation and Navcam photos — into one walking-scale map. Click a start and a goal:
an A* path-finder avoids steep slopes, rough ground and sand, and reports distance, walking time, oxygen reserve, radiation
dose and a 🟢/🟡/🔴 safety score. A helmet HUD, buddy mode for two astronauts and real rover photos at each stop help the
crew know what to expect. Because a message to Earth takes 4–24 minutes, our AI assistant "Ask Darb" runs on the device
with no internet, answers only from the map's data and says "I don't know" otherwise (54/54 on our test set). It matters
because the first Mars walkers will need mission-control-quality planning without mission control.

## Link to Project Demo
`[PASTE: public link to the 30-second-or-less video OR the up-to-7-slide deck — see docs/DEMO-VIDEO.md. Test it in a private browser window: no login, no permission request.]`

## Link to Final Project
`[PASTE: public GitHub repository URL — test it in a private browser window]`

## Detailed Project Description

**What it does**
- A Mars map of lower Mount Sharp with 6 toggleable layers: terrain slope (HiRISE 1 m elevation, 25 m cells), rough
  ground (rocks and small ridges, from the same 1 m data), thermal-inertia proxy (THEMIS night IR), minerals (CRISM),
  elevation hillshade (MOLA), and Curiosity's real traverse with 8 stops from its 2025 boxwork campaign.
- Route planner: click START and GOAL → the safest walking route appears as a dotted trail. A point clicked on
  too-steep ground is moved to the nearest walkable spot within 150 m.
- Route card: distance, one-way and round-trip time, O₂ reserve after return, climb/descent, max slope, % loose sand,
  % very rough ground, radiation dose, and a safety score with reasons.
- Waypoints: a real Curiosity Navcam photo from each stop, with what to look for (boxwork ridges 1–2 m tall, central
  fractures, sandy hollows).
- Weather and radiation panel: latest REMS sol and RAD surface dose.
- HUD mode: helmet-visor view with compass, distance to goal, O₂ timer, slope, today's Earth light-delay and warnings.
- Buddy mode: a route wide enough for two astronauts who must stay within a chosen distance of each other.
- Ask Darb: an offline AI assistant (English or Arabic) for questions like "Is this route safe?", "What minerals are
  near waypoint 3?" or "Explain the rock photo at waypoint 6" (a local vision model looks at the real photo).
- A guided 10-step tour for presenting, and an English/Arabic interface.

**How it works**
1. A Python script (standard library only) downloads and prepares real data: the USGS 1 m HiRISE elevation model of
   Gale Crater (a 3.87 GB file, read with our own TIFF reader), THEMIS tiles, CRISM mineral maps, REMS weather and
   Curiosity's positions and photos. It builds a grid of 515 × 560 cells (~25 m) with elevation, slope, roughness
   (height steps over 4 m inside each cell) and a thermal value.
2. Each cell gets a cost: steeper, rougher or sandier costs more; steeper than 20° is blocked.
3. A* finds the lowest-cost path in a few milliseconds. Walking time uses a hiking formula scaled so flat ground = 2 km/h
   for a suited astronaut; oxygen use assumes an 8-hour life-support budget for the round trip.
4. Ask Darb (Ollama, local open model qwen3.5:9b) receives the current facts in plain English with a strict rule to use
   only those facts. The safety score itself is computed by our algorithm, not by the AI.
5. Map tiles for the study area are stored on the device: a full demo makes zero internet requests.

**What we measured**
- Demo route (Curiosity's 2024 site → its 2025 boxwork stop): 2.73 km, 1 h 38 min one way, 61 % O₂ reserve,
  max slope 10.5°, 🟡 Caution. With buddy mode at 100 m the two astronauts can't fit through the narrow safe gaps:
  a 5.29 km detour, 🔴 Danger.
- Our elevation matched Curiosity's own recorded elevation within 4.2 m at its 8 stops in 2025, and an independent
  model using ESA Mars Express HRSC data: average bias +3.7 m, typical (median absolute) difference 12.1 m.
- Ask Darb test set: 18 questions (12 facts, 6 with no answer in the data) × 3 runs = 54/54 correct, 1.9 s per answer.
- 20 automated unit tests for the route planner pass.

**Benefits and what we hope to achieve**
- One walking-scale view of the safety-critical data (slope, roughness, sand, oxygen time, radiation, weather) instead of
  separate regional maps.
- Shows that a useful, tested AI assistant can work with no link to Earth.
- Every number is traceable to a cited NASA source, and the limits are stated openly (e.g. single boulders are smaller than
  a 25 m cell; the slope limits and 2 km/h speed are our assumptions).
- Bilingual (English/Arabic) to bring Mars exploration data to more students.

**Tools, coding languages, hardware and software**
HTML, CSS, JavaScript (Leaflet.js 1.9.4); Python 3 (data preparation, standard library only); Node.js test runner;
Ollama with local open models (qwen3.5:9b; gpt-oss:20b for comparison); Git. Developed and tested on a Windows 11 PC
(Intel i7-14700F, 32 GB RAM, NVIDIA RTX 5060 Ti 16 GB). AI assistance in development is described in the
"Use of Super Intelligence" field and in AI-USAGE.md in the repository.

## Use of Super Intelligence (SI)
> The guide says this answer is for data collection and is **not shown to judges**, but SI markers inside the project
> (descriptive text and metadata) are. Our markers: an "AI notice" at the top of every code file, an `aiNotice` field in
> every generated data file, and AI-USAGE.md. The guide also says SI must not be used to come up with the idea.
> The team must fill in its own contribution statement in AI-USAGE.md before submission.

Yes. [Team contribution statement: ______________________________ — team to complete.]
We used a cloud AI coding assistant (Claude Code by Anthropic) to help write the code, the
data-processing scripts and first drafts of the documentation, and local open models (gpt-oss:20b, qwen3.5:9b via Ollama)
for first-pass code review. We tested and reviewed all AI-generated work: 20 unit tests, click-testing every feature,
checking every data link, and comparing our elevation data with Curiosity's own measurements. All code files and generated
data files carry an AI notice. Inside the product, "Ask Darb" uses a local open model (qwen3.5:9b) with no internet; it
answers only from the map's data, says "I don't know" otherwise, and scored 54/54 on our test set. No SI-generated images,
video or audio are used. `[If you use a text-to-speech voice in the demo video, add: "The demo voice-over is SI-generated text-to-speech" — and say so in the video description too.]`

## NASA Data
- **MSL Gale DEM Mosaic 1m v3** (HiRISE stereo; USGS Astrogeology, NASA/JPL/University of Arizona) — elevation, slope and
  roughness for routing. https://planetarymaps.usgs.gov/mosaic/Mars/MSL/MSL_Gale_DEM_Mosaic_1m_v3.tif
- **NASA Mars Trek** WMTS tiles — MRO CTX Gale Crater mosaic and Viking MDIM 2.1 (base map), MGS MOLA colour hillshade,
  Mars Odyssey THEMIS night-IR mosaic (thermal-inertia proxy). https://trek.nasa.gov/mars/
- **MGS MOLA MEGDR** 128 pixels/degree (PDS Geosciences Node) — elevation gap-filler.
  https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg128/
- **MRO CRISM** MTRDR browse products, observation FRT0000B6F1 (PDS Geosciences Node) — mineral layers.
  https://pds-geosciences.wustl.edu/mro/mro-m-crism-5-rdr-mptargeted-v1/mrocr_4001/browse/2008/2008_191/frt0000b6f1/
- **MSL Curiosity** waypoints (MMGIS) — rover traverse and 2025 stops.
  https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json
- **MSL raw images** (Navcam; Mastcam links) — waypoint photos. https://mars.nasa.gov/msl/multimedia/raw-images/
- **MSL REMS** weather feed — weather panel. https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json
- **MSL RAD** surface dose (Hassler et al. 2014, Science 343) — radiation. https://doi.org/10.1126/science.1244797
- NASA/JPL article on Curiosity and boxwork (Feb 2026) — science goal.
  https://www.nasa.gov/missions/mars-science-laboratory/curiosity-rover/nasas-curiosity-rover-sees-martian-spiderwebs-up-close/
- The 2026 challenge page (boxwork, HUD and pairs of astronauts as suggested ideas).
  https://www.spaceappschallenge.org/2026/challenges/interplanetary-survival-guide-martian-map/

## Space Agency Partner Data and Other References
**Space Agency Partner data:** **ESA Mars Express HRSC** — we cross-check our elevation grid against the
"Mars MGS MOLA – MEX HRSC Blended DEM Global 200m v2" (USGS Astrogeology; HRSC: ESA/DLR/FU Berlin; MOLA: NASA), which
blends ESA's HRSC stereo elevation with NASA's MOLA. Over our study area our elevation has an average bias of +3.7 m (median absolute difference
12.1 m over 4,416 pixels of 200 m); the app shows this in a "Data check" card and Ask Darb can explain it.
https://planetarymaps.usgs.gov/mosaic/Mars/HRSC_MOLA_Blend/Mars_HRSC_MOLA_BlendDEM_Global_200mp_v2.tif
(The REMS weather instrument was provided to Curiosity by Spain and its public feed is published by the Centro de
Astrobiología, CSIC-INTA; we use it through NASA's feed and do not count it as partner data. We also looked at the UAE's
Hope mission data, but its Science Data Center requires an account, so it is not used yet.)

**Other data, code, tools and references** (all free/open):
- Leaflet 1.9.4 (BSD-2-Clause) — map library. https://leafletjs.com
- Ollama (MIT) — runs local AI models. https://ollama.com
- qwen3.5:9b (Qwen, open weights) and gpt-oss:20b (OpenAI, open weights) via the Ollama library. https://ollama.com/library
- Python 3 standard library; Node.js test runner.
- Claude Code (Anthropic) — AI coding assistant used during development (see Use of SI).
- Viviano-Beck et al. (2014), CRISM browse product definitions (cited in the PDS labels).
- Rover image credits: NASA/JPL-Caltech (Navcam), NASA/JPL-Caltech/MSSS (Mastcam).
- Full list with every link: SOURCES.md in the repository.
- No copyrighted material is used without permission; no images, video or audio of people.
