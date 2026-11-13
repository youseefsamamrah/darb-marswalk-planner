# AI-USAGE.md — how AI was used in Darb

The Space Apps 2026 rules require every team to describe how AI tools were used.
(The 2026 Participant FAQ calls these tools "Super Intelligence (SI)"; it means the same thing.)
We try to be honest: not hiding AI help, and not exaggerating it.

**What the official 2026 Project Submission Guide asks (checked 12 Nov 2026)** and what we did:
| Rule | What we did |
|---|---|
| SI must not be used to come up with the idea | ______________________________ (team to complete; see section 1). |
| Code and data: acknowledge SI in descriptive text **and metadata** | Every code file starts with an "AI notice" line; every generated data file in `data/` has an `aiNotice` field; this file + README. |
| Images and video: visible watermark if SI-generated | We use no SI-generated images or video. Screenshots are of our app; rover photos are real NASA images. |
| Audio: acknowledge SI generation | Only if the team uses a text-to-speech voice-over in the demo video — then say so in the video description, file metadata and the "Use of SI" field. |
| No NASA branding in generated content | No NASA logos or insignia are used anywhere. |
| The "Use of SI" answer is not shown to judges | So the markers above (inside the project) are what judges see. |

---

## 1. What the TEAM did  ✍️ (filled in by the team — please write this yourselves)

> Write in your own words. Examples of things you might list: who chose the challenge and the idea,
> who picked Mount Sharp and the boxwork science goal, who checked the datasets, which design
> decisions you made, how you tested the app, what feedback you gave each round, who prepared and
> will give the pitch.

- Choosing the challenge and the idea: ______________________________________
- Choosing the location and science goal: ______________________________________
- Choosing and checking the datasets: ______________________________________
- Design decisions (look, features, safety rules): ______________________________________
- Testing the app (what we clicked, what broke): ______________________________________
- Feedback we gave the AI each round: ______________________________________
- Preparing and giving the pitch / video: ______________________________________
- Anything else: ______________________________________

---

## 2. What the AI TOOLS did

### Cloud AI (coding assistant)
| Tool | Model | Used for |
|---|---|---|
| Claude Code (desktop app) | Claude Opus 5.5 (Anthropic) | Acted as "lead developer": wrote the plan, found and tested the NASA data URLs, wrote the data-build script, the A* route module and its unit tests, the web app (HTML/CSS/JS), the Ask Darb client, and first drafts of the documents (README, SOURCES, TEAM-GUIDE, submission text, pitch and video scripts). |

### Local AI (on our own laptop, no cloud)
| Tool | Model | Size | Used for |
|---|---|---|---|
| Ollama 0.40 | `qwen3.5:9b` (Q4_K_M) | 6.6 GB | The **Ask Darb** assistant inside the app (chat + photo questions) and plain-language data summaries |
| Ollama 0.40 | `gpt-oss:20b` (MXFP4) | 13 GB | First-pass **code review** of `js/route.js` (saved in `docs/local-agent/`) |

Why these models (laptop: Intel i7-14700F, 32 GB RAM, NVIDIA RTX 5060 Ti 16 GB VRAM, 650 GB free disk):
- `qwen3.5:9b` fits completely in the 16 GB of video memory, so it is fast (first words in ~0.4–5 s,
  full answers in ~1.5–6 s; 1.9 s on average over our 54-answer test set) and it can **see images** (vision), which we need for rover photos.
- `gpt-oss:20b` (13 GB) is the strongest reasoning model that still fits fully in 16 GB VRAM — good for review.
- `qwen3.6:27b` / `qwen3.8` (17 GB) were already installed but are slightly bigger than the GPU memory,
  so they run slower; we did not use them by default.
- All models were already installed on this laptop, so **nothing new was downloaded**.

### How the output was checked
- Every data URL was tested by actually downloading from it (HTTP 200) before use.
- The elevation data was cross-checked against Curiosity's own recorded elevations: the HiRISE-based grid differs
  by at most 4.2 m at 8 stops (the earlier MOLA grid: up to 44 m).
- The HiRISE GeoTIFF reader (`tools/hirise_dem.py`, AI-written TIFF + LZW decoder) was checked by reading the rover's
  stop locations and comparing with the rover's recorded elevations (within 0.5 m for the tested points).
- The route code has **20 automated unit tests** (`node --test tests`), including the edge cases
  start = goal, goal on a blocked cell, no possible route, click outside the map.
- The app was click-tested in a browser: every layer, the route, buddy mode, Arabic, HUD, Ask Darb online and offline.
- The local model's code review was read by the lead (Claude) before anything was changed:
  1 suggestion was used (skip zero-length steps in `routeStats`), 7 were judged not needed because our
  grid data never contains missing values (reasons in CHANGELOG.md).
- The team checked: ______________________________ (fill in)

---

## 3. AI INSIDE the product: "Ask Darb"

**What it does:** answers questions like "Is this route safe?", "What minerals are near waypoint 3?"
or "Explain the rock photo at waypoint 6", in English or Arabic.

**Why local:** a radio message from Mars to Earth takes 4–24 minutes each way, so an astronaut cannot
wait for a cloud AI on Earth. Ask Darb runs on the astronaut's own device with Ollama
(`http://localhost:11434`) and needs no internet.

**How it is grounded (to stop it from making things up):**
1. Before every question, the app writes a short list of **facts in plain English**: the current route
   (distance, time, O₂ reserve, slopes, sand, safety score and reasons), start/middle/goal and every
   Curiosity waypoint with elevation and slope (HiRISE DEM), ground type (THEMIS) and mineral signals (CRISM),
   plus weather (REMS) and radiation (RAD).
2. The model is told to use **only** those facts, to name the data layer for each fact, and to answer
   **"I don't know"** when the facts do not cover the question. Test: "What is the gravity at the goal?"
   → "I don't know … no data layer contains gravity measurements."
3. Low temperature (0.2) and a large context window (8192 tokens) so the facts are never cut off.
   (Our first version sent too much raw JSON; the model lost the start of the prompt and wrongly said
   the place was Venus. Converting the facts to short plain English fixed this — see CHANGELOG.md.)
4. Photo questions attach the real Navcam image; the model must describe what it sees, then link it to the facts.
5. Every answer shows the model name and the **response time** (and time to first words).
6. **Measured, not guessed:** a fixed 18-question test set (`js/eval.js`, results in `docs/ASK-DARB-EVAL.md`) checks
   12 fact questions against the app's real data and 6 questions whose answer is *not* in the data (it must say
   "I don't know"). qwen3.5:9b scored 54/54 over 3 runs (1.9 s per answer); gpt-oss:20b also 54/54 (2.8 s).
   Reading the answers by hand found 3 invented details in the first version, which we fixed (see that file).

**Limits (please read):**
- A 9-billion-parameter model can still make mistakes or mix up numbers. **Ask Darb is advice, not a
  safety system**: the route card and its safety score are calculated by normal code (`route.js`), not by AI.
- CRISM signals are turned into words (strong / moderate / weak / none) from contrast-stretched browse
  images, so they are **relative**, not a confirmed mineral identification.
- If Ollama is not running, the app shows "Ask Darb is offline" and everything else keeps working.
