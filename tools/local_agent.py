"""

local_agent.py  -  hand simple, repetitive tasks to a LOCAL model (Ollama) to save cloud usage.

Used by the Lead agent for first drafts only (first-pass code review, test-case ideas,
summaries). A human / the Lead always checks the output before anything is used.

Usage (Ollama must be running):
  python tools/local_agent.py review   js/route.js            -> first-pass code review
  python tools/local_agent.py tests    js/route.js            -> ideas for extra edge-case tests
  python tools/local_agent.py summary  data/environment.json  -> plain-English data summary
Output is printed AND saved to docs/local-agent/<task>-<file>.md with the model name and timing.
"""
import json
import os
import sys
import time
import urllib.request

OLLAMA = "http://localhost:11434/api/chat"
# Which local model does which job (chosen in AI-USAGE.md):
MODELS = {
    "review": "gpt-oss:20b",   # strongest reasoning that still fits fully in 16 GB VRAM
    "tests": "gpt-oss:20b",
    "summary": "qwen3.5:9b",   # fast small model for plain-language summaries
}
PROMPTS = {
    "review": "You are a careful senior reviewer. Review this file for real bugs, edge cases, and places where a "
              "high-school beginner would not understand the code. List at most 8 findings, most important first. "
              "For each: line or function, problem, suggested fix. Do not rewrite the whole file.",
    "tests": "Suggest at most 8 extra unit tests (edge cases) for this module. For each give: name, input, expected result. "
             "Use Node's built-in test runner style.",
    "summary": "Summarise this data file in plain English for a high-school student in under 150 words. "
               "Only state facts that are in the file.",
}


def main():
    if len(sys.argv) != 3 or sys.argv[1] not in MODELS:
        print(__doc__)
        sys.exit(1)
    task, path = sys.argv[1], sys.argv[2]
    with open(path, encoding="utf-8") as f:
        content = f.read()[:24000]          # keep the prompt a sensible size
    body = {
        "model": MODELS[task], "stream": False,
        "options": {"temperature": 0.2, "num_ctx": 16384},
        "messages": [{"role": "system", "content": PROMPTS[task]},
                     {"role": "user", "content": "FILE: %s\n\n%s" % (path, content)}],
    }
    t0 = time.time()
    req = urllib.request.Request(OLLAMA, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=900) as r:
        answer = json.loads(r.read())["message"]["content"]
    secs = time.time() - t0
    out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "docs", "local-agent")
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, "%s-%s.md" % (task, os.path.basename(path)))
    with open(out, "w", encoding="utf-8") as f:
        f.write("# Local agent: %s of `%s`\n\nModel: `%s` · %.1f s · **DRAFT — checked by the Lead before use**\n\n%s\n"
                % (task, path, MODELS[task], secs, answer))
    print(answer)
    print("\n[saved to %s, %.1f s]" % (out, secs))


if __name__ == "__main__":
    main()
