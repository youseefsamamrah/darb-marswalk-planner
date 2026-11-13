# SOURCES.md — every data source used by Darb

All data is public and free. Every link below was tested (HTTP 200) on 2026-11-12.
**No SAMPLE DATA is shown in the app**: every layer and number comes from these sources.
Things that are *our own assumptions* (not data) are listed at the bottom.

## Map tiles (saved offline in `tiles/` for the study area; elsewhere loaded live from Mars Trek)
| Layer in app | Source | Link |
|---|---|---|
| Base map (global) | Viking MDIM 2.1 colour mosaic, NASA/USGS, via **NASA Mars Trek** WMTS | https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/WMTSCapabilities.xml |
| Base map (Gale Crater, sharp) | MRO **CTX** Gale Crater mosaic (NASA/JPL/MSSS) via Mars Trek | https://trek.nasa.gov/tiles/Mars/EQ/Gale_CTX_BlockAdj_dd/1.0.0/WMTSCapabilities.xml |
| Elevation hillshade | MGS **MOLA** colour hillshade (NASA/GSFC) via Mars Trek | https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/WMTSCapabilities.xml |
| Thermal inertia proxy | Mars Odyssey **THEMIS** night-time IR global mosaic v2 (NASA/JPL/ASU) via Mars Trek | https://trek.nasa.gov/tiles/Mars/EQ/THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018/1.0.0/WMTSCapabilities.xml |

Tile URL pattern: `https://trek.nasa.gov/tiles/Mars/EQ/{layer}/1.0.0/default/default028mm/{z}/{y}/{x}.{png|jpg}`
(geographic tiling, 2×1 tiles at zoom 0 = Leaflet `L.CRS.EPSG4326`). Mars Trek home: https://trek.nasa.gov/mars/

## Data files in `data/` (built by `tools/build_data.py`, work offline)
| File | What | Source |
|---|---|---|
| `grid.json` → elevation (main) | **MSL Gale DEM Mosaic 1m v3** — 1 m/pixel elevation from **HiRISE** stereo images (USGS Astrogeology; HiRISE: NASA/JPL/University of Arizona). 3.87 GB GeoTIFF, 32980 × 57440 px, float32, LZW, Mars equirectangular (centre lon 0, R = 3,396,190 m), NoData −32767. Downloaded once to `raw/hirise_dem/` (not in git); read by `tools/hirise_dem.py`. Each 25 m cell = mean of 6 × 6 samples 4 m apart (the same samples give the roughness value). | https://planetarymaps.usgs.gov/mosaic/Mars/MSL/MSL_Gale_DEM_Mosaic_1m_v3.tif |
| `grid.json` → elevation (gap filler) | MGS **MOLA MEGDR** 128 pixels/degree (~463 m), file MEGT00N090HB.IMG, read with an HTTP range request; used only where HiRISE has no data (0 % of cells in our box) | NASA PDS Geosciences Node: https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg128/megt00n090hb.img (label: same path `.lbl`) |
| `grid.json` → slope | Computed by us from the HiRISE-based elevation at 25 m cells (central differences) | — |
| `grid.json` → thermal | THEMIS night IR tiles (zoom 9, ~81 m/pixel), averaged per cell, stretched 0–1 inside our box (relative) | Mars Trek tiles above |
| `crism/*.png`, `crism/products.json` | MRO **CRISM** MTRDR browse products (PHY, HYD, MAF, FEM, TRU) of observation **FRT0000B6F1** (2008-07-09), map-projected | PDS Geosciences Node: https://pds-geosciences.wustl.edu/mro/mro-m-crism-5-rdr-mptargeted-v1/mrocr_4001/browse/2008/2008_191/frt0000b6f1/ · product search via PDS ODE REST: https://oderest.rsl.wustl.edu/ |
| `environment.json` → REMS | Curiosity **REMS** daily weather (last 30 sols), provided by Centro de Astrobiología (CSIC-INTA, Spain) for outreach | https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json (science data: PDS Atmospheres Node) |
| `environment.json` → RAD | Curiosity **RAD**: 0.21 ± 0.04 mGy/day, 0.64 ± 0.12 mSv/day on the surface of Gale Crater | Hassler, D. M. et al. (2014), *Mars' Surface Radiation Environment Measured with the Mars Science Laboratory's Curiosity Rover*, Science 343, doi:10.1126/science.1244797 |
| `waypoints.json` → traverse + stops | Curiosity rover positions (site/drive, lat/lon, elevation, sol) | MSL MMGIS waypoints: https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json |
| `images/wp*.jpg` + image links | Curiosity raw **Navcam** (and Mastcam links) from the same sols. Credit: NASA/JPL-Caltech (Mastcam: NASA/JPL-Caltech/MSSS) | https://mars.nasa.gov/msl/multimedia/raw-images/ (API: https://mars.nasa.gov/api/v1/raw_image_items/) |

