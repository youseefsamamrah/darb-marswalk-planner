@echo off
REM Darb - start a simple local web server and open the app.
REM Needs Python (python.org). Ollama is optional (for "Ask Darb").
cd /d "%~dp0"
echo Starting Darb at http://localhost:8000  (close this window to stop)
start "" http://localhost:8000
python -m http.server 8000
