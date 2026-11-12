# Ask Darb — test set results

**Why:** an AI that sounds right is not the same as an AI that *is* right. We built a fixed test set so we can
**measure** how often Ask Darb gives the correct fact, and how often it admits "I don't know" instead of inventing.

**How to run it yourself** (Ollama running, app served with `start.bat`):
- http://localhost:8000/?eval — default model, 1 run
- http://localhost:8000/?eval=qwen3.5:9b&runs=3 — choose the model and repeat 3 times (answers vary a little each run)

Code: [`js/eval.js`](../js/eval.js). The expected answers are **not typed by hand**: they are read from the app's real
data at test time (route statistics, the HiRISE grid, CRISM, RAD), so if the data changes the test follows.

## The 18 questions (demo route: Curiosity's sol-4300 site → boxwork stop sol 4660)
| # | Kind | Question | Passes if the answer… |
|---|---|---|---|
| 1 | fact | Is this route safe? | uses the app's safety word (here "caution") |
| 2 | fact | How long is the route in km? | contains 2.73 ± 0.06 |
| 3 | fact | O₂ reserve after return? | contains 61 ± 1 % |
| 4 | fact | Maximum slope? | contains 10.5 ± 0.15° |
| 5 | fact | How many metres do we climb? | contains 135 ± 2 m |
| 6 | fact | Elevation at waypoint 5? | contains −3643.8 ± 1.5 m |
| 7 | fact | Strongest mineral signal at waypoint 3? | mentions hematite / ferric iron |
| 8 | fact | Radiation dose per day? | contains 0.64 mSv |
| 9 | fact | Loose sand on the route (%)? | contains 0 % |
| 10 | fact (Arabic) | ما طول المسار بالكيلومتر؟ | contains 2.73 ± 0.06 |
| 11 | trap | Is the 2.7 km one way or round trip? | says "one way" |
| 12 | trap | How far from the start is the steepest point? | contains 2682 ± 3 m |
| 13 | unknown | Official safe daily radiation limit? | says it doesn't know |
| 14 | unknown | Gravity at the goal? | says it doesn't know |
| 15 | unknown | Water ice at the goal? | says it doesn't know |
| 16 | unknown | Name of the astronaut? | says it doesn't know |
| 17 | unknown | Wind speed tomorrow? | says it doesn't know |
| 18 | unknown | Number of boulders > 1 m on the route? | says it doesn't know |

"Unknown" questions measure **hallucination**: the facts do not contain the answer, so the only correct reply is "I don't know".

## Results (2026-11-12, laptop: RTX 5060 Ti 16 GB, Ollama 0.40.13, temperature 0.2)
| Model | Runs | Score | Fact questions | Says "I don't know" correctly | Avg. time per answer |
|---|---|---|---|---|---|
| **qwen3.5:9b** (default, 6.6 GB, vision) | 3 | **54/54 (100 %)** | 36/36 | 18/18 | **1.9 s** |
| gpt-oss:20b (13 GB, text only) | 3 | 54/54 (100 %) | 36/36 | 18/18 | 2.8 s |

**Decision:** keep `qwen3.5:9b` as the Ask Darb default — same score, faster, and it can look at rover photos.

## What the test set found and fixed (honest history)
1. **First run (15 questions): 15/15, but reading the answers showed 3 invented details** the checker missed:
   "the steepest point is at waypoint 7" (location not in the facts), the Arabic answer said 2.73 km "includes going and
   returning" (it is one way), and the radiation answer added "within normal daily exposure limits" (no limit in the facts).
2. **Fixes:** the facts now say the distance is *one way* and give the steepest point's position; the system prompt forbids
   judgements that are not in the facts. We added 3 **trap questions** (#11–13) for exactly these mistakes.
3. **Checker bugs:** gpt-oss wrote "one‑way" with a special hyphen, "2 682" with a thin space and "don’t" with a curly
   apostrophe — the checker marked correct answers wrong. Fixed with a text normaliser.
4. **Real model error seen once:** in one run, gpt-oss:20b answered an English question in **Spanish**. It did not repeat
   in the 3 final runs, but it shows answers vary, which is why we report several runs.

## Limits of this test
- 18 questions on one route is a small test. A perfect score here does **not** mean Ask Darb is always right.
- Automatic checks look for the right number or word; an answer can contain the right number *and* an extra wrong
  sentence. We read the answers by hand as well (that is how the 3 invented details were found).
- Photo questions are not scored automatically (judging a description needs a person).
- **Ask Darb gives advice; the safety score on the route card is computed by normal code (`route.js`), not by AI.**
