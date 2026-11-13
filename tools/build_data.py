"""

build_data.py  -  Data agent script for Darb (Marswalk Planner)

Downloads REAL public NASA data for our study area on Mount Sharp (Gale Crater)
and turns it into small JSON files the web app can load offline.

Uses ONLY the Python standard library (no installs needed).
Run from the project folder:   python tools/build_data.py

Outputs (all in data/):
  grid.json         elevation (HiRISE 1 m DEM, MOLA for gaps), slope, roughness, THEMIS night-IR brightness per ~25 m cell
  environment.json  REMS weather (last 30 sols) + RAD radiation (published values)
  waypoints.json    Curiosity rover positions in the 2025 boxwork campaign + raw image links
  crism/*.png       CRISM browse images (mineral maps) + crism/products.json

Every source is listed in SOURCES.md.
"""

import json
import math
import os
import re
import struct
import urllib.request
import zlib

# ---------------------------------------------------------------------------
# Study area = footprint of CRISM observation FRT0000B6F1 (so all layers overlap)
# ---------------------------------------------------------------------------
LAT_N, LAT_S = -4.6935, -4.9100      # degrees (negative = south)
LON_W, LON_E = 137.3012, 137.5362    # degrees east
CELL_DEG = 0.00042                   # grid cell size in degrees (~25 m on Mars)
MARS_RADIUS_M = 3396190.0            # IAU Mars sphere radius used by MOLA / Trek

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")
AI_DATA_NOTICE = "The data values come from NASA/USGS/CAB sources (see SOURCES.md). The script that downloaded and processed them (tools/build_data.py) was written with help from an AI coding assistant (Claude Code, Anthropic) and checked by the team (e.g. elevation vs. Curiosity's own measurements). See AI-USAGE.md."
UA = {"User-Agent": "darb-marswalk-student-project"}


def fetch(url, byte_range=None):
    """Download a URL and return the bytes. byte_range=(start, end) downloads only part of a file."""
    headers = dict(UA)
    if byte_range:
        headers["Range"] = "bytes=%d-%d" % byte_range
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


# ---------------------------------------------------------------------------
# 1. MOLA elevation (MGS MOLA MEGDR, 128 pixels/degree = ~463 m/pixel)
#    File covers 0°..44°S and 90°E..180°E. Each row = 11520 big-endian int16 (metres).
# ---------------------------------------------------------------------------
MOLA_URL = ("https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/"
            "mgsl_300x/meg128/megt00n090hb.img")
MOLA_PPD, MOLA_COLS, MOLA_LAT0, MOLA_LON0 = 128, 11520, 0.0, 90.0


def load_mola():
    """Read only the MOLA rows we need (HTTP range request, ~0.8 MB instead of 130 MB)."""
    row0 = int((MOLA_LAT0 - LAT_N) * MOLA_PPD) - 2
    row1 = int((MOLA_LAT0 - LAT_S) * MOLA_PPD) + 2
    col0 = int((LON_W - MOLA_LON0) * MOLA_PPD) - 2
    col1 = int((LON_E - MOLA_LON0) * MOLA_PPD) + 2
    rec = MOLA_COLS * 2
    raw = fetch(MOLA_URL, (row0 * rec, (row1 + 1) * rec - 1))
    rows = {}
    for r in range(row0, row1 + 1):
        line = raw[(r - row0) * rec:(r - row0 + 1) * rec]
        vals = struct.unpack(">%dh" % MOLA_COLS, line)
        rows[r] = vals[col0:col1 + 1]
    return rows, row0, col0


def mola_elevation(rows, row0, col0, lat, lon):
    """Bilinear interpolation of MOLA elevation at (lat, lon). Pixel centres are at +0.5."""
    fr = (MOLA_LAT0 - lat) * MOLA_PPD - 0.5
    fc = (lon - MOLA_LON0) * MOLA_PPD - 0.5
    r, c = int(math.floor(fr)), int(math.floor(fc))
    tr, tc = fr - r, fc - c
    z00 = rows[r][c - col0]
    z01 = rows[r][c + 1 - col0]
    z10 = rows[r + 1][c - col0]
    z11 = rows[r + 1][c + 1 - col0]
    top = z00 * (1 - tc) + z01 * tc
    bot = z10 * (1 - tc) + z11 * tc
    return top * (1 - tr) + bot * tr


