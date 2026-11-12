"""
hrsc_check.py  -  cross-check our elevation grid with an INDEPENDENT elevation model that uses
ESA Mars Express HRSC data (a 2026 Space Apps Space Agency Partner).

AI notice: written with help from an AI coding assistant (Claude Code, Anthropic) and reviewed/tested by the team. See AI-USAGE.md.

Source: "Mars MGS MOLA - MEX HRSC Blended DEM Global 200m v2" (USGS Astrogeology; HRSC: ESA/DLR/FU Berlin; MOLA: NASA)
  https://planetarymaps.usgs.gov/mosaic/Mars/HRSC_MOLA_Blend/Mars_HRSC_MOLA_BlendDEM_Global_200mp_v2.tif
The file is 11.4 GB, but it is UNCOMPRESSED with one image row per strip, so we read only the few kilobytes
covering our box with HTTP range requests (no big download).
Layout (read from the file's own BigTIFF tags): 106694 x 53347 pixels, signed 16-bit metres, simple
latitude/longitude grid, 0.003374° per pixel (~200 m), top-left corner at 180°W, 90°N, NoData -32768.

Run:  python tools/hrsc_check.py      ->  writes data/hrsc_check.json
"""
import json
import math
import os
import struct
import urllib.request

URL = "https://planetarymaps.usgs.gov/mosaic/Mars/HRSC_MOLA_Blend/Mars_HRSC_MOLA_BlendDEM_Global_200mp_v2.tif"
HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")
UA = {"User-Agent": "darb-marswalk-student-project"}


def rng(start, length):
    req = urllib.request.Request(URL, headers=dict(UA, Range="bytes=%d-%d" % (start, start + length - 1)))
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def read_tags():
    """Parse the BigTIFF header (8-byte offsets) and return what we need."""
    head = rng(0, 16)
    assert head[:4] == b"II+\x00", "expected a little-endian BigTIFF"
    ifd = struct.unpack("<Q", head[8:16])[0]
    n = struct.unpack("<Q", rng(ifd, 8))[0]
    raw = rng(ifd + 8, n * 20)
    tags = {}
    for i in range(n):
        tag, typ, cnt = struct.unpack("<HHQ", raw[i * 20:i * 20 + 12])
        tags[tag] = (typ, cnt, raw[i * 20 + 12:i * 20 + 20])

    def small(tag):
        typ, _, val = tags[tag]
        return struct.unpack({3: "<H", 4: "<I", 16: "<Q"}[typ], val[:{3: 2, 4: 4, 16: 8}[typ]])[0]

    def doubles(tag):
        typ, cnt, val = tags[tag]
        return struct.unpack("<%dd" % cnt, rng(struct.unpack("<Q", val)[0], 8 * cnt))

    assert small(259) == 1 and small(258) == 16 and small(339) == 2 and small(278) == 1, "unexpected layout"
    scale, tie = doubles(33550), doubles(33922)
    return {"width": small(256), "height": small(257), "px": scale[0], "lon0": tie[3], "lat0": tie[4],
            "offsets_at": struct.unpack("<Q", tags[273][2])[0]}


def main():
    grid = json.load(open(os.path.join(DATA, "grid.json"), encoding="utf-8"))
    wps = json.load(open(os.path.join(DATA, "waypoints.json"), encoding="utf-8"))["waypoints"]
    t = read_tags()
    b = grid["bounds"]
    r0 = int((t["lat0"] - b["north"]) / t["px"])
    r1 = int((t["lat0"] - b["south"]) / t["px"])
    c0 = int((b["west"] - t["lon0"]) / t["px"])
    c1 = int((b["east"] - t["lon0"]) / t["px"])
    # where each needed row starts in the file (8 bytes per row in the strip-offsets table)
    offs = struct.unpack("<%dQ" % (r1 - r0 + 1), rng(t["offsets_at"] + 8 * r0, 8 * (r1 - r0 + 1)))
    hrsc = {}
    for i, r in enumerate(range(r0, r1 + 1)):
        vals = struct.unpack("<%dh" % (c1 - c0 + 1), rng(offs[i] + 2 * c0, 2 * (c1 - c0 + 1)))
        for j, v in enumerate(vals):
            if v != -32768:
                hrsc[(r, c0 + j)] = v

    def grid_mean(lat_n, lat_s, lon_w, lon_e):
        """Average of our 25 m grid cells whose centres fall inside a box (one 200 m HRSC pixel)."""
        cd, C = grid["cellDeg"], grid["cols"]
        vals = []
        for r in range(max(0, int((b["north"] - lat_n) / cd)), min(grid["rows"], int((b["north"] - lat_s) / cd) + 1)):
            for c in range(max(0, int((lon_w - b["west"]) / cd)), min(C, int((lon_e - b["west"]) / cd) + 1)):
                lat = b["north"] - (r + 0.5) * cd
                lon = b["west"] + (c + 0.5) * cd
                if lat_s <= lat < lat_n and lon_w <= lon < lon_e:
                    vals.append(grid["elevation"][r * C + c])
        return sum(vals) / len(vals) if len(vals) >= 30 else None

    diffs = []
    for (r, c), v in hrsc.items():
        lat_n = t["lat0"] - r * t["px"]
        lon_w = t["lon0"] + c * t["px"]
        g = grid_mean(lat_n, lat_n - t["px"], lon_w, lon_w + t["px"])
        if g is not None:
            diffs.append(g - v)
    diffs.sort()
    n = len(diffs)
    mean = sum(diffs) / n
    absd = sorted(abs(d) for d in diffs)

    stops = []
    for w in wps:
        r = int((t["lat0"] - w["lat"]) / t["px"])
        c = int((w["lon"] - t["lon0"]) / t["px"])
        stops.append({"waypoint": w["id"], "sol": w["sol"], "roverElevM": round(w["elevM"], 1),
                      "hrscBlendElevM": hrsc.get((r, c))})
    out = {
        "aiNotice": "Computed by tools/hrsc_check.py (written with AI assistance, checked by the team). See AI-USAGE.md.",
        "source": URL,
        "sourceName": "Mars MGS MOLA - MEX HRSC Blended DEM Global 200m v2 (USGS; HRSC: ESA/DLR/FU Berlin; MOLA: NASA)",
        "pixelsCompared": n,
        "meanDifferenceM": round(mean, 1),
        "medianAbsDifferenceM": round(absd[n // 2], 1),
        "p95AbsDifferenceM": round(absd[int(n * 0.95)], 1),
        "note": "Our grid (HiRISE 1 m, 25 m cells) averaged over each 200 m HRSC-blend pixel, minus the HRSC-blend value. "
                "A small offset is expected: the two models use different references and resolutions.",
        "curiosityStops": stops,
    }
    with open(os.path.join(DATA, "hrsc_check.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, indent=1)
    print(json.dumps({k: out[k] for k in ("pixelsCompared", "meanDifferenceM", "medianAbsDifferenceM", "p95AbsDifferenceM")}))
    for s in stops:
        print(s)


if __name__ == "__main__":
    main()
