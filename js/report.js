// AI-assisted: hand-rolled PDF report builder for Darb ("Download PDF report"), no dependencies.
/*
 * report.js — Darb PDF report (item 17)
 * ----------------------------------------
 * Builds a small A4 PDF by hand (no library): one page with the route image
 * (a JPEG from the export canvas) plus English stats text in built-in Helvetica.
 *
 * The text stays English on purpose: an offline PDF can only use the PDF
 * spec's built-in fonts (no Arabic font can be embedded without a dependency).
 * Everything else in the app remains EN + AR.
 *
 * Works in the browser (window.DarbReport) and in Node.js (require) for unit tests.
 */
(function (root) {
  "use strict";

  var PAGE_W = 595.28, PAGE_H = 841.89;   // A4 portrait, in points
  var MARGIN = 40;

  // ---------- small byte helpers ----------
  function toBytes(s) {                    // ASCII / Latin-1 text -> bytes
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xFF;
    return out;
  }
  function pad10(n) {
    var s = String(n);
    while (s.length < 10) s = "0" + s;
    return s;
  }
  function f2(n) { return (Math.round(n * 100) / 100).toFixed(2); }

  // Escape a string for a PDF literal string (( ) \ must be escaped;
  // anything outside Latin-1 becomes "?" because Helvetica has no glyph for it).
  function escPdf(s) {
    s = s.replace(/[^\u0000-\u00FF]/g, "?");
    return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  }

  // Read width/height from the first SOF (Start Of Frame) marker of a JPEG.
  // Returns { w, h } or null if the bytes do not look like a JPEG.
  function jpegSize(bytes) {
    if (!bytes || bytes.length < 10 || bytes[0] !== 0xFF || bytes[1] !== 0xD8) return null;
    var i = 2;
    while (i + 9 <= bytes.length) {
      if (bytes[i] !== 0xFF) { i += 1; continue; }
      var m = bytes[i + 1];
      if (m === 0xC0 || m === 0xC1 || m === 0xC2 || m === 0xC3) {
        return { w: (bytes[i + 7] << 8) | bytes[i + 8], h: (bytes[i + 5] << 8) | bytes[i + 6] };
      }
      if ((m >= 0xD0 && m <= 0xD7) || m === 0xD8 || m === 0xD9) { i += 2; continue; }   // no length field
      var len = (bytes[i + 2] << 8) | bytes[i + 3];
      i += 2 + len;
    }
    return null;
  }

  // "3.25" -> "3 h 15 min"
  function fmtH(h) {
    h = Math.max(0, h);
    var hh = Math.floor(h);
    var mm = Math.round((h - hh) * 60);
    if (mm >= 60) { hh += 1; mm -= 60; }
    return hh + " h " + (mm < 10 ? "0" + mm : String(mm)) + " min";
  }

  // route.js gives short reason codes; the report spells them out in English.
  var WHY_EN = {
    "slope>10": "some slopes over 10deg",
    "slope>15": "slopes over 15deg",
    "o2-exceeded": "round trip exceeds the O2 budget",
    "o2-reserve<50%": "less than 50% O2 reserve",
    "o2-reserve<25%": "less than 25% O2 reserve",
    "sand>20%": "over 20% loose sand",
    "rough>15%": "over 15% very rough ground"
  };

  // The report's text lines, in order (line 0 is rendered as the title).
  function buildLines(stats, meta) {
    var why = (stats.reasons || []).map(function (r) { return WHY_EN[r] || r; });
    return [
      "DARB - Marswalk Planner: Route Report",
      "Mount Sharp, Gale Crater, Mars - NASA Space Apps 2026",
      "Generated: " + meta.generated + " on this device (no internet needed)",
      "",
      "Start: " + meta.start.lat.toFixed(5) + ", " + meta.start.lng.toFixed(5) +
        "    Goal: " + meta.goal.lat.toFixed(5) + ", " + meta.goal.lng.toFixed(5),
      "Safety: " + stats.safety.toUpperCase() + (why.length ? " - " + why.join("; ") : " - no warnings"),
      "Distance: " + (stats.distanceM / 1000).toFixed(2) + " km",
      "Walk time out: " + fmtH(stats.hoursOut) + "    Round trip: " + fmtH(stats.hoursRoundTrip),
      "O2 reserve: " + Math.round(stats.o2ReservePct) + "% of the " + fmtH(meta.evaHours) + " EVA budget",
      "Max slope: " + stats.maxSlope.toFixed(1) + "deg (mean " + stats.meanSlope.toFixed(1) + "deg)",
      "Elevation: +" + Math.round(stats.elevationGainM) + " m up / -" + Math.round(stats.elevationLossM) + " m down",
      "Loose sand: " + Math.round(stats.sandFraction * 100) + "%    Rough ground: " +
        Math.round((stats.roughFraction || 0) * 100) + "%",
      "Estimated surface dose (round trip): " + meta.doseMsv + " mSv",
      "",
      "Data: slope + roughness from USGS HiRISE Gale DEM 1 m (~25 m grid); loose sand from THEMIS",
      "night-time IR (Mars Trek); rover traverse from NASA MSL MMGIS waypoints.",
      "Assumptions are ours (suited astronaut 0.3-2 km/h, 8 h O2 budget), not official NASA limits - see TEAM-GUIDE.md",
      "Team: Darb - NASA Space Apps 2026"
    ];
  }

  // The page's content stream: draw the image, then one text line per BT/ET block.
  function contentStream(lines, imgW, imgH) {
    var iw = PAGE_W - 2 * MARGIN;
    var ih = iw * imgH / imgW;
    var iy = PAGE_H - MARGIN - ih;
    var x = MARGIN;
    var s = "q " + f2(iw) + " 0 0 " + f2(ih) + " " + f2(x) + " " + f2(iy) + " cm /Im0 Do Q\n";
    var y = iy - 28;
    for (var i = 0; i < lines.length; i++) {
      if (y < 25) break;                              // defensive: never draw off the page
      var size = i === 0 ? 16 : 11;                   // first line = title
      s += "BT /F1 " + size + " Tf " + f2(x) + " " + f2(y) + " Td (" + escPdf(lines[i]) + ") Tj ET\n";
      y -= size + 7;
    }
    return s;
  }

  // Build the whole PDF file.
  //   lines     : array of text strings (English/Latin-1, see header note)
  //   jpeg      : Uint8Array of a real JPEG of the route image
  //   w, h      : that JPEG's width/height in pixels (from jpegSize)
  // Returns a Uint8Array that is a complete PDF 1.4 file.
  function buildPdf(lines, jpeg, w, h) {
    var content = contentStream(lines, w, h);
    var chunks = [];
    var offsets = [0, 0, 0, 0, 0, 0, 0];     // object number -> byte offset
    var pos = 0;
    function text(s) { chunks.push(toBytes(s)); pos += s.length; }
    function bytes(b) { chunks.push(b); pos += b.length; }
    function begin(n) { offsets[n] = pos; }
    function endObj() { text("\nendobj\n"); }

    text("%PDF-1.4\n");

    // 1: catalog, 2: pages, 3: the single page, 4: built-in Helvetica
    begin(1); text("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>"); endObj();
    begin(2); text("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>"); endObj();
    begin(3); text("3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " +
      f2(PAGE_W) + " " + f2(PAGE_H) + "] /Resources << /Font << /F1 4 0 R >> /XObject << /Im0 5 0 R >> >> /Contents 6 0 R >>"); endObj();
    begin(4); text("4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"); endObj();

    // 5: the JPEG as an image XObject (/DCTDecode = "this is a JPEG")
    begin(5); text("5 0 obj\n<< /Type /XObject /Subtype /Image /Width " + w + " /Height " + h +
      " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + jpeg.length + " >>\nstream\n");
    bytes(jpeg);
    text("\nendstream"); endObj();

    // 6: what to draw on the page
    begin(6); text("6 0 obj\n<< /Length " + content.length + " >>\nstream\n");
    text(content);
    text("\nendstream"); endObj();

    // cross-reference table + trailer
    var xrefPos = pos;
    text("xref\n0 7\n0000000000 65535 f \n");
    for (var n = 1; n <= 6; n++) text(pad10(offsets[n]) + " 00000 n \n");
    text("trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n" + xrefPos + "\n%%EOF");

    var total = 0;
    for (var i = 0; i < chunks.length; i++) total += chunks[i].length;
    var out = new Uint8Array(total);
    var o = 0;
    for (var j = 0; j < chunks.length; j++) { out.set(chunks[j], o); o += chunks[j].length; }
    return out;
  }

  // lastBlob: the browser stores the built Blob here so the page (and tests) can inspect it.
  var api = {
    buildPdf: buildPdf,
    buildLines: buildLines,
    jpegSize: jpegSize,
    fmtH: fmtH,
    lastBlob: null
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DarbReport = api;
})(this);
