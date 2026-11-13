/*
 * app.js — Darb main program (Map/UI agent)
 * ------------------------------------------
 * 1. Loads our data files (built from NASA data by tools/build_data.py)
 * 2. Shows the Mars map (NASA Mars Trek tiles) with toggleable data layers
 * 3. Lets the user click START and GOAL, runs A* (route.js), draws the route + info card
 * 4. Waypoints with real Curiosity images, HUD mode, buddy mode, Arabic toggle
 * 5. Connects the "Ask Darb" offline AI (askdarb.js) with grounded context
 */
(function () {
  "use strict";
  var T = function (k) { return DarbI18n.t(k); };
  var $ = function (id) { return document.getElementById(id); };

  // Everything the app knows lives in this one object (easy to inspect in the console: Darb)
  var Darb = window.Darb = {
    grid: null, env: null, wp: null, crism: null,
    map: null, layers: {}, start: null, goal: null, route: null, stats: null,
    saved: { A: null, B: null }, savedLayers: {},
    costCache: {}, crismPixels: {}, sim: null, aiLog: [], aiHistory: [],
    perf: { planMs: null, lastLayer: null }   // live numbers for the performance budget lines
  };

  // ------------------------------------------------------------------ loading
  async function loadJSON(url) {
    // "no-cache" = always check with the server for a newer copy (cheap), so rebuilt data is never stale
    var r = await fetch(url, { cache: "no-cache" });
    if (!r.ok) throw new Error(url + " → HTTP " + r.status);
    return r.json();
  }

  async function init() {
    try {
      var all = await Promise.all([
        loadJSON("data/grid.json"), loadJSON("data/environment.json"),
        loadJSON("data/waypoints.json"), loadJSON("data/crism/products.json")
      ]);
      Darb.grid = all[0]; Darb.env = all[1]; Darb.wp = all[2]; Darb.crism = all[3];
      // The grid has a whole number of cells, so its real south/east edges are north − rows×cell and west + cols×cell.
      // Use those exact edges everywhere (overlays, dashed box, clicks) so nothing drifts at the edges.
      var gb = Darb.grid.bounds;
      gb.south = gb.north - Darb.grid.rows * Darb.grid.cellDeg;
      gb.east = gb.west + Darb.grid.cols * Darb.grid.cellDeg;
      // Elevation cross-check against ESA Mars Express HRSC (optional file from tools/hrsc_check.py)
      try { Darb.hrsc = await loadJSON("data/hrsc_check.json"); } catch (e3) { Darb.hrsc = null; }
      // List of map tiles saved on this device (optional — without it, tiles come from the internet)
      Darb.tileIndex = {};
      try {
        var idx = await loadJSON("tiles/index.json");
        for (var layer in idx) Darb.tileIndex[layer] = new Set(idx[layer]);
      } catch (e2) { /* no offline tiles: fine */ }
    } catch (e) {
      $("routeMsg").textContent = "Could not load data files. Start the app with start.bat (a local web server), " +
        "not by double-clicking index.html. (" + e.message + ")";
      return;
    }
    buildMap();
    buildLayers();
    buildEnvironment();
    wireUI();
    DarbI18n.apply();
    refreshCrismLegend();
    pollAI();
    applyShareLink();
  }

  // ------------------------------------------------------------------ map
  function buildMap() {
    var cfg = DARB_CONFIG;
    // Mars Trek uses geographic tiles (EPSG:4326) — Leaflet supports this out of the box.
    // L.CRS.EPSG4326 measures distances with EARTH's radius; we copy it with the MARS radius (3,396,190 m)
    // so the scale bar shows true Mars distances. The tiles are not affected.
    var marsCRS = L.extend({}, L.CRS.EPSG4326, { R: 3396190 });
    var map = Darb.map = L.map("map", { crs: marsCRS, center: cfg.center, zoom: cfg.zoom,
      minZoom: 3, maxZoom: 15, worldCopyJump: false });

    // A tile layer that uses the tile saved on this device when we have it (tiles/…),
    // and only asks NASA Mars Trek over the internet when we don't. Works with no internet in our area.
    var LocalFirstTiles = L.TileLayer.extend({
      getTileUrl: function (coords) {
        var z = this._getZoomForUrl(), key = z + "/" + coords.y + "/" + coords.x;
        var have = Darb.tileIndex[this.options.layerId];
        if (have && have.has(key)) return "tiles/" + this.options.layerId + "/" + key + "." + this.options.ext;
        return L.TileLayer.prototype.getTileUrl.call(this, coords);
      }
    });

    function trek(key, extra) {
      var l = cfg.layers[key];
      var opts = { maxNativeZoom: l.maxNative, maxZoom: 15, tileSize: 256, noWrap: true, layerId: l.id, ext: l.ext,
                   attribution: l.credit + ' · <a href="https://trek.nasa.gov/mars/" target="_blank">NASA Mars Trek</a>' };
      for (var k in extra || {}) opts[k] = extra[k];
      return new LocalFirstTiles(cfg.trekTile(l.id, l.ext), opts);
    }
    // Base map: Viking colour mosaic everywhere + sharp CTX mosaic over Gale Crater
    var viking = trek("viking").addTo(map);
    var ctx = trek("ctx", { bounds: [[-6.5733, 135.1843], [-2.8078, 139.2413]] }).addTo(map);
    var tileErrors = 0;
    [viking, ctx].forEach(function (l) {
      l.on("tileerror", function () {
        tileErrors++;
        if (tileErrors === 6) $("routeMsg").textContent =
          "Mars Trek map tiles are not loading (no internet?). Data layers and route planning still work offline.";
      });
    });

    Darb.layers.mola = trek("mola", { opacity: 0.6 });
    Darb.layers.thermal = trek("themis", { opacity: 0.6, bounds: [[-6.5, 135.2], [-2.8, 139.3]] });

    // Dashed box = the area where we have grid data
    var b = Darb.grid.bounds;
    L.rectangle([[b.south, b.west], [b.north, b.east]],
      { color: "#8fd3ff", weight: 1, dashArray: "6 6", fill: false, interactive: false }).addTo(map);
    L.control.scale({ imperial: false }).addTo(map);   // uses the Mars radius set on the CRS above
    buildSourcesControl(map);

    // Drawing order (higher = on top): Curiosity stop markers 600 < our route 640 < start/goal pins 660 < popups 700
    map.createPane("routePane").style.zIndex = 640;
    map.createPane("pinPane").style.zIndex = 660;
    Darb.routeRenderer = L.svg({ pane: "routePane" });

    // A popup with a photo: when the photo finishes loading, re-measure the popup so it stays inside the map
    map.on("popupopen", function (e) {
      fitPopup(e.popup);
      e.popup.getElement().querySelectorAll("img").forEach(function (img) {
        if (!img.complete) img.addEventListener("load", function () { if (e.popup.isOpen()) fitPopup(e.popup); }, { once: true });
      });
    });
    map.on("resize", function () { if (map._popup && map._popup.isOpen()) fitPopup(map._popup); });
    map.on("click", onMapClick);
    map.on("mousemove", onHover);
  }

  // Keep Leaflet's live layer credits, inside a keyboard-accessible disclosure on small screens.
  function buildSourcesControl(map) {
    var compact = window.matchMedia("(max-width: 800px)");
    var control = L.control({ position: "bottomright" });
    control.onAdd = function () {
      var details = L.DomUtil.create("details", "map-sources");
      var summary = L.DomUtil.create("summary", "", details);
      summary.dataset.i18n = "sourcesToggle";
      summary.textContent = T("sourcesToggle");
      details.appendChild(map.attributionControl.getContainer());
      function resize() { details.open = !compact.matches; }
      resize();
      compact.addEventListener("change", resize);
      L.DomEvent.disableClickPropagation(details);
      L.DomEvent.disableScrollPropagation(details);
      return details;
    };
    control.addTo(map);
  }

  function fitPopup(popup) {
    // Leave room for the wrapper, close button, tip and auto-pan margins, including on short mobile maps.
    popup.options.maxHeight = Math.max(40, Math.min(340, Darb.map.getSize().y - 90));
    popup.update();
  }

  // Slope layer: we colour every grid cell on a small canvas, then stretch it over the map.
  function makeSlopeImage() {
    var g = Darb.grid, o = DARB_CONFIG.routeOptions;
    var cv = document.createElement("canvas");
    cv.width = g.cols; cv.height = g.rows;
    var cx = cv.getContext("2d"), img = cx.createImageData(g.cols, g.rows);
    for (var i = 0; i < g.rows * g.cols; i++) {
      var s = g.slope[i], c;
      if (s < o.safeSlope) c = [61, 220, 132];
      else if (s < o.cautionSlope) c = [255, 210, 63];
      else if (s <= o.maxSlope) c = [255, 140, 0];
      else c = [255, 40, 40];
      img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1]; img.data[i * 4 + 2] = c[2]; img.data[i * 4 + 3] = 255;
    }
    cx.putImageData(img, 0, 0);
    return cv.toDataURL();
  }

  // Roughness layer: only rough cells are coloured (yellow 25–40°, purple > 40°), the rest is see-through.
  function makeRoughImage() {
    var g = Darb.grid, o = Object.assign({}, DarbRoute.DEFAULTS, DARB_CONFIG.routeOptions);
    var cv = document.createElement("canvas");
    cv.width = g.cols; cv.height = g.rows;
    var cx = cv.getContext("2d"), img = cx.createImageData(g.cols, g.rows);
    for (var i = 0; i < g.rows * g.cols; i++) {
      var v = g.roughness ? g.roughness[i] : null, c = null;
      if (v !== null && v > o.roughHigh) c = [190, 80, 255];
      else if (v !== null && v > o.roughStart) c = [255, 210, 63];
      if (!c) continue;                                   // alpha stays 0 = transparent
      img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1]; img.data[i * 4 + 2] = c[2]; img.data[i * 4 + 3] = 255;
    }
    cx.putImageData(img, 0, 0);
    return cv.toDataURL();
  }

  function buildLayers() {
    var g = Darb.grid, b = g.bounds, op = +$("opacity").value;
    Darb.layers.slope = L.imageOverlay(makeSlopeImage(), [[b.south, b.west], [b.north, b.east]],
      { opacity: op * 0.8, className: "pixelated",
        attribution: "Slope computed from the USGS MSL Gale 1 m DEM (HiRISE, NASA/JPL/UArizona)" }).addTo(Darb.map);
    Darb.layers.rough = L.imageOverlay(makeRoughImage(), [[b.south, b.west], [b.north, b.east]],
      { opacity: op, className: "pixelated", attribution: "Roughness from the USGS MSL Gale 1 m DEM (HiRISE)" });

    // CRISM select box
    var sel = $("crismSelect");
    Darb.crism.products.forEach(function (p) {
      var o = document.createElement("option"); o.value = p.code; sel.appendChild(o);
    });
    refreshCrismOptions();
    sel.value = "phy";
    Darb.layers.minerals = makeCrismLayer("phy");

    // Curiosity traverse + numbered 2025 stops (waypoints)
    var grp = L.layerGroup();
    L.polyline(Darb.wp.traverse.map(function (p) { return [p[0], p[1]]; }),
      { color: "#ffffff", weight: 2, opacity: 0.5 }).addTo(grp);
    Darb.wp.waypoints.forEach(function (w) {
      var m = L.marker([w.lat, w.lon], { icon: L.divIcon({ className: "", html: '<div class="wp-pin">' + w.id + "</div>", iconSize: [22, 22] }) });
      m.bindPopup(function () { return waypointPopup(w); }, POPUP_OPTS);
      m.addTo(grp);
    });
    Darb.layers.rover = grp.addTo(Darb.map);
  }

  // Popups: never taller than 340 px (scroll inside), and keep a margin from the map edge when auto-panning
  var POPUP_OPTS = { maxWidth: 320, maxHeight: 340, autoPanPadding: [16, 16] };

  // Short, translated names in the CRISM drop-down (the full PDS description is in the fold-out legend)
  function refreshCrismOptions() {
    Array.prototype.forEach.call($("crismSelect").options, function (o) { o.textContent = T("crism." + o.value); });
  }

  function makeCrismLayer(code) {
    var p = Darb.crism.products.find(function (x) { return x.code === code; });
    var b = p.bounds;
    return L.imageOverlay(p.file, [[b.south, b.west], [b.north, b.east]],
      { opacity: +$("opacity").value, attribution: "MRO CRISM " + Darb.crism.observation + " (NASA PDS)" });
  }

  function refreshCrismLegend() {
    // Short line + a fold-out with the official PDS explanation of the colours
    var p = Darb.crism.products.find(function (x) { return x.code === $("crismSelect").value; });
    var box = $("crismLegend");
    box.textContent = "";
    var det = document.createElement("details"), sum = document.createElement("summary"), body = document.createElement("p");
    sum.textContent = (p.bandsRGB ? "R/G/B = " + p.bandsRGB.join(" / ") + " — " : "") + T("crismMeaning");
    body.textContent = (p.pdsDescription || "") + " (" + T("pdsSource") + ", CRISM " + Darb.crism.observation + ")";
    det.appendChild(sum); det.appendChild(body); box.appendChild(det);
  }

  // Read the colour of a CRISM image at a lat/lon (for hover and for Ask Darb).
  function crismAt(code, lat, lon) {
    var p = Darb.crism.products.find(function (x) { return x.code === code; });
    var px = Darb.crismPixels[code];
    if (px === undefined) {      // first time: load the image into a hidden canvas (only once)
      var img = new Image();
      img.onload = function () {
        var cv = document.createElement("canvas"); cv.width = img.width; cv.height = img.height;
        var cx = cv.getContext("2d"); cx.drawImage(img, 0, 0);
        Darb.crismPixels[code] = { w: img.width, h: img.height, data: cx.getImageData(0, 0, img.width, img.height).data };
      };
      img.onerror = function () { Darb.crismPixels[code] = "failed"; };
      img.src = p.file;
      Darb.crismPixels[code] = "loading";
    }
    if (typeof px !== "object" || px === null) return null;   // still loading, or failed
    var b = p.bounds;
    var x = Math.floor((lon - b.west) / (b.east - b.west) * px.w);
    var y = Math.floor((b.north - lat) / (b.north - b.south) * px.h);
    if (x < 0 || y < 0 || x >= px.w || y >= px.h) return null;
    var i = (y * px.w + x) * 4;
    if (px.data[i + 3] === 0 || (px.data[i] + px.data[i + 1] + px.data[i + 2]) === 0) return null; // no data
    var out = {};
    (p.bandsRGB || ["R", "G", "B"]).forEach(function (band, k) { out[band] = px.data[i + k]; });
    return out;
  }
  function preloadCrism() { Darb.crism.products.forEach(function (p) { crismAt(p.code, 0, 0); }); }

  // ------------------------------------------------------------------ data at a point
  function cellInfo(lat, lon) {
    var g = Darb.grid, c = DarbRoute.latLonToCell(g, lat, lon);
    if (c.r < 0 || c.c < 0 || c.r >= g.rows || c.c >= g.cols) return null;
    var i = c.r * g.cols + c.c;
    return { cell: c, elevationM: g.elevation[i], slopeDeg: g.slope[i], thermalRel: g.thermal[i],
             roughDeg: g.roughness ? g.roughness[i] : null };
  }

  function onHover(e) {
    var info = cellInfo(e.latlng.lat, e.latlng.lng);
    var s = e.latlng.lat.toFixed(4) + "°, " + e.latlng.lng.toFixed(4) + "°E";
    if (info) s += " · elev " + Math.round(info.elevationM) + " m · slope " + info.slopeDeg.toFixed(1) +
      "° · thermal " + (info.thermalRel === null ? "n/a" : info.thermalRel.toFixed(2)) +
      (info.roughDeg === null ? "" : " · rough " + Math.round(info.roughDeg) + "°");
    $("hover").textContent = s;
  }

  // ------------------------------------------------------------------ route planning
  function pinIcon(kind) { return L.divIcon({ className: "", html: '<div class="pin ' + kind + '"></div>', iconSize: [18, 18] }); }

  function onMapClick(e) {
    if (document.body.classList.contains("hud-on")) return;
    if (!Darb.start || (Darb.start && Darb.goal)) { clearRoute(); setPoint("start", e.latlng); }
    else { setPoint("goal", e.latlng); planRoute(); }
  }

  function setPoint(kind, latlng) {
    if (Darb[kind + "Marker"]) Darb.map.removeLayer(Darb[kind + "Marker"]);
    Darb[kind] = latlng;
    var m = Darb[kind + "Marker"] = L.marker(latlng, { icon: pinIcon(kind), draggable: true, pane: "pinPane" }).addTo(Darb.map);
    m.on("dragend", function () { Darb[kind] = m.getLatLng(); if (Darb.start && Darb.goal) planRoute(); });
  }

  function clearRoute() {
    stopSim();
    ["start", "goal"].forEach(function (k) { if (Darb[k + "Marker"]) Darb.map.removeLayer(Darb[k + "Marker"]); Darb[k] = null; Darb[k + "Marker"] = null; });
    if (Darb.routeLayer) Darb.map.removeLayer(Darb.routeLayer);
    Darb.route = Darb.stats = Darb.routeLayer = null;
    Darb.planSeq = (Darb.planSeq || 0) + 1;            // invalidate any planning in flight
    $("routeCard").classList.add("hidden");
    $("routeMsg").textContent = "";
    $("perfPlan").classList.add("hidden");
  }

  function routeOptions() {
    var o = Object.assign({}, DARB_CONFIG.routeOptions);
    o.buddyMeters = $("buddyOn").checked ? Math.max(0, +$("buddyM").value || 0) : 0;
    return o;
  }

  async function planRoute() {
    // Show the spinner BEFORE the (synchronous) A* work, and let the browser paint it
    Darb.planSeq = (Darb.planSeq || 0) + 1;
    var token = Darb.planSeq;
    $("routeMsg").innerHTML = '<span class="spinner" aria-hidden="true"></span> ' + esc(T("routePlanning"));
    await new Promise(function (r) { setTimeout(r, 30); });
    if (token !== Darb.planSeq) return;                // map cleared or re-planned while working
    var g = Darb.grid, o = routeOptions();
    var key = "b" + o.buddyMeters;               // cost grid is cached per buddy setting
    if (!Darb.costCache[key]) Darb.costCache[key] = DarbRoute.buildCostGrid(g, o);
    o.costGrid = Darb.costCache[key];
    o.snapMeters = 150;          // a point on too-steep ground moves to safe ground up to 150 m away
    var a = DarbRoute.latLonToCell(g, Darb.start.lat, Darb.start.lng);
    var b = DarbRoute.latLonToCell(g, Darb.goal.lat, Darb.goal.lng);
    var t0 = performance.now();
    var res = await DarbRoute.findPath(g, a, b, o);   // await keeps a sync result working too
    var ms = performance.now() - t0;
    if (Darb.routeLayer) { Darb.map.removeLayer(Darb.routeLayer); Darb.routeLayer = null; }
    if (!res.ok) {
      Darb.route = Darb.stats = null;
      $("routeCard").classList.add("hidden");
      $("routeMsg").textContent = "⚠ " + T("err." + res.error);
      $("perfPlan").classList.add("hidden");
      return;
    }
    // Move a pin that was snapped to safe ground, and explain why
    var notes = [];
    ["start", "goal"].forEach(function (kind) {
      var sn = res.snapped && res.snapped[kind];
      if (!sn) return;
      var ll = DarbRoute.cellToLatLon(g, sn);
      Darb[kind] = L.latLng(ll.lat, ll.lon);
      Darb[kind + "Marker"].setLatLng(Darb[kind]);
      notes.push(esc(T(kind === "start" ? "snapStart" : "snapGoal")).replace("{distance}", iso(Math.round(sn.movedM) + " m")));
    });
    Darb.route = res.path;
    Darb.stats = DarbRoute.routeStats(g, res.path, o);
    Darb.perf.planMs = ms;
    $("routeMsg").innerHTML = esc(T("routeFound")).replace("{algorithm}", iso("A*"))
      .replace("{time}", iso(ms.toFixed(0) + " " + T("unitMs"))).replace("{n}", iso(res.path.length)) + " " + notes.join(" ");
    drawRoute();
    renderRouteCard();
    renderPerfPlan(ms);
  }

  function routeLatLngs() {
    var pts = Darb.route.map(function (c) { var ll = DarbRoute.cellToLatLon(Darb.grid, c); return [ll.lat, ll.lon]; });
    pts[0] = [Darb.start.lat, Darb.start.lng];                 // start/end exactly at the clicked points
    pts[pts.length - 1] = [Darb.goal.lat, Darb.goal.lng];
    return pts;
  }

  function drawRoute() {
    var colors = { safe: "#3ddc84", caution: "#ffd23f", danger: "#ff4d4d" };
    var pts = routeLatLngs(), col = colors[Darb.stats.safety];
    // Three lines on top of each other so the route stands out on ANY background:
    // a dark halo, a thick line in the safety colour, and a white dotted trail in the middle.
    var r = Darb.routeRenderer;
    var glow = L.polyline(pts, { renderer: r, color: "#05070f", weight: 12, opacity: 0.85, lineCap: "round", lineJoin: "round" });
    var line = L.polyline(pts, { renderer: r, color: col, weight: 6, opacity: 1, lineCap: "round", lineJoin: "round" });
    var dots = L.polyline(pts, { renderer: r, color: "#ffffff", weight: 2.5, dashArray: "2 9", lineCap: "round" });
    Darb.routeLayer = L.layerGroup([glow, line, dots]).addTo(Darb.map);
    // Clicking the route: show data at that point + the nearest real Curiosity image
    [glow, line, dots].forEach(function (l) { l.on("click", onRouteClick); });
  }

  function onRouteClick(e) {
    L.DomEvent.stopPropagation(e);
    var info = cellInfo(e.latlng.lat, e.latlng.lng);
    var near = nearestWaypoint(e.latlng.lat, e.latlng.lng);
    var html = "<b>" + esc(T("rpTitle")) + "</b><br>" + iso(e.latlng.lat.toFixed(4) + "°, " + e.latlng.lng.toFixed(4) + "°E");
    if (info) html += "<br>" + esc(T("rpElev")) + " " + iso(Math.round(info.elevationM) + " m") + " (HiRISE) · " +
      esc(T("rpSlope")) + " " + iso(info.slopeDeg.toFixed(1) + "°") + " · " + esc(T("rpThermal")) + " " +
      iso(info.thermalRel === null ? "n/a" : info.thermalRel.toFixed(2)) + " (THEMIS)";
    if (near) html += "<hr>" + esc(T("rpNear")) + " <b>#" + near.w.id + "</b> · " + iso((near.d / 1000).toFixed(2) + " km") +
      waypointPopup(near.w);
    L.popup(POPUP_OPTS).setLatLng(e.latlng).setContent(html).openOn(Darb.map);
  }

  // distance in metres between two lat/lon points on Mars (simple flat approximation, fine for < 50 km)
  function marsDistance(lat1, lon1, lat2, lon2) {
    var R = 3396190, toRad = Math.PI / 180;
    var x = (lon2 - lon1) * toRad * Math.cos((lat1 + lat2) / 2 * toRad), y = (lat2 - lat1) * toRad;
    return Math.sqrt(x * x + y * y) * R;
  }
  function nearestWaypoint(lat, lon) {
    var best = null;
    Darb.wp.waypoints.forEach(function (w) {
      var d = marsDistance(lat, lon, w.lat, w.lon);
      if (!best || d < best.d) best = { w: w, d: d };
    });
    return best;
  }

  function waypointPopup(w) {
    var date = w.images[0] ? w.images[0].date.slice(0, 10) : "";
    // Every value from the data files is escaped (esc) before it goes into HTML
    var html = "<div><b>" + esc(T("wpStop")) + " #" + esc(w.id) + "</b> · " + iso("sol " + w.sol) + " (" + iso(date) + ")<br>" +
      iso(w.lat.toFixed(4) + "°, " + w.lon.toFixed(4) + "°E");
    var local = w.images.find(function (i) { return i.local; });
    // width/height = the photo's real size (Navcam 1024×1024), so the popup knows its height before the photo loads
    if (local) html += '<img src="' + esc(local.local) + '" width="1024" height="1024" alt="' +
      esc("Curiosity " + local.camera + " image, sol " + w.sol) + '">' +
      "<small>" + esc(local.camera + " · " + local.credit) + ' · <a href="' + esc(local.url) + '" target="_blank" rel="noopener">' +
      esc(T("wpOriginal")) + "</a></small>";
    w.images.filter(function (i) { return !i.local; }).forEach(function (i) {
      html += '<br><small><a href="' + esc(i.url) + '" target="_blank" rel="noopener">' + esc(i.camera + " — " + T("wpOnline")) + "</a></small>";
    });
    html += "<p><b>" + esc(T("wpLook")) + ":</b> " + esc(T("wpText")) + "</p></div>";
    return html;
  }

  // "1 h 38 min" in English, "1 س 38 د" in Arabic (units come from i18n.js)
  function fmtHours(h) {
    var m = Math.round(h * 60), mins = m % 60;
    return Math.floor(m / 60) + " " + T("unitH") + (mins ? " " + String(mins).padStart(2, "0") + " " + T("unitMin") : "");
  }

  // Safe text for innerHTML
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  // A number with a Latin unit ("2.73 km", "61%", "-71 … -5 °C") wrapped in <bdi>, so right-to-left Arabic text
  // around it cannot scramble its order (bdi = "bidirectional isolate").
  function iso(s) { return '<bdi dir="ltr">' + esc(s) + "</bdi>"; }
  function timeHtml(h) {
    var m = Math.round(h * 60), mins = m % 60;
    // Isolate each number/unit pair, then keep hours before minutes even with Arabic unit letters.
    return '<bdi dir="ltr">' + iso(Math.floor(m / 60) + " " + T("unitH")) +
      (mins ? " " + iso(String(mins).padStart(2, "0") + " " + T("unitMin")) : "") + "</bdi>";
  }
  // Translate a word from the data (e.g. REMS "Sunny") if i18n.js knows it, otherwise keep it as it is
  function tr(prefix, word) { var k = prefix + word, t = T(k); return t === k ? word : t; }

  function renderRouteCard() {
    var s = Darb.stats; if (!s) return;
    var rad = Darb.env.rad.surfaceDoseEquivalent_mSv_per_day;
    $("routeCard").classList.remove("hidden");
    $("safety").className = "safety " + s.safety;
    $("safety").textContent = T(s.safety);
    $("reasons").textContent = s.reasons.map(function (r) { return T("why." + r); }).join(" · ");
    $("stDist").innerHTML = iso((s.distanceM / 1000).toFixed(2) + " km");
    $("stTime").innerHTML = timeHtml(s.hoursOut);
    $("stRound").innerHTML = timeHtml(s.hoursRoundTrip);
    $("stO2").innerHTML = T("o2Of").replace("{p}", iso(Math.round(s.o2ReservePct) + "%"))
      .replace("{h}", timeHtml(DARB_CONFIG.routeOptions.evaBudgetHours));
    $("stGain").innerHTML = iso("+" + Math.round(s.elevationGainM) + " m") + " / " + iso("−" + Math.round(s.elevationLossM) + " m");
    $("stSlope").innerHTML = iso(s.maxSlope.toFixed(1) + "°") + " (" + T("meanWord") + " " + iso(s.meanSlope.toFixed(1) + "°") + ")";
    $("stSand").innerHTML = iso(Math.round(s.sandFraction * 100) + "%");
    $("stRough").innerHTML = iso(Math.round((s.roughFraction || 0) * 100) + "%");
    $("stDose").innerHTML = iso((rad * s.hoursRoundTrip / 24).toFixed(3) + " mSv");
  }

  // ------------------------------------------------ performance budget lines
  // The app shows its own live timings against the budgets we committed to
  // (A* planning < 50 ms, layer toggle < 200 ms on a normal laptop)
  function renderPerfPlan(ms) {
    var el = $("perfPlan");
    el.classList.remove("hidden");
    el.textContent = T(ms < 50 ? "perfPlanOk" : "perfPlanOver").replace("{ms}", ms.toFixed(1));
  }

  function renderPerfLayer() {
    var el = $("perfLayer"), p = Darb.perf.lastLayer;
    if (!p) { el.classList.add("hidden"); return; }
    el.classList.remove("hidden");
    var name = T("layer" + p.key.charAt(0).toUpperCase() + p.key.slice(1));
    el.textContent = T(p.ms < 200 ? "perfLayerOk" : "perfLayerOver")
      .replace("{ms}", p.ms.toFixed(1)).replace("{layer}", name);
  }

  // ------------------------------------------------ export & share
  // Draw the current route on a canvas ourselves (no screenshot library) and save it as a PNG
  function exportRouteImage() {
    if (!Darb.route || !Darb.stats) { $("routeMsg").textContent = T("needRoute"); return; }
    var s = Darb.stats, W = 1400, H = 900;
    var cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    var ctx = cv.getContext("2d");
    var font = "'Segoe UI', Tahoma, Arial, sans-serif";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#1a110b"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#f5e9d8"; ctx.font = "700 40px " + font;
    ctx.fillText("DARB — Marswalk Planner", 40, 24);
    ctx.font = "17px " + font; ctx.fillStyle = "#c9b7a0";
    ctx.fillText(new Date().toISOString().slice(0, 16).replace("T", " UTC") + "  ·  Mount Sharp, Gale Crater  ·  NASA Space Apps 2026", 40, 78);
    // Map area: equirectangular, centred on our data box with 12% padding
    var mx = 40, my = 120, mw = 820, mh = 700;
    ctx.fillStyle = "#120c08"; ctx.fillRect(mx, my, mw, mh);
    var b = Darb.grid.bounds;
    var wLat = b.north - b.south, wLon = (b.east - b.west) * Math.cos((b.north + b.south) / 2 * Math.PI / 180);
    var pad = 0.12, latMin = b.south - wLat * pad, latMax = b.north + wLat * pad;
    var lonMin = b.west - wLon * pad, lonMax = b.east + wLon * pad;
    var cosc = Math.cos((latMin + latMax) / 2 * Math.PI / 180);
    var k = Math.min(mw / ((lonMax - lonMin) * cosc), mh / (latMax - latMin));
    var ox = (mw - (lonMax - lonMin) * cosc * k) / 2, oy = (mh - (latMax - latMin) * k) / 2;
    function P(lat, lon) { return [mx + ox + (lon - lonMin) * cosc * k, my + oy + (latMax - lat) * k]; }
    // Dashed box = area with grid data
    var q1 = P(b.south, b.west), q2 = P(b.north, b.east);
    ctx.strokeStyle = "#8fd3ff"; ctx.lineWidth = 1; ctx.setLineDash([6, 6]);
    ctx.strokeRect(q1[0], q1[1], q2[0] - q1[0], q2[1] - q1[1]); ctx.setLineDash([]);
    // Curiosity traverse + stops
    ctx.strokeStyle = "#8a94a6"; ctx.lineWidth = 1.5;
    ctx.beginPath(); Darb.wp.traverse.forEach(function (p, i) { var q = P(p[0], p[1]); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.stroke();
    ctx.fillStyle = "#ffd23f";
    Darb.wp.waypoints.forEach(function (w) { var q = P(w.lat, w.lon); ctx.beginPath(); ctx.arc(q[0], q[1], 4, 0, 7); ctx.fill(); });
    // The route
    var pts = routeLatLngs(), colors = { safe: "#3ddc84", caution: "#ffd23f", danger: "#ff4d4d" };
    [10, 5, 2].forEach(function (lw, i) {
      ctx.strokeStyle = i === 0 ? "#05070f" : (i === 1 ? colors[s.safety] : "#ffffff");
      ctx.lineWidth = lw; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.setLineDash(i === 2 ? [2, 9] : []);
      ctx.beginPath(); pts.forEach(function (p, j) { var q = P(p[0], p[1]); j ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.stroke();
    });
    ctx.setLineDash([]);
    [[Darb.start, "#3ddc84", "START"], [Darb.goal, "#8fd3ff", "GOAL"]].forEach(function (pg) {
      var q = P(pg[0].lat, pg[0].lng);
      ctx.fillStyle = pg[1]; ctx.beginPath(); ctx.arc(q[0], q[1], 8, 0, 7); ctx.fill();
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2; ctx.stroke();
      ctx.font = "700 14px " + font; ctx.fillStyle = "#ffffff"; ctx.fillText(pg[2], q[0] + 12, q[1] - 7);
    });
    ctx.font = "13px " + font; ctx.fillStyle = "#8a94a6";
    ctx.fillText("Data box (dashed): USGS HiRISE DEM · Curiosity stops: NASA MMGIS · Route: DARB A*", mx + 8, my + mh - 22);
    // Stats panel
    var px0 = 900, y = 120, px1 = 1360;
    ctx.fillStyle = "#241a12"; ctx.fillRect(px0 - 12, 108, px1 - px0 + 24, 724);
    ctx.fillStyle = "#f5e9d8"; ctx.font = "700 24px " + font; ctx.fillText(T("routeTitle"), px0, y); y += 40;
    ctx.fillStyle = colors[s.safety]; ctx.font = "700 26px " + font; ctx.fillText(T(s.safety), px0, y); y += 34;
    ctx.fillStyle = "#c9b7a0"; ctx.font = "15px " + font;
    var reasons = s.reasons.map(function (r) { return T("why." + r); });
    reasons.forEach(function (r) {
      var words = r.split(" "), line = "";
      words.forEach(function (w) {
        if (line && ctx.measureText(line + " " + w).width > px1 - px0 - 10) { ctx.fillText(line, px0, y); y += 19; line = w; }
        else line = line ? line + " " + w : w;
      });
      if (line) { ctx.fillText(line, px0, y); y += 19; }
    });
    y += 10;
    var rad = Darb.env.rad.surfaceDoseEquivalent_mSv_per_day;
    var rows = [
      [T("distance"), (s.distanceM / 1000).toFixed(2) + " km"],
      [T("timeOut"), fmtHours(s.hoursOut)],
      [T("roundTrip"), fmtHours(s.hoursRoundTrip)],
      [T("o2"), T("o2Of").replace("{p}", Math.round(s.o2ReservePct) + "%").replace("{h}", DARB_CONFIG.routeOptions.evaBudgetHours + " h")],
      [T("gain"), "+" + Math.round(s.elevationGainM) + " m / −" + Math.round(s.elevationLossM) + " m"],
      [T("maxSlope"), s.maxSlope.toFixed(1) + "° (mean " + s.meanSlope.toFixed(1) + "°)"],
      [T("sand"), Math.round(s.sandFraction * 100) + "%"], [T("rough"), Math.round((s.roughFraction || 0) * 100) + "%"],
      [T("dose"), (rad * s.hoursRoundTrip / 24).toFixed(3) + " mSv"]
    ];
    rows.forEach(function (row) {
      ctx.font = "15px " + font; ctx.fillStyle = "#c9b7a0"; ctx.fillText(row[0], px0, y);
      ctx.font = "700 15px " + font; ctx.fillStyle = "#f5e9d8"; ctx.fillText(row[1], px1 - ctx.measureText(row[1]).width, y);
      y += 30;
    });
    y += 6;
    ctx.font = "13px " + font; ctx.fillStyle = "#8a94a6";
    var note = T("sampleNote");
    note.split(" ").reduce(function (out, w) {
      if (out && ctx.measureText(out + " " + w).width > px1 - px0 - 10) { ctx.fillText(out, px0, y); y += 18; return w; }
      return out ? out + " " + w : w;
    }, "");
    ctx.fillText("darb · Space Apps 2026", px0, 812);
    // Save as PNG
    var name = "darb-route-" + new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19) + ".png";
    cv.toBlob(function (blob) {
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
      $("routeMsg").textContent = T("exportSaved");
    }, "image/png");
  }

  // A short link that re-plans the same route when opened: #s=lat,lon&g=lat,lon
  function shareUrl() {
    return location.origin + location.pathname + "#s=" + Darb.start.lat.toFixed(5) + "," + Darb.start.lng.toFixed(5) +
      "&g=" + Darb.goal.lat.toFixed(5) + "," + Darb.goal.lng.toFixed(5);
  }
  function copyShareLink() {
    if (!Darb.start || !Darb.goal) { $("routeMsg").textContent = T("needRoute"); return; }
    var url = shareUrl();
    function done() { $("routeMsg").textContent = T("shareCopied"); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, done);
    else {
      var t = document.createElement("textarea"); t.value = url; t.style.position = "fixed"; t.style.opacity = "0";
      document.body.appendChild(t); t.select();
      try { document.execCommand("copy"); } catch (e) { /* clipboard refused; message below says so */ }
      t.remove(); done();
    }
  }
  // On startup: a share link auto-plans the shared route
  function applyShareLink() {
    var m = /#s=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)&g=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(location.hash);
    if (!m) return;
    setPoint("start", L.latLng(parseFloat(m[1]), parseFloat(m[2])));
    setPoint("goal", L.latLng(parseFloat(m[3]), parseFloat(m[4])));
    planRoute().then(function () {
      if (Darb.start && Darb.goal) Darb.map.fitBounds(L.latLngBounds([Darb.start, Darb.goal]).pad(0.6));
    });
  }

  // ------------------------------------------------ save & compare two routes (A / B)
  // A snapshot keeps a copy of the route's cells + stats + endpoints as plain numbers,
  // so later re-planning never changes what is saved.
  var SAVED_COLORS = { A: "#59b7ff", B: "#ff9a3d" };
  var SAFETY_RANK = { safe: 0, caution: 1, danger: 2 };

  function savedLatLngs(slot) {
    var s = Darb.saved[slot];
    if (!s) return null;
    var pts = s.cells.map(function (c) { var ll = DarbRoute.cellToLatLon(Darb.grid, c); return [ll.lat, ll.lon]; });
    pts[0] = [s.start.lat, s.start.lng];                 // start/end exactly at the saved points
    pts[pts.length - 1] = [s.goal.lat, s.goal.lng];
    return pts;
  }

  function drawSavedRoute(slot) {
    if (Darb.savedLayers[slot]) Darb.map.removeLayer(Darb.savedLayers[slot]);
    Darb.savedLayers[slot] = L.polyline(savedLatLngs(slot), {
      pane: "routePane", color: SAVED_COLORS[slot], weight: 5, opacity: 0.95,
      dashArray: "10 8", lineCap: "round", lineJoin: "round"
    }).addTo(Darb.map);
  }

  function saveRoute(slot) {
    if (!Darb.route || !Darb.stats) { $("routeMsg").textContent = T("needRoute"); return; }
    Darb.saved[slot] = {
      cells: Darb.route.map(function (c) { return { r: c.r, c: c.c }; }),
      stats: Object.assign({}, Darb.stats, { reasons: Darb.stats.reasons.slice() }),
      start: { lat: Darb.start.lat, lng: Darb.start.lng },
      goal: { lat: Darb.goal.lat, lng: Darb.goal.lng }
    };
    drawSavedRoute(slot);
    renderCompare();
    $("routeMsg").textContent = T("cmpSaved").replace("{slot}", slot);
  }

  function clearSavedRoute(slot) {
    Darb.saved[slot] = null;
    if (Darb.savedLayers[slot]) { Darb.map.removeLayer(Darb.savedLayers[slot]); Darb.savedLayers[slot] = null; }
    renderCompare();
  }

  function slotLabel(slot) { return iso(T(slot === "A" ? "routeA" : "routeB")); }
  function doseOf(s) {
    return (Darb.env.rad.surfaceDoseEquivalent_mSv_per_day * s.hoursRoundTrip / 24).toFixed(3) + " mSv";
  }

  // One table row; a cell gets ".better" (green) when it is the clearly better value
  function cmpRow(label, aHtml, bHtml, aWins, bWins) {
    return "<tr><th>" + esc(label) + "</th>" +
      "<td" + (aWins ? ' class="better"' : "") + ">" + aHtml + "</td>" +
      "<td" + (bWins ? ' class="better"' : "") + ">" + bHtml + "</td></tr>";
  }

  function cmpRowX(aHas, bHas) {
    return "<tr><th></th>" +
      (aHas ? "<th class='cmp-slot'><span class='cmp-dot' style='background:" + SAVED_COLORS.A + "'></span>" + esc(T("routeA")) +
        "<button class='cmp-x' data-slot='A' aria-label='" + esc(T("cmpClear") + " A") + "'>×</button></th>"
           : "<th class='cmp-slot'></th>") +
      (bHas ? "<th class='cmp-slot'><span class='cmp-dot' style='background:" + SAVED_COLORS.B + "'></span>" + esc(T("routeB")) +
        "<button class='cmp-x' data-slot='B' aria-label='" + esc(T("cmpClear") + " B") + "'>×</button></th>"
           : "<th class='cmp-slot'></th>") +
      "</tr>";
  }

  function compareTable(a, b) {
    var both = !!(a && b);
    var A = a ? a.stats : null, B = b ? b.stats : null;
    var dash = "—";
    function lower(av, bv) { if (!both || av === bv) return [false, false]; return av < bv ? [true, false] : [false, true]; }
    var rS, rD, rO, rR, rM, rF, rG, rV;
    if (both) {
      rS = lower(SAFETY_RANK[A.safety], SAFETY_RANK[B.safety]);
      rD = lower(A.distanceM, B.distanceM);
      rO = lower(A.hoursOut, B.hoursOut);
      rR = lower(A.hoursRoundTrip, B.hoursRoundTrip);
      rM = lower(A.maxSlope, B.maxSlope);
      rF = lower(A.sandFraction, B.sandFraction);
      rG = lower(A.roughFraction || 0, B.roughFraction || 0);
      rV = lower(doseOf(A), doseOf(B));
    } else { rS = rD = rO = rR = rM = rF = rG = rV = [false, false]; }
    // (dose compared as strings is fine: all values have the same "###.### mSv" shape when equal precision)
    return "<table class='cmp-table'>" + cmpRowX(!!a, !!b) +
      cmpRow(T("safetyWord"), a ? esc(T(A.safety)) : dash, b ? esc(T(B.safety)) : dash, rS[0], rS[1]) +
      cmpRow(T("distance"), a ? iso((A.distanceM / 1000).toFixed(2) + " km") : dash, b ? iso((B.distanceM / 1000).toFixed(2) + " km") : dash, rD[0], rD[1]) +
      cmpRow(T("timeOut"), a ? timeHtml(A.hoursOut) : dash, b ? timeHtml(B.hoursOut) : dash, rO[0], rO[1]) +
      cmpRow(T("roundTrip"), a ? timeHtml(A.hoursRoundTrip) : dash, b ? timeHtml(B.hoursRoundTrip) : dash, rR[0], rR[1]) +
      cmpRow(T("maxSlope"), a ? iso(A.maxSlope.toFixed(1) + "°") : dash, b ? iso(B.maxSlope.toFixed(1) + "°") : dash, rM[0], rM[1]) +
      cmpRow(T("sand"), a ? iso(Math.round(A.sandFraction * 100) + "%") : dash, b ? iso(Math.round(B.sandFraction * 100) + "%") : dash, rF[0], rF[1]) +
      cmpRow(T("rough"), a ? iso(Math.round((A.roughFraction || 0) * 100) + "%") : dash, b ? iso(Math.round((B.roughFraction || 0) * 100) + "%") : dash, rG[0], rG[1]) +
      cmpRow(T("dose"), a ? iso(doseOf(A)) : dash, b ? iso(doseOf(B)) : dash, rV[0], rV[1]) +
      "</table>";
  }

  function verdict(a, b) {
    var parts = [];
    var rA = SAFETY_RANK[a.stats.safety], rB = SAFETY_RANK[b.stats.safety];
    if (rA !== rB) parts.push(esc(T("vSafer")).replace("{r}", slotLabel(rA < rB ? "A" : "B")));
    else parts.push(esc(T("vSameSafety")));
    var dDiff = Math.abs(a.stats.distanceM - b.stats.distanceM) / 1000;
    if (dDiff < 0.005) parts.push(esc(T("vSameLength")));
    else parts.push(esc(T("vShorter")).replace("{r}", slotLabel(a.stats.distanceM < b.stats.distanceM ? "A" : "B"))
      .replace("{p}", iso(dDiff.toFixed(2) + " km")));
    var tDiffMin = Math.round(Math.abs(a.stats.hoursRoundTrip - b.stats.hoursRoundTrip) * 60);
    if (tDiffMin < 1) parts.push(esc(T("vSameTime")));
    else parts.push(esc(T("vFaster")).replace("{r}", slotLabel(a.stats.hoursRoundTrip < b.stats.hoursRoundTrip ? "A" : "B"))
      .replace("{t}", timeHtml(tDiffMin / 60)));
    // " · " between the clauses — plain text, safe inside the innerHTML paragraph
    return parts.join(" · ");
  }

  function renderCompare() {
    var a = Darb.saved.A, b = Darb.saved.B;
    var card = $("compareCard"), body = $("cmpBody");
    if (!a && !b) { card.classList.add("hidden"); body.innerHTML = ""; return; }
    card.classList.remove("hidden");
    body.innerHTML = compareTable(a, b) +
      (a && b ? "<p class='cmp-verdict'>" + verdict(a, b) + "</p>"
             : "<p class='cmp-wait'>" + esc(T("cmpWaiting")) + "</p>");
  }

  function demoRoute() {
    clearRoute();
    // START: where Curiosity was around sol 4300 (2024).
    // GOAL: Curiosity stop on sol 4660 (Sept 2025) — inside the boxwork campaign NASA describes (Aug–Sept 2025 images).
    var t = Darb.wp.traverse, s = t[0];
    t.forEach(function (p) { if (Math.abs(p[2] - 4300) < Math.abs(s[2] - 4300)) s = p; });
    var goal = Darb.wp.waypoints.find(function (w) { return w.sol === 4660; }) || Darb.wp.waypoints[Darb.wp.waypoints.length - 1];
    setPoint("start", L.latLng(s[0], s[1]));
    setPoint("goal", L.latLng(goal.lat, goal.lon));
    planRoute();
    Darb.map.fitBounds(L.latLngBounds([Darb.start, Darb.goal]).pad(0.6));
  }

  // Largest difference (m) between our grid elevation and Curiosity's own recorded elevation at its stops.
  // Computed live from the data files, so it stays correct if the data is rebuilt.
  function roverMaxDiff() {
    var max = 0;
    Darb.wp.waypoints.forEach(function (w) {
      var info = cellInfo(w.lat, w.lon);
      if (info) max = Math.max(max, Math.abs(info.elevationM - w.elevM));
    });
    return max;
  }

  // ------------------------------------------------------------------ environment panel
  function buildEnvironment() {
    var s = Darb.env.rems.recentSols[0], r = Darb.env.rad, rows = [
      [T("envSol"), iso(s.sol) + " (" + iso(s.earthDate) + ")"],
      [T("envAir"), iso(s.minAirC + " … " + s.maxAirC + " °C")],
      [T("envGround"), iso(s.minGroundC + " … " + s.maxGroundC + " °C")],
      [T("envPressure"), iso(s.pressurePa + " Pa")],
      [T("envUV"), esc(tr("val.", s.uv))], [T("envSky"), esc(tr("val.", s.opacity))],
      [T("envSun"), iso(s.sunrise + " / " + s.sunset)],
      [T("envRad"), iso(r.surfaceDoseEquivalent_mSv_per_day + " ± " + r.surfaceDoseEquivalent_uncertainty + " mSv") + " " + T("perDay")]
    ];
    $("envStats").innerHTML = rows.map(function (x) { return "<dt>" + esc(x[0]) + "</dt><dd>" + x[1] + "</dd>"; }).join("");
    $("envSource").innerHTML = 'REMS: Centro de Astrobiología / NASA (<a href="' + Darb.env.rems.source + '" target="_blank">feed</a>). ' +
      "RAD: " + r.source + ".";
    // Data check card: how well does our elevation agree with independent measurements?
    var q = $("dataCheck");
    if (q) {
      var maxRover = roverMaxDiff();
      var html = "<li>" + esc(T("checkRover")).replace("{m}", iso(maxRover.toFixed(1) + " m")) + "</li>";
      if (Darb.hrsc) {
        // meanDifferenceM = average of (ours − HRSC): a signed BIAS. medianAbsDifferenceM = typical size of the gap.
        var bias = Darb.hrsc.meanDifferenceM;
        html += "<li>" + esc(T("checkHrsc"))
          .replace("{n}", iso(Darb.hrsc.pixelsCompared.toLocaleString("en")))
          .replace("{bias}", iso((bias >= 0 ? "+" : "") + bias + " m"))
          .replace("{dir}", esc(T(bias >= 0 ? "checkHigher" : "checkLower")))
          .replace("{med}", iso(Darb.hrsc.medianAbsDifferenceM + " m")) + "</li>";
      }
      q.innerHTML = html;
    }
  }

  // ------------------------------------------------------------------ HUD mode + walk simulation
  // Approximate Earth–Mars light time today, from simple circular orbits (good to ~±1 min).
  function earthDelayMinutes(date) {
    var d = (date - Date.UTC(2000, 0, 1, 12)) / 86400000, rad = Math.PI / 180;
    var le = (100.46 + 0.9856474 * d) * rad, lm = (355.43 + 0.5240207 * d) * rad;
    var dist = Math.sqrt(1 + 1.524 * 1.524 - 2 * 1.524 * Math.cos(le - lm));   // AU
    return dist * 8.317;    // 1 AU = 8.317 light-minutes
  }

  function toggleHUD() {
    var on = document.body.classList.toggle("hud-on");
    $("hud").classList.toggle("hidden", !on);
    $("hudBtn").dataset.i18n = on ? "hudExit" : "hudBtn";
    $("hudBtn").textContent = T($("hudBtn").dataset.i18n);
    $("hudDelay").textContent = earthDelayMinutes(Date.now()).toFixed(1) + " min";
    setTimeout(function () { Darb.map.invalidateSize(); }, 50);
    updateHUD(0);
  }

  function bearing(a, b) {   // degrees from north, clockwise
    var y = (b[1] - a[1]) * Math.cos(a[0] * Math.PI / 180), x = b[0] - a[0];
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  // step = index along the route the astronaut has reached
  function updateHUD(step) {
    if (!Darb.route) { $("hudDist").textContent = "—"; $("hudWarn").textContent = T("hudNoRoute"); return; }
    var pts = routeLatLngs(), g = Darb.grid, o = Object.assign({}, DarbRoute.DEFAULTS, DARB_CONFIG.routeOptions);
    step = Math.min(step, pts.length - 1);
    var walked = cumulativeMetres();                           // same method as the route card's distance
    var left = walked[walked.length - 1] - walked[step];
    var done = Darb.stats.hoursOut * (step / (pts.length - 1));
    var o2Left = o.evaBudgetHours - done;
    var c = Darb.route[step], idx = c.r * g.cols + c.c;
    $("hudDist").textContent = (left / 1000).toFixed(2) + " km";
    $("hudO2").innerHTML = timeHtml(o2Left);
    $("hudSlope").textContent = g.slope[idx].toFixed(1) + "°";
    var next = pts[Math.min(step + 3, pts.length - 1)];
    $("compassNeedle").style.transform = "rotate(" + bearing(pts[step], next) + "deg)";
    var warn = "";
    var ahead = Darb.route.slice(step, step + 5).map(function (p) { return p.r * g.cols + p.c; });
    if (ahead.some(function (k) { return g.slope[k] > o.cautionSlope; })) warn = T("hudSteep");
    else if (ahead.some(function (k) { return g.roughness && g.roughness[k] > o.roughHigh; })) warn = T("hudRough");
    else if (ahead.some(function (k) { return g.thermal[k] !== null && g.thermal[k] < o.sandThreshold; })) warn = T("hudSand");
    if (o2Left < Darb.stats.hoursOut + 0.25 * o.evaBudgetHours) warn = T("hudO2Reserve");
    if (step === pts.length - 1) warn = T("hudGoal");
    $("hudWarn").textContent = warn;
  }

  function stopSim() {
    if (Darb.sim) { clearInterval(Darb.sim.timer); if (Darb.sim.marker) Darb.map.removeLayer(Darb.sim.marker); Darb.sim = null; }
  }

  function simulateWalk() {
    stopSim();
    if (!Darb.route) return;
    if (!document.body.classList.contains("hud-on")) toggleHUD();
    var pts = routeLatLngs(), step = 0;
    var marker = L.marker(pts[0], { pane: "pinPane", icon: L.divIcon({ className: "", html: '<div class="pin astro"></div>', iconSize: [14, 14] }) }).addTo(Darb.map);
    Darb.map.setView(pts[0], 14);
    // The whole walk plays in about 20 seconds, however many cells the route has
    var stride = Math.max(1, Math.round(pts.length / 60));
    Darb.sim = { marker: marker, timer: setInterval(function () {
      step = Math.min(step + stride, pts.length - 1);
      marker.setLatLng(pts[step]);
      Darb.map.panTo(pts[step], { animate: true, duration: 0.3 });
      updateHUD(step);
      if (step >= pts.length - 1) clearInterval(Darb.sim.timer);
    }, 330) };
    updateHUD(0);
  }

  // ------------------------------------------------------------------ Ask Darb (grounded context)
  function round(x, n) { return x === null || x === undefined ? null : +x.toFixed(n); }

  // Small local models do best with SHORT, plain-English facts (not big JSON with raw numbers).
  // So we translate each data value into words here, and keep the exact number next to it.
  function level(v) { return v >= 150 ? "strong" : v >= 80 ? "moderate" : v >= 30 ? "weak" : "none"; }

  // What CRISM says at a point, in words. Browse images are contrast-stretched, so this is RELATIVE.
  function mineralWords(lat, lon) {
    var parts = [];
    var phy = crismAt("phy", lat, lon), hyd = crismAt("hyd", lat, lon), maf = crismAt("maf", lat, lon), fem = crismAt("fem", lat, lon);
    if (!phy && !hyd && !maf && !fem) {
      // Say WHY there is no value — never claim "outside coverage" when the images simply haven't loaded
      var ready = ["phy", "hyd", "maf", "fem"].every(function (c) { return typeof Darb.crismPixels[c] === "object"; });
      return ready ? "outside CRISM coverage" : "CRISM data not loaded yet (unknown)";
    }
    function band(obj, i) { return obj ? obj[Object.keys(obj)[i]] : 0; }
    if (phy) parts.push("Fe/Mg clay signal " + level(band(phy, 0)) + ", Al/Si-OH signal " + level(band(phy, 1)));
    if (hyd) parts.push("polyhydrated sulfate signal " + level(Math.min(band(hyd, 0), band(hyd, 2))) +
      ", monohydrated sulfate signal " + level(band(hyd, 1)));
    if (maf) parts.push("olivine " + level(band(maf, 0)) + ", pyroxene " + level(Math.max(band(maf, 1), band(maf, 2))));
    if (fem) parts.push("ferric iron (e.g. hematite) " + level(band(fem, 0)));
    return parts.join("; ");
  }

  function pointLine(label, lat, lon) {
    var info = cellInfo(lat, lon);
    if (!info) return label + ": outside the data area.";
    var t = info.thermalRel, o = DarbRoute.DEFAULTS;          // thresholds come from route.js (one place)
    var ground = t === null ? "unknown" : t < o.sandThreshold ? "probably loose sand/dust" : t > 0.6 ? "rocky / hard ground" : "mixed ground";
    return label + " (" + lat.toFixed(4) + "°, " + lon.toFixed(4) + "°E): elevation " + Math.round(info.elevationM) +
      " m [HiRISE DEM]; slope " + info.slopeDeg.toFixed(1) + "° [HiRISE DEM]; " +
      (info.roughDeg === null ? "" : "metre-scale roughness " + Math.round(info.roughDeg) + "° (" +
        (info.roughDeg > o.roughHigh ? "very rough: rocks or small ridges" : info.roughDeg > o.roughStart ? "rough" : "normal") +
        ") [HiRISE DEM]; ") + ground + " (THEMIS " + (t === null ? "n/a" : t.toFixed(2)) +
      ") [THEMIS]; minerals: " + mineralWords(lat, lon) + " [CRISM].";
  }

  // Where on the route is the steepest cell, and how far along the route (metres from the start)?
  // Metres walked from the start to each cell of the route, measured cell-to-cell exactly like
  // routeStats() in route.js, so the HUD, the AI facts and the route card always agree.
  function cumulativeMetres() {
    var g = Darb.grid, out = [0];
    for (var i = 1; i < Darb.route.length; i++) {
      var dy = (Darb.route[i].r - Darb.route[i - 1].r) * g.cellHeightM, dx = (Darb.route[i].c - Darb.route[i - 1].c) * g.cellWidthM;
      out.push(out[i - 1] + Math.sqrt(dx * dx + dy * dy));
    }
    return out;
  }

  function steepestPoint() {
    var g = Darb.grid, pts = routeLatLngs(), walked = cumulativeMetres(), best = 0;
    Darb.route.forEach(function (c, i) {
      if (g.slope[c.r * g.cols + c.c] > g.slope[Darb.route[best].r * g.cols + Darb.route[best].c]) best = i;
    });
    var cell = Darb.route[best];
    return { slope: g.slope[cell.r * g.cols + cell.c], lat: pts[best][0], lon: pts[best][1], fromStartM: walked[best] };
  }

  function buildContext() {
    var L1 = [], o = DARB_CONFIG.routeOptions, w0 = Darb.env.rems.recentSols[0], rad = Darb.env.rad;
    L1.push("PLACE: Planet MARS. Lower Mount Sharp, Gale Crater (Curiosity rover area). Goal of the EVA: reach the boxwork ridges and collect rock samples.");
    L1.push("RULES OF THIS APP: slope < " + o.safeSlope + "° easy, " + o.safeSlope + "-" + o.cautionSlope + "° caution, " +
      o.cautionSlope + "-" + o.maxSlope + "° danger, > " + o.maxSlope + "° blocked. Suit life support budget " + o.evaBudgetHours +
      " h for the whole EVA (out and back). Slopes come from a 1 m HiRISE elevation model averaged into 25 m cells, so boulders and ridges smaller than 25 m can be missed.");
    L1.push("WEATHER [REMS, sol " + w0.sol + "]: air " + w0.minAirC + " to " + w0.maxAirC + " °C, ground " + w0.minGroundC + " to " +
      w0.maxGroundC + " °C, pressure " + w0.pressurePa + " Pa, UV " + w0.uv + ", sky " + w0.opacity + ".");
    L1.push("RADIATION [RAD]: about " + rad.surfaceDoseEquivalent_mSv_per_day + " mSv per day on the surface.");
    if (Darb.hrsc) L1.push("DATA CHECK: compared with an independent elevation model using ESA Mars Express HRSC data, over " +
      Darb.hrsc.pixelsCompared + " pixels of 200 m, our HiRISE elevation has an average bias of " +
      (Darb.hrsc.meanDifferenceM >= 0 ? "+" : "") + Darb.hrsc.meanDifferenceM + " m (ours slightly " +
      (Darb.hrsc.meanDifferenceM >= 0 ? "higher" : "lower") + ") and a typical (median absolute) difference of " +
      Darb.hrsc.medianAbsDifferenceM + " m [HRSC/ESA].");
    L1.push("DATA CHECK: our elevation is within " + roverMaxDiff().toFixed(1) + " m of Curiosity's own recorded altitude at its " +
      Darb.wp.waypoints.length + " stops in 2025 [HiRISE DEM vs Curiosity].");
    if (Darb.route && Darb.stats) {
      var s = Darb.stats, pts = routeLatLngs();
      L1.push("CURRENT ROUTE: app safety score = " + s.safety.toUpperCase() + (s.reasons.length ? " because " + s.reasons.join(", ") : "") +
        ". Distance ONE WAY (start to goal) " + (s.distanceM / 1000).toFixed(2) + " km; walk out " + fmtHours(s.hoursOut) + "; round trip " + fmtHours(s.hoursRoundTrip) +
        "; O2 reserve after return " + Math.round(s.o2ReservePct) + "%; climb " + Math.round(s.elevationGainM) + " m, descent " +
        Math.round(s.elevationLossM) + " m; max slope " + s.maxSlope.toFixed(1) + "°, mean " + s.meanSlope.toFixed(1) + "°; loose sand on " +
        Math.round(s.sandFraction * 100) + "% of the route; very rough ground (rocks/small ridges) on " +
        Math.round((s.roughFraction || 0) * 100) + "% of the route" + (routeOptions().buddyMeters ? "; buddy mode " + routeOptions().buddyMeters + " m" : "") + ".");
      var st = steepestPoint();
      L1.push("STEEPEST POINT OF THE ROUTE: " + st.slope.toFixed(1) + "° at " + st.lat.toFixed(4) + "°, " + st.lon.toFixed(4) +
        "°E, " + Math.round(st.fromStartM) + " m from the start (of " + Math.round(s.distanceM) + " m) [HiRISE DEM].");
      L1.push(pointLine("ROUTE START", pts[0][0], pts[0][1]));
      var mid = Math.floor(pts.length / 2);
      L1.push(pointLine("ROUTE MIDDLE", pts[mid][0], pts[mid][1]));
      L1.push(pointLine("ROUTE GOAL", pts[pts.length - 1][0], pts[pts.length - 1][1]));
    } else {
      L1.push("CURRENT ROUTE: none planned yet.");
    }
    Darb.wp.waypoints.forEach(function (w) {
      L1.push(pointLine("WAYPOINT " + w.id + " (Curiosity stop, sol " + w.sol + ")", w.lat, w.lon));
    });
    return L1.join("\n");
  }

  function addBubble(kind, text, meta) {
    var div = document.createElement("div");
    div.className = "bubble " + kind;
    div.textContent = text;
    if (meta) { var m = document.createElement("span"); m.className = "meta"; m.textContent = meta; div.appendChild(m); }
    $("chat").appendChild(div);
    $("chat").scrollTop = $("chat").scrollHeight;
    return div;
  }

  async function askQuestion(q) {
    if (!q.trim() || Darb.aiBusy) return;     // one question at a time (no duplicate requests to Ollama)
    Darb.aiBusy = true;
    try { await askQuestionNow(q); } finally { Darb.aiBusy = false; }
  }

  async function askQuestionNow(q) {
    addBubble("user", q);
    if (!AskDarb.state.online) await AskDarb.checkStatus();
    renderAIStatus();
    if (!AskDarb.state.online) {
      addBubble("ai", T("askOffline"));
      // Cached recent answers from this session: useful even without Ollama
      if (Darb.aiHistory.length) {
        var recent = Darb.aiHistory.slice(0, 3).map(function (h) {
          return "“" + h.q + "” — " + (h.text.length > 120 ? h.text.slice(0, 117) + "…" : h.text);
        }).join("\n");
        addBubble("ai", T("askRecent") + "\n" + recent, T("askRecentMeta"));
      }
      return;
    }
    // Attach a rover photo if the question is about a photo/image of a waypoint number
    var image = null, m = q.match(/(?:waypoint|stop|محطة|المحطة)\s*#?\s*(\d+)/i);
    if (m && /photo|image|picture|rock|صورة|صخ/i.test(q)) {
      var w = Darb.wp.waypoints.find(function (x) { return x.id === +m[1]; });
      var loc = w && w.images.find(function (i) { return i.local; });
      if (loc) image = loc.local;
    }
    var bubble = addBubble("ai", T("askThinking")), partial = "";
    bubble.classList.add("thinking");                 // pulsing dot until the model starts answering
    function finishBubble(txt) { bubble.classList.remove("thinking"); bubble.textContent = txt; }
    try {
      var res = await AskDarb.ask(q, buildContext(), image, function (txt) { partial = txt; finishBubble(txt); });
      finishBubble(res.text || "(empty answer)");
      var meta = res.model + " · " + res.seconds.toFixed(1) + " s" +
        (res.firstTokenSeconds ? " (first words " + res.firstTokenSeconds.toFixed(1) + " s)" : "") +
        (res.usedImage ? " · looked at photo" : "") + " · on-device, no internet";
      var ms = document.createElement("span"); ms.className = "meta"; ms.textContent = meta; bubble.appendChild(ms);
      Darb.aiLog.push({ question: q, model: res.model, seconds: +res.seconds.toFixed(2), firstToken: res.firstTokenSeconds, image: res.usedImage });
      console.table(Darb.aiLog);
      // Keep the 5 most recent answers on-device: the offline fallback shows them
      Darb.aiHistory.unshift({ q: q, text: res.text || "…" });
      if (Darb.aiHistory.length > 5) Darb.aiHistory.length = 5;
    } catch (e) {
      // "offline" = Ollama not running; TypeError = the connection broke in the middle of an answer
      var lost = e.message === "offline" || e instanceof TypeError;
      finishBubble((partial ? partial + "\n\n" : "") + (lost ? T("askLost") : T("askError") + " " + e.message));
      AskDarb.markOffline();
    }
  }

  var aiTick = null;
  function renderAIStatus() {
    var st = AskDarb.state;
    if (aiTick) { clearInterval(aiTick); aiTick = null; }
    $("aiDot").className = "dot " + (st.online ? "on" : "off");
    var label = $("aiStatus");
    // Offline + retry scheduled: show a live countdown to the reconnect attempt
    if (!st.online && st.retryAt > 0) {
      aiTick = setInterval(function () {
        var left = Math.max(0, Math.ceil((st.retryAt - Date.now()) / 1000));
        label.dataset.i18n = "askRetrying";
        label.textContent = T("askRetrying").replace("{in}", String(left));
      }, 1000);
      label.dataset.i18n = "askRetrying";
      label.textContent = T("askRetrying").replace("{in}", String(Math.max(0, Math.ceil((st.retryAt - Date.now()) / 1000))));
    } else {
      label.dataset.i18n = st.online ? "askOnline" : "askOffline";
      label.textContent = T(label.dataset.i18n);
    }
    var sel = $("aiModel");
    sel.classList.toggle("hidden", !st.online);
    if (st.online && sel.options.length !== st.models.length) {
      sel.innerHTML = "";
      st.models.forEach(function (m) {
        var o = document.createElement("option"); o.value = m.name; o.textContent = m.name + (m.vision ? " (vision)" : ""); sel.appendChild(o);
      });
    }
    if (st.online) sel.value = st.model;
  }

  function pollAI() {
    // The checker schedules its own reconnect attempts; the UI just listens
    AskDarb.onStatusChange(renderAIStatus);
    AskDarb.checkStatus().then(renderAIStatus);
  }

  // ------------------------------------------------------------------ wiring buttons
  function wireUI() {
    var map = Darb.map;
    function toggleLayer(id, key) {
      $(id).addEventListener("change", function () {
        var t0 = performance.now();
        if (this.checked) Darb.layers[key].addTo(map); else map.removeLayer(Darb.layers[key]);
        Darb.perf.lastLayer = { key: key, ms: performance.now() - t0 };
        renderPerfLayer();
      });
    }
    toggleLayer("lySlope", "slope"); toggleLayer("lyRough", "rough"); toggleLayer("lyThermal", "thermal"); toggleLayer("lyMinerals", "minerals");
    toggleLayer("lyMola", "mola"); toggleLayer("lyRover", "rover");
    $("crismSelect").addEventListener("change", function () {
      var on = map.hasLayer(Darb.layers.minerals);
      if (on) map.removeLayer(Darb.layers.minerals);
      Darb.layers.minerals = makeCrismLayer(this.value);
      if (on || !$("lyMinerals").checked) { $("lyMinerals").checked = true; Darb.layers.minerals.addTo(map); }
      refreshCrismLegend();
    });
    $("opacity").addEventListener("input", function () {
      var v = +this.value;
      Darb.layers.slope.setOpacity(v * 0.8); Darb.layers.rough.setOpacity(v); Darb.layers.minerals.setOpacity(v);
      Darb.layers.thermal.setOpacity(v); Darb.layers.mola.setOpacity(v);
    });
    // One toggle in the layers card: show/hide the citation line under every layer
    $("srcBtn").addEventListener("click", function () {
      var card = this.closest(".card");
      var open = card.classList.toggle("srcs-open");
      this.dataset.i18n = open ? "srcHide" : "srcShow";
      this.textContent = T(open ? "srcHide" : "srcShow");
    });
    $("exportBtn").addEventListener("click", exportRouteImage);
    $("shareBtn").addEventListener("click", copyShareLink);
    $("demoBtn").addEventListener("click", demoRoute);
    $("clearBtn").addEventListener("click", clearRoute);
    $("saveABtn").addEventListener("click", function () { saveRoute("A"); });
    $("saveBBtn").addEventListener("click", function () { saveRoute("B"); });
    $("simBtn").addEventListener("click", simulateWalk);
    // The × buttons inside the comparison table are rebuilt on every render, so delegate:
    $("compareCard").addEventListener("click", function (e) {
      var x = e.target.closest ? e.target.closest(".cmp-x") : null;
      if (x && x.dataset.slot) clearSavedRoute(x.dataset.slot);
    });
    $("hudBtn").addEventListener("click", function () { if (document.body.classList.contains("hud-on")) stopSim(); toggleHUD(); });
    ["buddyOn", "buddyM"].forEach(function (id) {
      $(id).addEventListener("change", function () { if (Darb.start && Darb.goal) planRoute(); });
    });
    $("langBtn").addEventListener("click", function () {
      DarbI18n.lang = DarbI18n.lang === "en" ? "ar" : "en";
      DarbI18n.apply(); buildEnvironment(); renderAIStatus(); refreshCrismOptions(); refreshCrismLegend();
      // re-plan (takes a few ms) so the route message and card are rebuilt in the new language
      if (Darb.start && Darb.goal) planRoute(); else renderRouteCard();
      renderCompare();                                      // comparison card text and verdict follow the language too
      renderPerfLayer();                                    // last layer-timing line follows the language too
      if (window.DarbTour) DarbTour.refresh();          // tour captions follow the language too
    });
    $("aiModel").addEventListener("change", function () { AskDarb.state.model = this.value; });
    // Colour theme: cycles dark → light → high contrast; remembered between visits (accessibility)
    (function () {
      var themes = ["dark", "light", "hc"];
      var keys = { dark: "themeBtn", light: "themeLight", hc: "themeHC" };
      var root = document.documentElement;
      function apply(name) {
        saved = name;
        root.classList.remove("theme-light", "theme-hc");
        if (name === "light") root.classList.add("theme-light");
        if (name === "hc") root.classList.add("theme-hc");
        try { localStorage.setItem("darbTheme", name); } catch (e) {}
        $("themeBtn").textContent = T(keys[name]);
      }
      var saved = "dark";
      try { saved = localStorage.getItem("darbTheme") || "dark"; } catch (e) {}
      if (themes.indexOf(saved) < 0) saved = "dark";
      $("themeBtn").addEventListener("click", function () {
        apply(themes[(themes.indexOf(saved) + 1) % themes.length]);
      });
      Darb.theme = function (name) { if (themes.indexOf(name) >= 0) { saved = name; apply(name); } };
      apply(saved);
    })();
    document.querySelectorAll(".chip").forEach(function (b) {
      b.addEventListener("click", function () { askQuestion(T(b.dataset.q)); });
    });
    $("askForm").addEventListener("submit", function (e) {
      e.preventDefault(); var q = $("askInput").value; $("askInput").value = ""; askQuestion(q);
    });
    preloadCrism();
  }

  // Shared with js/eval.js (the Ask Darb test set) so the tests use exactly the same facts as the app
  Darb.buildContext = buildContext;
  Darb.cellInfo = cellInfo;
  Darb.mineralWords = mineralWords;
  Darb.demoRoute = demoRoute;
  Darb.steepestPoint = steepestPoint;
  Darb.roverMaxDiff = roverMaxDiff;
  // Also used by js/tour.js (the guided demo)
  Darb.clearRoute = clearRoute;
  Darb.saveRoute = saveRoute;
  Darb.clearSavedRoute = clearSavedRoute;
  Darb.renderCompare = renderCompare;
  Darb.askQuestion = askQuestion;
  Darb.setHUD = function (on) {
    var isOn = document.body.classList.contains("hud-on");
    if (!on) stopSim();
    if (on !== isOn) toggleHUD();
  };
  Darb.simulateWalk = simulateWalk;
  Darb.earthDelayMinutes = earthDelayMinutes;

  document.addEventListener("DOMContentLoaded", init);
})();
