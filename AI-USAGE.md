# AI-USAGE.md — how AI was used in Darb

---

## 1. Team responsibilities ✍️

The roles below assign review, testing and presentation responsibilities. They do not claim that these tasks
have already been completed. The application and initial documentation were developed with substantial AI assistance.

| Area | Assigned responsibility |
|---|---|
| Challenge and concept review | All five members — Youseef, Lujain, Masa, Mahmoud, Milad: understand the challenge and review how the AI-assisted proposal addresses it. |
| Location and science goal | Milad: review Mount Sharp, Gale Crater and the boxwork science goal, and prepare their explanation. |
| Data sources | Milad: review the NASA/ESA sources and explain what each data layer measures and its limits. |
| Interface and Arabic | Lujain: review the interface, Arabic translations and right-to-left layout. |
| Mobile usability | Lujain: test the map, dropdowns, waypoint popups and Sources toggle on mobile. |
| Code and integration review | Youseef: review how the map, route planner and local AI assistant connect. |
| Route testing | Youseef: run the route tests and check demo routes, buddy mode and error cases. |
| Feedback and follow-up | All five members: report issues in their assigned areas and review AI-assisted revisions. |
| Presentation video | Mahmoud: coordinate the AI-assisted presentation video and review its explanation against the actual app. |
| Documentation and submission text | Masa: review the README, SOURCES and submission text for accuracy and clear wording, and check that they match the app. |
| Live demo and pitch | Mahmoud: prepare the demo sequence; each member explains their assigned area. |

---

## 2. What the AI TOOLS did

### Cloud AI (coding assistant)
| Tool | Model | Used for |
|---|---|---|
| Claude Code (desktop app) | Claude Opus 5.5 (Anthropic) | Acted as "lead developer": wrote the plan, found and tested the NASA data URLs, wrote the data-build script, the A* route module and its unit tests, the web app (HTML/CSS/JS), the Ask Darb client, and first drafts of the documents (README, SOURCES, TEAM-GUIDE, submission text, pitch and video scripts). |

### Presentation video (AI-assisted video · AI voice)
The demo video `docs/video/darb-demo.mp4` (27.9 s) is **genuine screen footage of the working app, assembled with
AI assistance and narrated by an AI text-to-speech voice**. The app footage itself is not AI-generated. The label
"AI-assisted video · AI voice (TTS)" is on screen for the whole video and the same disclosure is written in the
file's metadata and in `docs/video/DESCRIPTION.txt`. This use is in addition to the AI-assisted application
development described above. Full details: `docs/video/PRODUCTION.md`.

| Tool | Model / version | Used for |
|---|---|---|
| Claude Code (desktop app) | Claude Fable 5.2 (Anthropic) | Wrote the recording and editing scripts (`tools/video/`), chose framing and timing, drew the captions, titles and source labels, reviewed stills from the final file, wrote the video notes and description. |
| ElevenLabs text-to-speech (cloud service, elevenlabs.io) | stock voice "George - Warm, Captivating Storyteller", model Eleven Multilingual v2 | **AI narration voice.** Not a human recording; a ready-made stock voice, no voice was cloned by us. The 320 characters of narration text were sent to ElevenLabs once (through its web app, in a team member's account) and the audio file is kept in `docs/video/`. The narration text was given in the task; the AI only set timing and pauses. A first version of the video used a local voice (Piper, `en_US-john-medium`); the team rejected how it sounded. |
| Google Chrome 157 (headless) | — | Recording the real app page, driven by the app's own guided tour. Not AI. |
| FFmpeg 9.0.2 | — | Cutting, captions, encoding. Not AI. |
| Ollama 0.40 | `qwen3.5:9b` | The Ask Darb answer shown in the video, generated live inside the app while recording (question, answer and timing are logged in `docs/video/PRODUCTION.md`). |

What is **not** AI-made in the video: the map, layers, route, numbers, Curiosity photo and HUD (all recorded from
the running app). No music, no AI-generated images, no faces or voices of people.

How the video was checked: length measured with `ffprobe` (27.867 s, limit 30.0 s); one still per scene and every
cut inspected; the numbers on screen compared with the app's data in the same session; audio measured for timing,
loudness and clipping. The AI cannot listen: a team member listened to the final video on 13 Nov 2026 and approved
the narration voice (after rejecting the first, local voice).

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
- Human review assignments: Lujain — Arabic/interface/mobile; Milad — sources and science; Youseef —
  code integration and route tests; Masa — documentation and submission text; Mahmoud —
  video, pitch and demo. Completed human checks have not yet been recorded; the technical
  checks above describe project validation, not individual team-member contributions.

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
