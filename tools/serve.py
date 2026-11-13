"""
serve.py  -  the local web server for Darb (used by start.bat).

AI notice: written with help from an AI coding assistant (Claude Code, Anthropic) and reviewed/tested by the team. See AI-USAGE.md.

It is Python's normal `http.server`, plus one header: "Cache-Control: no-cache".
That tells the browser: "you may keep a copy, but ask me first if it changed". Without it, a browser can
show an OLD index.html after we update the app (we saw this happen during testing).
Run from the project folder:   python tools/serve.py        (then open http://localhost:8000)
"""
import functools
import http.server
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


if __name__ == "__main__":
    handler = functools.partial(NoCacheHandler, directory=ROOT)
    with http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler) as server:
        print("Darb is running at http://localhost:%d  (press Ctrl+C or close this window to stop)" % PORT)
        server.serve_forever()
