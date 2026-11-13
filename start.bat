@echo off
REM Darb - start a simple local web server and open the app.
REM Needs Python (python.org). Ollama is optional (for "Ask Darb").
cd /d "%~dp0"
echo Starting Darb at http://localhost:8000  (close this window to stop)
start "" http://localhost:8000
REM tools\serve.py = Python's web server + "no-cache", so the browser never shows an old version after an update
python tools\serve.py 8000
