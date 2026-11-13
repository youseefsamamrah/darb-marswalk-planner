/*
 * AI notice: written with help from an AI coding assistant (Claude Code, Anthropic) and reviewed/tested by the team. See AI-USAGE.md.
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
    costCache: {}, crismPixels: {}, sim: null, aiLog: []
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
    $("routeCard").classList.add("hidden");
    $("routeMsg").textContent = "";
  }

  function routeOptions() {
    var o = Object.assign({}, DARB_CONFIG.routeOptions);
    o.buddyMeters = $("buddyOn").checked ? Math.max(0, +$("buddyM").value || 0) : 0;
    return o;
  }

  function planRoute() {
    var g = Darb.grid, o = routeOptions();
    var key = "b" + o.buddyMeters;               // cost grid is cached per buddy setting
    if (!Darb.costCache[key]) Darb.costCache[key] = DarbRoute.buildCostGrid(g, o);
    o.costGrid = Darb.costCache[key];
    o.snapMeters = 150;          // a point on too-steep ground moves to safe ground up to 150 m away
    var a = DarbRoute.latLonToCell(g, Darb.start.lat, Darb.start.lng);
    var b = DarbRoute.latLonToCell(g, Darb.goal.lat, Darb.goal.lng);
    var t0 = performance.now();
    var res = DarbRoute.findPath(g, a, b, o);
    var ms = performance.now() - t0;
    if (Darb.routeLayer) { Darb.map.removeLayer(Darb.routeLayer); Darb.routeLayer = null; }
    if (!res.ok) {
      Darb.route = Darb.stats = null;
      $("routeCard").classList.add("hidden");
      $("routeMsg").textContent = "⚠ " + T("err." + res.error);
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
    $("routeMsg").innerHTML = esc(T("routeFound")).replace("{algorithm}", iso("A*"))
      .replace("{time}", iso(ms.toFixed(0) + " " + T("unitMs"))).replace("{n}", iso(res.path.length)) + " " + notes.join(" ");
    drawRoute();
    renderRouteCard();
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
    if (!AskDarb.state.online) { addBubble("ai", T("askOffline")); return; }
    // Attach a rover photo if the question is about a photo/image of a waypoint number
    var image = null, m = q.match(/(?:waypoint|stop|محطة|المحطة)\s*#?\s*(\d+)/i);
    if (m && /photo|image|picture|rock|صورة|صخ/i.test(q)) {
      var w = Darb.wp.waypoints.find(function (x) { return x.id === +m[1]; });
      var loc = w && w.images.find(function (i) { return i.local; });
      if (loc) image = loc.local;
    }
    var bubble = addBubble("ai", T("askThinking")), partial = "";
    try {
      var res = await AskDarb.ask(q, buildContext(), image, function (txt) { partial = txt; bubble.textContent = txt; });
      bubble.textContent = res.text || "(empty answer)";
      var meta = res.model + " · " + res.seconds.toFixed(1) + " s" +
        (res.firstTokenSeconds ? " (first words " + res.firstTokenSeconds.toFixed(1) + " s)" : "") +
        (res.usedImage ? " · looked at photo" : "") + " · on-device, no internet";
      var ms = document.createElement("span"); ms.className = "meta"; ms.textContent = meta; bubble.appendChild(ms);
      Darb.aiLog.push({ question: q, model: res.model, seconds: +res.seconds.toFixed(2), firstToken: res.firstTokenSeconds, image: res.usedImage });
      console.table(Darb.aiLog);
    } catch (e) {
      // "offline" = Ollama not running; TypeError = the connection broke in the middle of an answer
      var lost = e.message === "offline" || e instanceof TypeError;
      bubble.textContent = (partial ? partial + "\n\n" : "") + (lost ? T("askLost") : T("askError") + " " + e.message);
      AskDarb.state.online = false; renderAIStatus();
    }
  }

  function renderAIStatus() {
    var st = AskDarb.state;
    $("aiDot").className = "dot " + (st.online ? "on" : "off");
    $("aiStatus").dataset.i18n = st.online ? "askOnline" : "askOffline";
    $("aiStatus").textContent = T($("aiStatus").dataset.i18n);
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
    AskDarb.checkStatus().then(renderAIStatus);
    setInterval(function () { AskDarb.checkStatus().then(renderAIStatus); }, 15000);
  }

  // ------------------------------------------------------------------ wiring buttons
  function wireUI() {
    var map = Darb.map;
    function toggleLayer(id, key) {
      $(id).addEventListener("change", function () {
        if (this.checked) Darb.layers[key].addTo(map); else map.removeLayer(Darb.layers[key]);
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
    $("demoBtn").addEventListener("click", demoRoute);
    $("clearBtn").addEventListener("click", clearRoute);
    $("simBtn").addEventListener("click", simulateWalk);
    $("hudBtn").addEventListener("click", function () { if (document.body.classList.contains("hud-on")) stopSim(); toggleHUD(); });
    ["buddyOn", "buddyM"].forEach(function (id) {
      $(id).addEventListener("change", function () { if (Darb.start && Darb.goal) planRoute(); });
    });
    $("langBtn").addEventListener("click", function () {
      DarbI18n.lang = DarbI18n.lang === "en" ? "ar" : "en";
      DarbI18n.apply(); buildEnvironment(); renderAIStatus(); refreshCrismOptions(); refreshCrismLegend();
      // re-plan (takes a few ms) so the route message and card are rebuilt in the new language
      if (Darb.start && Darb.goal) planRoute(); else renderRouteCard();
      if (window.DarbTour) DarbTour.refresh();          // tour captions follow the language too
    });
    $("aiModel").addEventListener("change", function () { AskDarb.state.model = this.value; });
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