# ---------------------------------------------------------------------------
# 2. Tiny PNG decoder (8-bit, non-interlaced) so we can read Mars Trek tiles
# ---------------------------------------------------------------------------
def decode_png(data):
    """Return (width, height, channels, pixel_rows). Supports grey, grey+alpha, RGB, RGBA."""
    assert data[:8] == b"\x89PNG\r\n\x1a\n", "not a PNG"
    pos, idat = 8, b""
    while pos < len(data):
        length, ctype = struct.unpack(">I4s", data[pos:pos + 8])
        chunk = data[pos + 8:pos + 8 + length]
        if ctype == b"IHDR":
            w, h, depth, color, _, _, interlace = struct.unpack(">IIBBBBB", chunk)
        elif ctype == b"IDAT":
            idat += chunk
        pos += 12 + length
    assert depth == 8 and interlace == 0, "unsupported PNG"
    ch = {0: 1, 2: 3, 4: 2, 6: 4}[color]
    raw = zlib.decompress(idat)
    stride = w * ch
    out, prev = [], bytearray(stride)
    i = 0
    for _ in range(h):
        f = raw[i]
        line = bytearray(raw[i + 1:i + 1 + stride])
        i += 1 + stride
        for x in range(stride):
            a = line[x - ch] if x >= ch else 0
            b = prev[x]
            c = prev[x - ch] if x >= ch else 0
            if f == 1:
                line[x] = (line[x] + a) & 255
            elif f == 2:
                line[x] = (line[x] + b) & 255
            elif f == 3:
                line[x] = (line[x] + (a + b) // 2) & 255
            elif f == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pred = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[x] = (line[x] + pred) & 255
        out.append(line)
        prev = line
    return w, h, ch, out


# ---------------------------------------------------------------------------
# 3. THEMIS night-time infrared (Mars Odyssey), from NASA Mars Trek WMTS tiles.
#    Bright at night = surface stays warm = high thermal inertia (rock).
#    Dark at night  = cools fast = low thermal inertia (loose sand / dust).
#    The tile is a contrast-stretched 8-bit image, so values are RELATIVE (0..1).
# ---------------------------------------------------------------------------
THEMIS_LAYER = "THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018"
TREK = "https://trek.nasa.gov/tiles/Mars/EQ/%s/1.0.0/default/default028mm/%d/%d/%d.png"
THEMIS_Z = 9   # zoom 9 = ~81 m per pixel, the highest level Trek serves for this layer


def load_themis_tiles():
    """Download the zoom-9 tiles that cover our box. Returns {(x, y): pixel_rows}."""
    tiles = {}
    n_lon = 2 ** (THEMIS_Z + 1)        # tiles across 360° (EPSG:4326 tiling, 2x1 at zoom 0)
    n_lat = 2 ** THEMIS_Z              # tiles across 180°
    x0 = int((LON_W + 180) / 360 * n_lon)
    x1 = int((LON_E + 180) / 360 * n_lon)
    y0 = int((90 - LAT_N) / 180 * n_lat)
    y1 = int((90 - LAT_S) / 180 * n_lat)
    for x in range(x0, x1 + 1):
        for y in range(y0, y1 + 1):
            w, h, ch, px = decode_png(fetch(TREK % (THEMIS_LAYER, THEMIS_Z, y, x)))
            tiles[(x, y)] = (ch, px)
    return tiles


def themis_value(tiles, lat, lon):
    """Brightness 0..255 of the THEMIS night-IR pixel at (lat, lon), or None if no data."""
    n_lon, n_lat = 2 ** (THEMIS_Z + 1), 2 ** THEMIS_Z
    fx = (lon + 180) / 360 * n_lon
    fy = (90 - lat) / 180 * n_lat
    x, y = int(fx), int(fy)
    px, py = int((fx - x) * 256), int((fy - y) * 256)
    ch, rows = tiles[(x, y)]
    v = rows[py][px * ch]
    if ch in (2, 4) and rows[py][px * ch + ch - 1] == 0:   # transparent = no data
        return None
    return v


# ---------------------------------------------------------------------------
# 4. Build the grid
# ---------------------------------------------------------------------------
def build_grid():
    import sys
    sys.path.insert(0, HERE)          # so we can import tools/hirise_dem.py
    from hirise_dem import HiriseDEM, NODATA
    print("MOLA: downloading rows ...")
    rows, row0, col0 = load_mola()
    print("THEMIS: downloading tiles ...")
    tiles = load_themis_tiles()
    print("HiRISE DEM: opening ...")
    dem = HiriseDEM()
    print("  using", "local file" if dem.local else "HTTP range requests (slower)")
    dem_rows = {}                     # cache: DEM row number -> list of elevations

    N, STEP_M = 6, 4.0                # 6 x 6 samples, 4 m apart, inside each ~25 m cell
    deg_per_m = 1.0 / math.radians(1) / MARS_RADIUS_M

    def hirise_cell(lat, lon):
        """Read a 6x6 patch of 1 m HiRISE pixels (4 m apart) inside the cell.
        Returns (mean elevation, roughness) or (None, None) if no data.
        roughness = 90th percentile of the slopes between neighbouring samples (4 m apart), in degrees:
        it sees metre-scale steps (rocks, small ridges) that the 25 m slope cannot."""
        z = [[None] * N for _ in range(N)]
        for i in range(N):
            for j in range(N):
                dy_m, dx_m = (i - (N - 1) / 2) * STEP_M, (j - (N - 1) / 2) * STEP_M
                col, row = dem.lonlat_to_colrow(lon + dx_m * deg_per_m / math.cos(math.radians(lat)),
                                                lat - dy_m * deg_per_m)
                col, row = int(col), int(row)
                if not (0 <= row < dem.height and 0 <= col < dem.width):
                    continue
                if row not in dem_rows:
                    dem_rows[row] = dem.row(row)
                v = dem_rows[row][col]
                if v > NODATA + 1:
                    z[i][j] = v
        vals = [v for line in z for v in line if v is not None]
        if not vals:
            return None, None
        local = []
        for i in range(N):
            for j in range(N):
                if z[i][j] is None:
                    continue
                if j + 1 < N and z[i][j + 1] is not None:
                    local.append(abs(z[i][j + 1] - z[i][j]))
                if i + 1 < N and z[i + 1][j] is not None:
                    local.append(abs(z[i + 1][j] - z[i][j]))
        local.sort()
        p90 = local[int(len(local) * 0.9)] if local else 0.0
        return sum(vals) / len(vals), math.degrees(math.atan(p90 / STEP_M))

    n_rows = int(round((LAT_N - LAT_S) / CELL_DEG))
    n_cols = int(round((LON_E - LON_W) / CELL_DEG))
    lat_mid = math.radians((LAT_N + LAT_S) / 2)
    cell_h = math.radians(CELL_DEG) * MARS_RADIUS_M                 # metres north-south
    cell_w = math.radians(CELL_DEG) * MARS_RADIUS_M * math.cos(lat_mid)  # metres east-west

    elev, rough, themis, filled = [], [], [], 0
    for r in range(n_rows):
        lat = LAT_N - (r + 0.5) * CELL_DEG
        if r % 50 == 0:
            print("  grid row %d / %d" % (r, n_rows))
        dem_rows.clear()              # each grid row uses its own 6 DEM rows: keep memory small
        for c in range(n_cols):
            lon = LON_W + (c + 0.5) * CELL_DEG
            z, rg = hirise_cell(lat, lon)
            if z is None:             # gap in the HiRISE mosaic -> fill with MOLA (no roughness known)
                z = mola_elevation(rows, row0, col0, lat, lon)
                filled += 1
            elev.append(round(z, 1))
            rough.append(None if rg is None else round(rg, 1))
            # average a 3x3 sample of THEMIS pixels inside the cell
            vals = []
            for dy in (-0.33, 0, 0.33):
                for dx in (-0.33, 0, 0.33):
                    v = themis_value(tiles, lat + dy * CELL_DEG, lon + dx * CELL_DEG)
                    if v is not None:
                        vals.append(v)
            themis.append(sum(vals) / len(vals) if vals else None)

    # slope (degrees) with central differences
    slope = []
    for r in range(n_rows):
        for c in range(n_cols):
            def z(rr, cc):
                rr = min(max(rr, 0), n_rows - 1)
                cc = min(max(cc, 0), n_cols - 1)
                return elev[rr * n_cols + cc]
            dzdx = (z(r, c + 1) - z(r, c - 1)) / (2 * cell_w)
            dzdy = (z(r + 1, c) - z(r - 1, c)) / (2 * cell_h)
            slope.append(round(math.degrees(math.atan(math.hypot(dzdx, dzdy))), 1))

    # THEMIS -> relative 0..1 inside our box (2nd..98th percentile stretch)
    good = sorted(v for v in themis if v is not None)
    lo, hi = good[int(len(good) * 0.02)], good[int(len(good) * 0.98)]
    therm = [None if v is None else round(min(1, max(0, (v - lo) / (hi - lo))), 2) for v in themis]

    grid = {
        "aiNotice": AI_DATA_NOTICE,
        "about": "Built by tools/build_data.py from real NASA data. See SOURCES.md.",
        # exact edges of the whole cells (a whole number of cells does not fill the box exactly)
        "bounds": {"north": LAT_N, "south": round(LAT_N - n_rows * CELL_DEG, 7),
                   "west": LON_W, "east": round(LON_W + n_cols * CELL_DEG, 7)},
        "cellDeg": CELL_DEG, "rows": n_rows, "cols": n_cols,
        "cellWidthM": round(cell_w, 2), "cellHeightM": round(cell_h, 2),
        "elevation": elev,
        "elevationSource": "USGS MSL Gale DEM Mosaic 1m v3 (HiRISE stereo), mean of 6x6 samples (4 m apart) per cell; "
                           "%d cells (%.1f%%) outside HiRISE coverage filled with MGS MOLA MEGDR 128 ppd. Metres."
                           % (filled, 100.0 * filled / (n_rows * n_cols)),
        "filledFromMola": filled,
        "roughness": rough,
        "roughnessNote": "Degrees. 90th percentile of slopes between HiRISE samples 4 m apart inside each cell "
                         "(6x6 samples). Shows metre-scale steps such as rocks and small ridges. "
                         "HiRISE DEM noise (~0.2-0.5 m) adds a few degrees.",
        "slope": slope,
        "slopeNote": "Computed at %.0f m cell size from the HiRISE DEM. Rocks and ridges smaller than a cell "
                     "(e.g. 1-2 m boxwork ridges) are not visible in this slope." % cell_h,
        "thermal": therm,
        "thermalSource": "Mars Odyssey THEMIS night IR mosaic v2 (Mars Trek tiles, zoom 9). Relative 0..1: "
                          "1 = warm at night (rock, high thermal inertia), 0 = cold (loose sand/dust).",
    }
    with open(os.path.join(DATA, "grid.json"), "w") as f:
        json.dump(grid, f, separators=(",", ":"))
    print("grid.json: %d x %d cells, elevation %.0f..%.0f m, max slope %.1f deg"
          % (n_rows, n_cols, min(elev), max(elev), max(slope)))


# ---------------------------------------------------------------------------
# 5. CRISM mineral browse images (MRO CRISM MTRDR FRT0000B6F1, PDS Geosciences Node)
# ---------------------------------------------------------------------------
CRISM_BASE = ("https://pds-geosciences.wustl.edu/mro/mro-m-crism-5-rdr-mptargeted-v1/"
              "mrocr_4001/browse/2008/2008_191/frt0000b6f1/frt0000b6f1_07_%s_mtr3.%s")
CRISM_PRODUCTS = {
    "phy": "Hydroxylated minerals (clays / phyllosilicates)",
    "hyd": "Bound water (hydrated sulfates)",
    "maf": "Mafic minerals (olivine / pyroxene)",
    "fem": "Iron minerals (ferric / ferrous, e.g. hematite)",
    "tru": "Enhanced true colour",
}


def lbl_value(text, key):
    m = re.search(r"\b" + key + r"\s*=\s*(\([^)]*\)|\"[^\"]*\"|[^\s]+)", text, re.S)
    return m.group(1) if m else None


def build_crism():
    out = []
    for code, name in CRISM_PRODUCTS.items():
        lbl = fetch(CRISM_BASE % ("br" + code + "j", "lbl")).decode("latin-1")
        png = fetch(CRISM_BASE % ("br" + code + "j", "png"))
        with open(os.path.join(DATA, "crism", code + ".png"), "wb") as f:
            f.write(png)
        desc = lbl_value(lbl, "DESCRIPTION")
        bands = lbl_value(lbl, "BAND_NAME")
        out.append({
            "code": code, "name": name, "file": "data/crism/%s.png" % code,
            "bounds": {
                "north": float(lbl_value(lbl, "MAXIMUM_LATITUDE")),
                "south": float(lbl_value(lbl, "MINIMUM_LATITUDE")),
                "west": float(lbl_value(lbl, "WESTERNMOST_LONGITUDE")),
                "east": float(lbl_value(lbl, "EASTERNMOST_LONGITUDE")),
            },
            "bandsRGB": [b.strip(' "') for b in bands.strip("()").split(",")] if bands else None,
            "pdsDescription": " ".join(desc.strip('"').split()) if desc else None,
            "source": CRISM_BASE % ("br" + code + "j", "png"),
        })
        print("CRISM", code, "ok")
    with open(os.path.join(DATA, "crism", "products.json"), "w") as f:
        json.dump({"aiNotice": AI_DATA_NOTICE, "observation": "FRT0000B6F1 (2008-07-09)", "products": out}, f, indent=1)


# ---------------------------------------------------------------------------
# 6. Environment: REMS weather (CAB / NASA feed) + RAD radiation (published)
# ---------------------------------------------------------------------------
REMS_URL = "https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json"


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def build_environment():
    sols = json.loads(fetch(REMS_URL))["soles"]
    recent = []
    for s in sols[:30]:       # feed is newest-first
        recent.append({
            "sol": int(s["sol"]), "earthDate": s["terrestrial_date"], "ls": num(s["ls"]),
            "minAirC": num(s["min_temp"]), "maxAirC": num(s["max_temp"]),
            "minGroundC": num(s["min_gts_temp"]), "maxGroundC": num(s["max_gts_temp"]),
            "pressurePa": num(s["pressure"]), "uv": s["local_uv_irradiance_index"],
            "opacity": s["atmo_opacity"], "sunrise": s["sunrise"], "sunset": s["sunset"],
        })
    env = {
        "aiNotice": AI_DATA_NOTICE,
        "rems": {
            "source": REMS_URL,
            "note": "REMS data provided by Centro de Astrobiologia (CSIC-INTA) for outreach. "
                    "Scientific REMS data is in the PDS Atmospheres Node.",
            "recentSols": recent,
        },
        "rad": {
            "source": "Hassler et al. 2014, Science 343, doi:10.1126/science.1244797 (MSL RAD)",
            "surfaceDoseRate_mGy_per_day": 0.21,
            "surfaceDoseRate_uncertainty": 0.04,
            "surfaceDoseEquivalent_mSv_per_day": 0.64,
            "surfaceDoseEquivalent_uncertainty": 0.12,
            "note": "Average measured by Curiosity RAD on the floor of Gale Crater, Aug 2012 - Jun 2013.",
        },
    }
    with open(os.path.join(DATA, "environment.json"), "w") as f:
        json.dump(env, f, indent=1)
    print("environment.json: %d sols, newest sol %d" % (len(recent), recent[0]["sol"]))


# ---------------------------------------------------------------------------
# 7. Waypoints: where Curiosity actually drove during the 2025 boxwork campaign,
#    with links to real raw Navcam / Mastcam images taken on that sol.
# ---------------------------------------------------------------------------
WAYPOINTS_URL = "https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json"
RAW_API = ("https://mars.nasa.gov/api/v1/raw_image_items/?order=sol%%20desc&per_page=100&page=0"
           "&condition_1=msl:mission&condition_2=%d:sol:gte&condition_3=%d:sol:lte")
SOL_FROM, SOL_TO = 4480, 4800        # ~ March 2025 to February 2026


def build_waypoints():
    feats = json.loads(fetch(WAYPOINTS_URL))["features"]
    traverse, stops = [], []
    for f in feats:
        p = f["properties"]
        if LAT_S <= p["lat"] <= LAT_N and LON_W <= p["lon"] <= LON_E:
            traverse.append([round(p["lat"], 6), round(p["lon"], 6), p["sol"]])
            if SOL_FROM <= p["sol"] <= SOL_TO:
                stops.append(p)
    # pick ~8 evenly spaced stops from the boxwork campaign
    step = max(1, len(stops) // 8)
    picked = stops[::step][:8]
    out = []
    for i, p in enumerate(picked):
        imgs = []
        # 1) Full-frame Navcam looking at the terrain ahead (mast elevation closest to -20°)
        navs = json.loads(fetch(RAW_API % (p["sol"], p["sol"]) + "&condition_4=NAV_LEFT_B:instrument")).get("items", [])
        navs = [it for it in navs if (it.get("extended") or {}).get("sample_type") == "full"
                and "NCAM" in it["https_url"]]
        navs.sort(key=lambda it: abs(float((it.get("extended") or {}).get("mast_el") or -90) + 20))
        for it in navs[:2]:
            imgs.append({"camera": "NAV_LEFT_B", "url": it["https_url"], "date": it["date_taken"],
                         "credit": it.get("image_credit") or "NASA/JPL-Caltech"})
        # 2) One Mastcam colour image link (shown online only)
        for it in json.loads(fetch(RAW_API % (p["sol"], p["sol"]))).get("items", []):
            if it.get("instrument") == "MAST_LEFT":
                imgs.append({"camera": "MAST_LEFT", "url": it["https_url"], "date": it["date_taken"],
                             "credit": it.get("image_credit") or "NASA/JPL/MSSS"})
                break
        # keep a local copy of the first image (~200 KB) so the app works offline
        # and the local vision model can look at it
        if imgs:
            local = "data/images/wp%d.jpg" % (i + 1)
            with open(os.path.join(DATA, "images", "wp%d.jpg" % (i + 1)), "wb") as f:
                f.write(fetch(imgs[0]["url"]))
            imgs[0]["local"] = local
        out.append({"id": i + 1, "sol": p["sol"], "lat": p["lat"], "lon": p["lon"],
                    "elevM": p.get("elev_geoid"), "images": imgs})
        print("waypoint sol", p["sol"], len(imgs), "images")
    with open(os.path.join(DATA, "waypoints.json"), "w") as f:
        json.dump({"aiNotice": AI_DATA_NOTICE, "source": WAYPOINTS_URL, "rawImagesSource": "https://mars.nasa.gov/msl/multimedia/raw-images/",
                   "traverse": traverse, "waypoints": out}, f, indent=1)


# ---------------------------------------------------------------------------
# 8. Offline map tiles: save the Mars Trek tiles that cover our study area, so the
#    map imagery also works with NO internet (like on Mars). Only a few MB.
# ---------------------------------------------------------------------------
TILE_SETS = [
    # (layer id, file extension, min zoom, max zoom, padding in degrees around the box)
    ("Mars_Viking_MDIM21_ClrMosaic_global_232m", "jpg", 3, 7, 3.0),
    ("Gale_CTX_BlockAdj_dd", "png", 8, 10, 0.6),       # zoomed-out views reach further: wider margin
    ("Gale_CTX_BlockAdj_dd", "png", 11, 12, 0.05),
    ("THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018", "png", 8, 9, 0.6),
    ("Mars_MGS_MOLA_ClrShade_merge_global_463m", "jpg", 3, 7, 3.0),
]


def build_tiles():
    root = os.path.join(HERE, "..", "tiles")
    total, count = 0, 0
    for layer, ext, z0, z1, pad in TILE_SETS:
        for z in range(z0, z1 + 1):
            n_lon, n_lat = 2 ** (z + 1), 2 ** z
            x0 = int((LON_W - pad + 180) / 360 * n_lon)
            x1 = int((LON_E + pad + 180) / 360 * n_lon)
            y0 = int((90 - (LAT_N + pad)) / 180 * n_lat)
            y1 = int((90 - (LAT_S - pad)) / 180 * n_lat)
            for x in range(x0, x1 + 1):
                for y in range(y0, y1 + 1):
                    out = os.path.join(root, layer, str(z), str(y), "%d.%s" % (x, ext))
                    if os.path.exists(out):
                        continue
                    try:
                        data = fetch(TREK.replace(".png", "." + ext) % (layer, z, y, x))
                    except Exception:
                        continue          # tile does not exist (outside the mosaic) - skip it
                    os.makedirs(os.path.dirname(out), exist_ok=True)
                    with open(out, "wb") as f:
                        f.write(data)
                    total += len(data)
                    count += 1
    print("tiles: %d new tiles, %.1f MB" % (count, total / 1e6))
    # index of every saved tile, so the app knows which tiles exist locally (no 404 errors)
    index = {}
    for layer in sorted(set(t[0] for t in TILE_SETS)):
        base = os.path.join(root, layer)
        keys = []
        for dirpath, _, files in os.walk(base):
            rel = os.path.relpath(dirpath, base).replace("\\", "/")      # "z/y"
            keys += ["%s/%s" % (rel, f.split(".")[0]) for f in files]   # "z/y/x"
        index[layer] = sorted(keys)
    with open(os.path.join(root, "index.json"), "w") as f:
        json.dump(index, f, separators=(",", ":"))


if __name__ == "__main__":
    import sys
    os.makedirs(os.path.join(DATA, "crism"), exist_ok=True)
    os.makedirs(os.path.join(DATA, "images"), exist_ok=True)
    # Run everything, or only some parts:  python tools/build_data.py waypoints environment
    parts = sys.argv[1:] or ["grid", "crism", "environment", "waypoints", "tiles"]
    if "grid" in parts:
        build_grid()
    if "crism" in parts:
        build_crism()
    if "environment" in parts:
        build_environment()
    if "waypoints" in parts:
        build_waypoints()
    if "tiles" in parts:
        build_tiles()
    print("done")
