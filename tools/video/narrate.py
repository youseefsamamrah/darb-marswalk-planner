"""
narrate.py — make the AI narration for the demo video (text-to-speech).

  python tools/video/narrate.py                 -> 7 scene clips in docs/video/work/voice/ + narration.json
  python tools/video/narrate.py --audition      -> one sample per candidate voice in docs/video/work/audition/

The engine and voice are set in tools/video/script.json ("voice"):
  "file"        a narration that was generated once as ONE audio file (the final video: ElevenLabs web app, stock
                voice "George") and is kept in the project. It is cut into its phrases at the pauses listed in
                "splitAt" (seconds, found with ffmpeg's silence detection and checked against the text).
  "elevenlabs"  ElevenLabs cloud text-to-speech with one of its stock ("premade") voices. The narration TEXT is sent
                to api.elevenlabs.io. Needs the environment variable ELEVENLABS_API_KEY (never written to a file).
                Every generated phrase is kept in docs/video/work/tts-cache/, so a re-run costs no credits.
  "piper"       Piper (https://github.com/rhasspy/piper, MIT) with a stock voice model, fully on this computer.
  "sapi"        a Windows built-in voice.
No real person is cloned or imitated: only stock voices are used.

The speech is NEVER sped up or pitch-shifted afterwards. Each phrase is generated on its own, silence at its two
ends is trimmed, and the phrases of a scene are joined with the exact pauses written in script.json.
Standard library only. Needs ffmpeg on PATH.
"""
import array
import glob
import hashlib
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
import wave

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
WORK = os.path.join(ROOT, "docs", "video", "work")
RATE = 22050          # samples per second of the working files (Piper: 22050, ElevenLabs: 44100; set in main)
PAD = 0.03            # seconds of quiet kept before/after each phrase


def piper_dir():
    """Folder that holds piper/piper.exe and the *.onnx voice files (downloaded once, not in git)."""
    local = os.environ.get("LOCALAPPDATA", "")
    candidates = [os.environ.get("DARB_PIPER_DIR"), os.path.join(local, "DarbVideoTools")]
    candidates += glob.glob(os.path.join(local, "Packages", "OpenAI.Codex_*", "LocalCache", "Local", "DarbVideoTools"))
    for c in candidates:
        if c and os.path.exists(os.path.join(c, "piper", "piper.exe")):
            return c
    raise SystemExit("Piper not found. Set DARB_PIPER_DIR to the folder with piper/piper.exe and the .onnx voices.")


def voice_dirs():
    """Folders searched for <voice>.onnx files (each with its .onnx.json next to it)."""
    local = os.environ.get("LOCALAPPDATA", "")
    return [d for d in [os.environ.get("DARB_VOICE_DIR"), os.path.join(local, "DarbVideoTools", "voices"), piper_dir()] if d and os.path.isdir(d)]


def voice_file(model):
    for d in voice_dirs():
        f = os.path.join(d, model + ".onnx")
        if os.path.exists(f):
            return f
    raise SystemExit("Voice model %s.onnx not found in: %s" % (model, ", ".join(voice_dirs())))


def synth_piper(text, out, voice):
    d = piper_dir()
    cmd = [os.path.join(d, "piper", "piper.exe"), "--model", voice_file(voice["model"]),
           "--output_file", out, "--length_scale", str(voice.get("length_scale", 1.0)),
           "--noise_scale", str(voice.get("noise_scale", 0.667)), "--noise_w", str(voice.get("noise_w", 0.8)),
           "--sentence_silence", "0.25", "--quiet"]
    p = subprocess.run(cmd, input=text + "\n", text=True, encoding="utf-8", capture_output=True)
    if p.returncode or not os.path.exists(out):
        raise RuntimeError("piper failed: " + p.stderr)


def synth_sapi(text, out, voice):
    """Windows built-in voice through System.Speech (fallback engine)."""
    ps = ("Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
          "$s.SelectVoice('%s'); $s.Rate = %d; "
          "$f = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(22050, 'Sixteen', 'Mono'); "
          "$s.SetOutputToWaveFile('%s', $f); $s.Speak('%s'); $s.Dispose()"
          % (voice["model"], int(voice.get("rate", 0)), out.replace("'", "''"), text.replace("'", "''")))
    p = subprocess.run(["powershell", "-NoProfile", "-Command", ps], capture_output=True, text=True)
    if p.returncode or not os.path.exists(out):
        raise RuntimeError("System.Speech failed: " + p.stderr)


