# Darb — demo video and slides plan

> ✅ **Checked against the official 2026 Project Submission Guide** (12 Nov 2026):
> - Choose **ONE**: a video of **30 seconds or less**, or a slide deck of **up to 7 slides** (title and intro slides count).
>   **Going over either limit makes the project ineligible for Global Judging.**
> - Host it outside the Space Apps site (YouTube, Google Drive, GitHub…) with a **public link** — no login or permission.
>   Test the link in a private/incognito window.
> - **English.** A video may be spoken in another language only with **English subtitles**; slides must be in English.
> - The demo counts towards the **Presentation** score; most of the judging is based on the project page.

## Privacy rules (Space Apps Terms + FAQ)
Projects may not include **images, video, audio or any likeness of persons under 18**. So: **screen recording only** —
no faces, no webcam, no recorded voices of team members under 18. For sound, use **text captions**, an **adult** voice
(mentor or parent), or a **text-to-speech voice**.

**Team member names:** the guide asks slide decks to show the team name, the **names of team members** and the challenge.
Our project rules so far said "no names of real people". Names are not in the under-18 list (images, video, audio,
likeness), so **the team decides**: put names on slide 1, or only the team name. Placeholder below: `[TEAM NAME]`, `[MEMBER NAMES — team decides]`.

---

## Option A — video, 30 seconds or less ✅ **DONE (13 Nov 2026)**

**Final video: 27.74 s, 1080p, H.264 + AAC.**
Direct link (works in any browser, no login):
<https://github.com/youseefsamamrah/darb-marswalk-planner/raw/main/docs/video/darb-demo.mp4>

How it was made (all in this repo, no third-party service): the app's **▶ Tour** ran for real on
http://localhost:8000, its screen was captured with the browser's native screencast
(`tools/record_demo.cjs`), the 7 lines of the voice-over were generated on this machine by the
Piper TTS model (`tools/video/generate-voice.py` — a synthetic voice, so the under-18 audio
rule was never an issue), captions were burned into the app's own caption bar, and the scenes
were assembled with `ffmpeg` (`docs/video/work/assemble.cjs`). Scene lengths are exactly the
recorded voice lengths (`docs/video/work/timing.json`), total 27.74 s. The voice was checked
line by line against the app's screens; nothing visible was altered to make the AI answer.

| Time | Screen (tour step) | Caption / voice-over |
|---|---|---|
| 0–4 s | Title card | "Team Darb, from Ramallah. Challenge: the Martian Map." |
| 4–7.7 s | Step 1: map of Mount Sharp | "On Mars, a message to Earth takes up to twenty-four minutes." |
| 7.7–13.4 s | Steps 2–4: slope → rough ground → minerals | "Darb layers real NASA data: HiRISE terrain, THEMIS heat and CRISM minerals." |
| 13.4–17.6 s | Step 5: route + card | "Pick a goal. Darb finds the safest path and tracks your oxygen." |
| 17.6–20.9 s | Step 6: rover photo popup | "See real Curiosity photos before you arrive." |
| 20.9–22.5 s | Step 8: HUD walk | "Walk with a helmet display." |
| 22.5–27.7 s | Step 9: Ask Darb answers | "And ask Darb anything — AI that needs no Earth. Darb: the path." |



---

## Option B — up to 7 slides (English)
1. **Title** — "Darb (دَرْب) — Marswalk Planner" · Team `[TEAM NAME]` · `[MEMBER NAMES — team decides]` ·
   Challenge: Interplanetary Survival Guide: Martian Map · map screenshot.
2. **Problem** — 4–24 min light delay; Mars data is scattered; existing tools are regional, not walking-scale.
3. **Place and goal** — Mount Sharp, Gale Crater; boxwork ridges Curiosity studied in 2025; collect samples.
4. **Data layers** — screenshot (slope / rough ground / CRISM); small table of NASA sources; "elevation within 4.2 m of
   Curiosity's own measurements".
5. **Safe route (user experience)** — screenshot of route + card: 2.73 km, 1 h 38 min, 61 % O₂, max slope 10.5°,
   🟡 Caution; buddy mode at 100 m → 5.29 km detour, 🔴 Danger.
6. **HUD + Ask Darb** — HUD screenshot; Ask Darb answer with response time; "runs offline, 54/54 on our test set".
7. **Limits and future** — single boulders smaller than a 25 m cell; slope limits are our assumptions; next: rock
   detection in HiRISE images, more locations, a tablet version for crews.

Screenshots come from the running app (no people). Put "Imagery: NASA Mars Trek / HiRISE (NASA/JPL/UArizona)" on map slides.
Do not use NASA logos or mission insignia (SI rule: generated content may not use NASA branding — and we don't need it).
