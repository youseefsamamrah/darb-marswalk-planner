/*
 * config.js — all settings and data-source links in ONE place.
 * Every source here is also listed in SOURCES.md.
 */
var DARB_CONFIG = {
  // Map starts centred on lower Mount Sharp, Gale Crater (where Curiosity drives)
  center: [-4.80, 137.42],
  zoom: 11,

  // NASA Mars Trek WMTS tiles (https://trek.nasa.gov/mars/). Tiling = geographic (EPSG:4326),
  // which matches Leaflet's built-in L.CRS.EPSG4326 (2 x 1 tiles at zoom 0).
  trekTile: function (layer, ext) {
    return "https://trek.nasa.gov/tiles/Mars/EQ/" + layer + "/1.0.0/default/default028mm/{z}/{y}/{x}." + ext;
  },
  layers: {
    viking: { id: "Mars_Viking_MDIM21_ClrMosaic_global_232m", ext: "jpg", maxNative: 7,
              credit: "Viking MDIM 2.1 colour mosaic — NASA/USGS via Mars Trek" },
    ctx:    { id: "Gale_CTX_BlockAdj_dd", ext: "png", maxNative: 12,
              credit: "MRO CTX Gale Crater mosaic — NASA/JPL/MSSS via Mars Trek" },
    mola:   { id: "Mars_MGS_MOLA_ClrShade_merge_global_463m", ext: "jpg", maxNative: 7,
              credit: "MGS MOLA colour hillshade — NASA/GSFC via Mars Trek" },
    themis: { id: "THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018", ext: "png", maxNative: 9,
              credit: "Mars Odyssey THEMIS night IR — NASA/JPL/ASU via Mars Trek" }
  },
  // Fallback if Mars Trek is down: OpenPlanetaryMap is NOT used because it is Web Mercator.
  // Instead the app keeps working with the local data layers (slope, CRISM, route).

  // Local Ollama server for "Ask Darb" (offline AI)
  ollamaUrl: "http://localhost:11434",
  preferredModels: ["qwen3.5:9b", "qwen3.5:latest", "gpt-oss:20b"],

  // Our walking assumptions (see TEAM-GUIDE.md) — passed to route.js
  routeOptions: { safeSlope: 10, cautionSlope: 15, maxSlope: 20, evaBudgetHours: 8 },

  // Mars → Earth one-way light time range (minutes), used in the UI
  lightMinutes: [4, 24]
};