def synth_elevenlabs(text, out, voice, before="", after=""):
    """ElevenLabs text-to-speech (cloud). `before`/`after` = the neighbouring phrases, sent only as context so the
    intonation flows across phrases; they are not spoken. The MP3 answer is cached, then converted to WAV."""
    body = {"text": text, "model_id": voice.get("model", "eleven_multilingual_v2"),
            "voice_settings": {"stability": voice.get("stability", 0.5), "similarity_boost": voice.get("similarity_boost", 0.75),
                               "style": voice.get("style", 0.0), "use_speaker_boost": True, "speed": voice.get("speed", 1.0)}}
    if before:
        body["previous_text"] = before
    if after:
        body["next_text"] = after
    if voice.get("seed") is not None:
        body["seed"] = voice["seed"]
    fmt = voice.get("output_format", "mp3_44100_128")
    key = hashlib.sha256(json.dumps([voice["voice_id"], fmt, body], sort_keys=True).encode("utf-8")).hexdigest()[:24]
    cache = os.path.join(WORK, "tts-cache"); os.makedirs(cache, exist_ok=True)
    mp3 = os.path.join(cache, key + ".mp3")
    if not os.path.exists(mp3):
        api_key = os.environ.get("ELEVENLABS_API_KEY")
        if not api_key:
            raise SystemExit("Set the environment variable ELEVENLABS_API_KEY first (it is never stored by this script).")
        req = urllib.request.Request("https://api.elevenlabs.io/v1/text-to-speech/%s?output_format=%s" % (voice["voice_id"], fmt),
                                     data=json.dumps(body).encode("utf-8"),
                                     headers={"xi-api-key": api_key, "Content-Type": "application/json", "Accept": "audio/mpeg"})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                audio = r.read()
        except urllib.error.HTTPError as e:
            raise RuntimeError("ElevenLabs error %s: %s" % (e.code, e.read().decode("utf-8", "replace")[:400]))
        with open(mp3, "wb") as f:
            f.write(audio)
        with open(os.path.join(cache, "requests.log"), "a", encoding="utf-8") as f:      # what was sent (never the key)
            f.write(json.dumps({"file": key + ".mp3", "voice_id": voice["voice_id"], "characters": len(text), "request": body}, ensure_ascii=False) + "\n")
    p = subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", mp3, "-ac", "1", "-ar", str(RATE), "-c:a", "pcm_s16le", out], capture_output=True, text=True)
    if p.returncode or not os.path.exists(out):
        raise RuntimeError("ffmpeg could not decode the speech: " + p.stderr)


_takes = {}


def synth_file(index, out, voice):
    """Phrase number `index` of a narration that exists as one audio file: cut it out between two split points."""
    src = os.path.join(ROOT, voice["source"])
    if src not in _takes:
        whole = os.path.join(WORK, "voice", "whole-take.wav"); os.makedirs(os.path.dirname(whole), exist_ok=True)
        p = subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-ac", "1", "-ar", str(RATE), "-c:a", "pcm_s16le", whole], capture_output=True, text=True)
        if p.returncode:
            raise RuntimeError("ffmpeg could not read " + src + ": " + p.stderr)
        _takes[src] = read_wav(whole)
    data = _takes[src]
    cuts = [0.0] + list(voice["splitAt"]) + [len(data) / RATE]
    if index < 0 or index + 1 >= len(cuts):
        raise RuntimeError("the narration file has %d phrases, phrase %d was asked for" % (len(cuts) - 1, index + 1))
    write_wav(out, data[int(cuts[index] * RATE): int(cuts[index + 1] * RATE)])


def synth(text, out, voice, before="", after=""):
    if voice.get("engine") == "elevenlabs":
        synth_elevenlabs(text, out, voice, before, after)
    else:
        (synth_sapi if voice.get("engine") == "sapi" else synth_piper)(text, out, voice)


def read_wav(path):
    with wave.open(path) as w:
        if w.getnchannels() != 1 or w.getsampwidth() != 2:
            raise RuntimeError("expected 16-bit mono: " + path)
        rate = w.getframerate()
        data = array.array("h"); data.frombytes(w.readframes(w.getnframes()))
    if rate != RATE:
        raise RuntimeError("expected %d Hz, got %d: %s" % (RATE, rate, path))
    return data


def write_wav(path, data):
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE); w.writeframes(data.tobytes())


def trim(data, threshold=260):
    """Cut the silence before the first and after the last audible sample (keeps PAD seconds, never cuts speech)."""
    first = next((i for i, v in enumerate(data) if abs(v) > threshold), 0)
    last = next((i for i in range(len(data) - 1, -1, -1) if abs(data[i]) > threshold), len(data) - 1)
    pad = int(PAD * RATE)
    return data[max(0, first - pad): min(len(data), last + pad + 1)]


def silence(seconds):
    return array.array("h", [0] * int(round(seconds * RATE)))


