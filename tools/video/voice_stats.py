"""
voice_stats.py — objective numbers about narration clips (an AI assistant cannot listen, so it measures).

  python tools/video/voice_stats.py file1.wav file2.wav ...

Prints for each clip: length, peak level, clipped samples, loudness (RMS) and the median pitch (F0) of the voiced
parts, found with a simple autocorrelation at 8 kHz. Typical adult male speech is about 85–155 Hz, female 165–255 Hz.
Standard library only; needs ffmpeg on PATH.
"""
import array
import math
import subprocess
import sys


def load_8k(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", "8000", "-f", "s16le", "-"],
                         capture_output=True, check=True).stdout
    a = array.array("h"); a.frombytes(raw)
    return a


def pitch_track(x, rate=8000, fmin=60, fmax=320):
    frame, hop = 400, 160                       # 50 ms windows, 20 ms steps
    lo, hi = rate // fmax, rate // fmin
    out = []
    for s in range(0, len(x) - frame - hi, hop):
        w = x[s:s + frame + hi]
        energy = sum(v * v for v in w[:frame]) / frame
        if energy < 250 * 250:                  # quiet frame = pause or unvoiced
            continue
        best, best_lag = 0.0, 0
        e0 = sum(v * v for v in w[:frame])
        for lag in range(lo, hi + 1):
            c = 0; e1 = 0
            for i in range(0, frame, 2):        # every 2nd sample: 4x faster, accurate enough
                a = w[i]; b = w[i + lag]
                c += a * b; e1 += b * b
            r = c / math.sqrt((e0 / 2) * e1 + 1)
            if r > best:
                best, best_lag = r, lag
        if best > 0.55 and best_lag:
            out.append(rate / best_lag)
    return out


def main():
    for path in sys.argv[1:]:
        x = load_8k(path)
        n = len(x)
        peak = max(abs(v) for v in x) / 32768.0
        rms = math.sqrt(sum(v * v for v in x) / n) / 32768.0
        clipped = sum(1 for v in x if abs(v) >= 32760)
        f0 = sorted(pitch_track(x))
        med = f0[len(f0) // 2] if f0 else 0
        p10 = f0[len(f0) // 10] if f0 else 0
        p90 = f0[len(f0) * 9 // 10] if f0 else 0
        print("%-40s %6.2f s  peak %.2f (%.1f dBFS)  rms %.1f dBFS  clipped %d  F0 median %3.0f Hz (10–90%%: %3.0f–%3.0f Hz)"
              % (path.replace("\\", "/").split("/")[-1], n / 8000, peak, 20 * math.log10(peak + 1e-9),
                 20 * math.log10(rms + 1e-9), clipped, med, p10, p90))


if __name__ == "__main__":
    main()
