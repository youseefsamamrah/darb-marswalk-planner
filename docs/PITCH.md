# Darb — 3-minute live pitch + judge Q&A

Speak slowly. One person drives the laptop (the "driver"), one or two people speak.
Before you start: open http://localhost:8000, make sure Ollama is running (green dot in "Ask Darb"),
and press **Clear** so the map is empty.

---

## Script (3:00)

**0:00 – 0:20 · Hook**
> "Imagine you are the first astronaut on Mars. You want to walk to an interesting rock formation.
> You have a question: is this path safe? You send it to Earth… and wait. A message takes between
> 4 and 24 minutes to get there — and the same to come back. On Mars, you have to be your own mission control."

**0:20 – 0:45 · Problem**
> "NASA has decades of Mars data — elevation, heat, minerals, weather, radiation — but it lives in different places,
> and tools like Mars Trek show whole regions, not the few kilometres an astronaut actually walks.
> So we built **Darb**. Darb means 'path' in Arabic."

**0:45 – 1:45 · Live demo** (driver clicks while the speaker talks)
1. *Driver: points at the map.* "This is lower Mount Sharp in Gale Crater, where Curiosity drives today.
   The white line is Curiosity's real path, and these numbered dots are its stops in 2025."
2. *Driver: ticks Thermal, then Minerals, then back to Slope.* "We layer real NASA data: slope from MOLA laser
   altimetry, THEMIS night-time infrared — bright means warm rock, dark means loose sand — and CRISM mineral maps."
3. *Driver: clicks **Demo**.* "We click a start and a goal. Our A-star algorithm finds the lowest-cost path —
   in about one millisecond. Green means safe: 2.2 kilometres, about 1 hour 11 minutes one way,
   and 72% oxygen left after coming back."
4. *Driver: clicks a point on the route.* "Click the route and you see a real Curiosity photo from near that spot,
   so the astronaut knows what to expect."
5. *Driver: clicks **Simulate walk**.* "This is HUD mode — what you'd see on your helmet visor: compass,
   distance to goal, oxygen timer, and warnings."

**1:45 – 2:05 · Science goal**
> "Our goal is the **boxwork**: criss-crossing ridges one to two metres tall that Curiosity studied in 2025.
> Groundwater once left minerals in cracks, and those hardened parts survived the wind. Collecting samples there
> tells us about water on ancient Mars."

**2:05 – 2:30 · Offline AI**
*Driver: clicks the chip "Is this route safe?"*
> "And this is **Ask Darb**. It runs on this laptop — no internet. It only answers from the map's data, and if it
> doesn't know, it says 'I don't know'. It can even look at a real rover photo." *(point at the response time shown)*

**2:30 – 2:45 · Honesty about data**
> "Every number comes from NASA data, listed with links in our sources file. We are also honest about limits:
> MOLA pixels are 463 metres, so small steep spots can be missed — that's why the next step is HiRISE elevation data."

**2:45 – 3:00 · Close**
> "Darb puts the safety data astronauts need into one map, in English and Arabic, with an AI that works
> when Earth is too far away to help. Thank you — we'd love your questions."

---

## Likely judge questions (2 minutes of Q&A)

**1. MOLA is 463 m per pixel. Isn't that too coarse for walking?**
Yes, it smooths slopes, and we say so in the app. We checked it: MOLA matched Curiosity's own recorded elevation
within about 40 m at its 2025 stops. The upgrade path is the HiRISE Gale DTM (1 m) — the grid format and the A*
code stay the same; only the build script changes.

**2. How did you choose the slope limits (10°, 15°, 20°)?**
They are our own design assumptions for a suited astronaut carrying equipment, not official NASA limits.
They are one line in `js/config.js`, so mission planners could change them.

**3. What if Ask Darb is wrong?**
The safety score is computed by our algorithm, not by the AI. The AI only explains. We give it only the app's facts,
use a low temperature and tell it to say "I don't know". We tested a question with no data (gravity) and it said
"I don't know". It can still make mistakes, so it is an assistant, not the decision-maker.

**4. Why run the AI locally instead of using a big cloud model?**
Light delay of 4–24 minutes each way, and blackouts during solar conjunction. A local model always answers,
in seconds, and keeps crew data on the device.

**5. How does THEMIS night infrared tell you about sand?**
At night, rock stays warm longer (high thermal inertia) and loose sand or dust cools quickly. So bright = rock,
dark = loose material. Our tile is contrast-stretched, so we use it as a *relative* value, not an exact number.

**6. Why A\*?**
It always finds the lowest-cost path when the "guess" (straight-line distance) never overestimates, and it is fast:
about 1 ms on our 15,720-cell grid.

**7. How do you know the data is real?**
Every layer is downloaded by `tools/build_data.py` from NASA servers, and each source is listed with links in
SOURCES.md. Nothing in the app is invented; the app says so on screen.

**8. How fresh is the data?**
Terrain and minerals are stable over years. Curiosity's positions go to sol 5070; REMS weather is the latest
in the public feed when we built it. Re-running the build script updates everything.

**9. What does buddy mode do?**
Two astronauts walking up to X metres apart both need safe ground. We block every cell that is closer than half
that distance to a blocked cell, so the route keeps a corridor wide enough for both.

**10. Where does the radiation number come from?**
Curiosity's RAD instrument: about 0.64 mSv per day on the surface of Gale Crater (Hassler et al., 2014, *Science*).
We multiply by the EVA's round-trip time.

**11. Would this work on Mars without internet?**
Yes, for our study area. The data layers, route planner, HUD and AI all run offline, and the NASA Mars Trek map tiles
for Mount Sharp (194 tiles, ~11 MB) are saved on the device. Only zooming far outside the area needs internet.

**12. What would you do with more time?**
HiRISE 1 m elevation, rock-hazard detection from HiRISE images, route timing by time of day
(temperature and light from REMS), and testing the AI's answers against a list of known-correct answers.