def fade_edges(data, ms=8):
    """A few milliseconds of fade at both ends, so a join can never click."""
    n = min(int(RATE * ms / 1000), len(data) // 2)
    for i in range(n):
        data[i] = int(data[i] * i / n)
        data[-1 - i] = int(data[-1 - i] * i / n)
    return data


def level(data, target=2600.0, ceiling=29000):
    """Same loudness for every phrase: scale so the RMS of the spoken part equals `target` (a plain volume change).
    The engine makes every phrase full-scale on its own, so short phrases would otherwise sound louder."""
    loud = [v for v in data if abs(v) > 500]
    if not loud:
        return data
    rms = (sum(v * v for v in loud) / len(loud)) ** 0.5
    gain = min(target / rms, ceiling / max(abs(v) for v in data))      # never above the ceiling: no clipping
    return array.array("h", [int(round(v * gain)) for v in data])


def build_scene(scene, voice, outdir, flow=None):
    """Returns (samples, phrase timings) for one scene. `flow` = every phrase of the whole script in order,
    used to give the engine the sentence before and after as context."""
    out = array.array("h"); marks = []
    for k, ph in enumerate(scene["phrases"]):
        raw = os.path.join(outdir, "raw-%d-%d.wav" % (scene["id"], k + 1))
        said = ph.get("say", ph["text"])
        i = flow.index(said) if flow and said in flow else -1
        if voice.get("engine") == "file":
            synth_file(i, raw, voice)
            part = fade_edges(trim(read_wav(raw)))        # one continuous take: its own dynamics are kept
        else:
            synth(said, raw, voice, flow[i - 1] if i > 0 else "", flow[i + 1] if 0 <= i < len(flow) - 1 else "")
            part = fade_edges(level(trim(read_wav(raw))))
        start = len(out) / RATE
        out.extend(part)
        marks.append({"text": ph["text"], "caption": ph.get("caption", ph["text"]),
                      "start": round(start, 3), "end": round(len(out) / RATE, 3)})
        if ph.get("pauseAfter"):
            out.extend(silence(ph["pauseAfter"]))
        os.remove(raw)
    return out, marks


def main():
    script = json.load(open(os.path.join(HERE, "script.json"), encoding="utf-8"))
    voice = script["voice"]
    global RATE
    RATE = 44100 if voice.get("engine") in ("elevenlabs", "file") else 22050
    flow = [p.get("say", p["text"]) for sc in script["scenes"] for p in sc["phrases"]]
    if "--audition" in sys.argv:
        return audition(script, flow)
    outdir = os.path.join(WORK, "voice"); os.makedirs(outdir, exist_ok=True)
    result = {"voice": {k: v for k, v in voice.items() if not k.startswith("_") and k != "candidates"}, "sampleRate": RATE, "scenes": []}
    words = 0; total = 0.0
    for scene in script["scenes"]:
        samples, marks = build_scene(scene, voice, outdir, flow)
        path = os.path.join(outdir, "scene-%d.wav" % scene["id"])
        write_wav(path, samples)
        dur = len(samples) / RATE
        n = sum(len(p["text"].replace(":", " ").split()) for p in scene["phrases"])
        words += n; total += dur
        peak = max(abs(v) for v in samples) / 32768.0
        result["scenes"].append({"id": scene["id"], "name": scene["name"], "file": "voice/scene-%d.wav" % scene["id"],
                                 "duration": round(dur, 3), "words": n, "peak": round(peak, 3), "phrases": marks})
        print("scene %d  %.2f s  %d words  peak %.2f  %s" % (scene["id"], dur, n, peak, " | ".join(m["text"] for m in marks)))
    result["totalSpeech"] = round(total, 3); result["words"] = words
    json.dump(result, open(os.path.join(WORK, "narration.json"), "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    print("total narration %.2f s, %d words (%.2f words/s including pauses inside scenes)" % (total, words, words / total))


def audition(script, flow):
    """The whole narration once per candidate voice, as one file each, so a person can listen and choose."""
    outdir = os.path.join(WORK, "audition"); os.makedirs(outdir, exist_ok=True)
    base = script["voice"]
    if base.get("engine") == "elevenlabs":
        voices = [dict({k: v for k, v in base.items() if k != "candidates"}, **c) for c in base.get("candidates", [])]
    else:
        found = sorted(set(os.path.basename(f)[:-5] for d in voice_dirs() for f in glob.glob(os.path.join(d, "*.onnx"))))
        voices = [{"engine": "piper", "model": m, "length_scale": base.get("length_scale", 1.0),
                   "noise_scale": base.get("noise_scale", 0.6), "noise_w": 0.8} for m in found]
        voices += [{"engine": "sapi", "model": "Microsoft David Desktop", "rate": -1}]
    for v in voices:
        out = array.array("h"); speech = 0.0
        try:
            for sc in script["scenes"]:
                samples, _ = build_scene(sc, v, outdir, flow)
                speech += len(samples) / RATE
                out.extend(samples); out.extend(silence(0.6))
        except Exception as e:           # a voice that is not available is simply skipped
            print("skip", v.get("voice_name", v.get("model")), "-", str(e).strip()[:300]); continue
        name = (v.get("voice_name") or v["model"]).replace(" ", "-")
        name = ("elevenlabs-" + name if v.get("engine") == "elevenlabs" else name) + ".wav"
        write_wav(os.path.join(outdir, name), out)
        print("audition %-28s narration %.2f s (file %.2f s)" % (name, speech, len(out) / RATE))


if __name__ == "__main__":
    main()