| `hrsc_check.json` | **Independent elevation check**: "Mars MGS MOLA – MEX HRSC Blended DEM Global 200m v2" (USGS Astrogeology; HRSC camera on ESA's **Mars Express** — ESA/DLR/FU Berlin; MOLA: NASA). 11.4 GB BigTIFF, uncompressed int16, 0.003374°/px; we read only ~65 rows over HTTP range requests (`tools/hrsc_check.py`). Result over 4,416 pixels: average bias +3.7 m (ours slightly higher), median absolute difference 12.1 m. | https://planetarymaps.usgs.gov/mosaic/Mars/HRSC_MOLA_Blend/Mars_HRSC_MOLA_BlendDEM_Global_200mp_v2.tif |

## Facts used in text
| Fact | Source |
|---|---|
| Boxwork = ridges ~1–2 m tall with sandy hollows; groundwater minerals in fractures; Curiosity images Aug–Sept 2025; ~6 months in the region by Feb 2026 | NASA/JPL, "NASA's Curiosity Rover Sees Martian 'Spiderwebs' Up Close" (Feb 23, 2026): https://www.nasa.gov/missions/mars-science-laboratory/curiosity-rover/nasas-curiosity-rover-sees-martian-spiderwebs-up-close/ |
| Challenge text (boxwork, Mount Sharp, HUD, pairs of astronauts) | https://www.spaceappschallenge.org/2026/challenges/interplanetary-survival-guide-martian-map/ |
| Curiosity latest position (sol 5070): 4.8257°S, 137.3892°E | MSL MMGIS current waypoint: https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints_current.json |
| Earth–Mars light time 4–24 min | Standard value; the HUD estimates today's value from circular orbits (approximate) |

## Software
- Leaflet 1.9.4 (BSD-2), copied into `vendor/leaflet/` from https://unpkg.com/leaflet@1.9.4/dist/
- Ollama (MIT) + open-weight models (see AI-USAGE.md): https://ollama.com

## Our own assumptions (NOT NASA data — explained in TEAM-GUIDE.md)
- Slope limits: < 10° easy, 10–15° caution, 15–20° danger, > 20° blocked.
- Walking speed 2 km/h on flat ground in a suit, slower on slopes (Tobler-style hiking formula).
- EVA life-support budget 8 h for the whole trip (out and back).
- THEMIS value < 0.25 (relative) = "probably loose sand".
- Roughness (90th-percentile slope between 1 m HiRISE samples 4 m apart): < 25° normal, 25–40° rough, > 40° very rough.
  Calibrated on Curiosity's 2025 stops (10–22°). Adds cost, never blocks.
- Safety score rules (route.js `routeStats`).

## Validation we did
- Grid elevation (HiRISE) at Curiosity's 8 stops in 2025 vs the rover's own recorded elevation: max difference **4.2 m**
  (the earlier MOLA-only grid was up to 44 m off).
- The routing grid covers our whole box with HiRISE data (0 cells filled from MOLA).
- CRISM browse PNG bounds come from the PDS label (`MINIMUM_LATITUDE` … `EASTERNMOST_LONGITUDE`).
