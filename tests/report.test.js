// Unit tests for js/report.js — run with:  node --test tests/report.test.js
const { test } = require("node:test");
const assert = require("node:assert");
const Report = require("../js/report.js");

// A minimal JPEG: SOI + APP0 (JFIF) + SOF0 (1x1) + dummy DHT/SOS/scan + EOI.
// The PDF never decodes it — it only needs a valid SOI/SOF structure.
function tinyJpeg() {
  return Uint8Array.from([
    0xFF, 0xD8,                                             // SOI
    0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00,   // APP0 JFIF header
    0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01, 0x00, 0x01,   // SOF0: 1x1, 8-bit, 1 comp
    0x01, 0x01, 0x11, 0x00,
    0xFF, 0xC4, 0x00, 0x01, 0x00,                           // DHT (dummy)
    0xFF, 0xDA, 0x00, 0x04, 0x01, 0x01, 0x00, 0x3F, 0x10,   // SOS + scan start
    0x00, 0x7F,
    0xFF, 0xD9                                              // EOI
  ]);
}

function latin1(buf) { return Buffer.from(buf).toString("latin1"); }

// Parse the xref entry lines ("dddddddddd ggggg n \n") of the first subtable.
function xrefEntries(s) {
  var start = s.indexOf("xref");
  assert.notStrictEqual(start, -1, "file has an xref table");
  var parts = s.slice(start).split("\n");                 // "xref", "0 7", entries, "trailer", ...
  var count = parseInt(parts[1].split(" ")[1], 10);      // subtable size
  var body = parts.slice(2, 2 + count);
  var out = [];
  body.forEach(function (line) {
    // PDF spec: every entry is 18 chars + a 2-char EOL ("\n" written here),
    // so the line ends with a trailing space.
    var m = /^(\d{10}) (\d{5}) ([nf]) $/.exec(line);
    assert(m, "xref entry has the 20-byte format: " + JSON.stringify(line));
    out.push({ off: parseInt(m[1], 10), gen: m[2], type: m[3] });
  });
  return out;
}

test("jpegSize reads width/height from a JPEG's SOF marker", () => {
  assert.deepStrictEqual(Report.jpegSize(tinyJpeg()), { w: 1, h: 1 });
  assert.strictEqual(Report.jpegSize(Uint8Array.from([0x00, 0x01, 0x02, 0x01])), null, "not a JPEG -> null");
  assert.strictEqual(Report.jpegSize(null), null);
});

test("buildPdf returns a structurally valid A4 PDF", () => {
  var jpeg = tinyJpeg();
  var lines = [
    "DARB - Marswalk Planner: Route Report",
    "Mount Sharp, Gale Crater, Mars - NASA Space Apps 2026",
    "Safety: SAFE - no warnings",
    "Team: Darb - NASA Space Apps 2026"
  ];
  var pdf = Report.buildPdf(lines, jpeg, 1, 1);
  assert.ok(pdf instanceof Uint8Array);
  var s = latin1(pdf);

  assert.ok(s.startsWith("%PDF"), "file starts with the %PDF header");
  assert.ok(s.trimEnd().endsWith("%%EOF"), "file ends with %%EOF");
  assert.ok(s.includes("/DCTDecode"), "image XObject uses the JPEG filter");
  assert.ok(s.includes("/Subtype /Image"), "image XObject declared");
  assert.ok(s.includes("/BaseFont /Helvetica"), "built-in Helvetica font");
  assert.ok(s.includes("/MediaBox [0 0 595.28 841.89]"), "A4 page size");
  lines.forEach(function (l) { assert.ok(s.includes(l), "report line present: " + l); });

  // the JPEG bytes are embedded verbatim (SOI ... EOI)
  var at = s.indexOf("\u00ff\u00d8");
  assert.notStrictEqual(at, -1, "JPEG SOI bytes present");
  assert.strictEqual(s.charCodeAt(at + jpeg.length - 2), 0xFF, "JPEG EOI after the image stream");

  // every xref entry points at the real "N 0 obj" header
  var entries = xrefEntries(s);
  assert.strictEqual(entries.length, 7, "7 entries: the free one + six objects");
  assert.strictEqual(entries[0].type, "f", "entry 0 is the free-list head");
  for (var k = 0; k < 6; k++) {
    var n = k + 1;
    assert.strictEqual(entries[k + 1].type, "n");
    assert.strictEqual(entries[k + 1].gen, "00000");
    assert.strictEqual(s.slice(entries[k + 1].off, entries[k + 1].off + String(n).length + 6), n + " 0 obj",
      "xref offset " + n + " points at object " + n);
  }

  // startxref points at the xref table itself
  var m = /startxref\n(\d+)\n%%EOF$/.exec(s.replace(/\s+$/, ""));
  assert.ok(m, "trailer has startxref");
  assert.strictEqual(s.slice(parseInt(m[1], 10), parseInt(m[1], 10) + 4), "xref");

  // the image stream's /Length is exactly the JPEG size
  var im = /\/Length (\d+) >>\nstream\n/.exec(s);
  assert.ok(im, "image /Length declared");
  assert.strictEqual(parseInt(im[1], 10), jpeg.length);
});

test("buildLines writes the stats in plain English", () => {
  var stats = {
    distanceM: 1234, hoursOut: 1.5, hoursRoundTrip: 3, o2ReservePct: 62.5,
    elevationGainM: 20, elevationLossM: 5, maxSlope: 12.3, meanSlope: 4.2,
    sandFraction: 0.08, roughFraction: 0.03, safety: "caution",
    reasons: ["slope>10"]
  };
  var meta = {
    start: { lat: 23.76143, lng: 137.44044 },
    goal: { lat: 24.1, lng: 137.8 },
    evaHours: 8,
    generated: "2026-11-13T12:00:00.000Z",
    doseMsv: "0.031"
  };
  var all = Report.buildLines(stats, meta).join("\n");
  assert.ok(all.startsWith("DARB - Marswalk Planner: Route Report"), "title first");
  assert.ok(all.includes("1.23 km"), "distance in km");
  assert.ok(all.includes("Walk time out: 1 h 30 min"), "fmtH formats walk time");
  assert.ok(all.includes("Round trip: 3 h 00 min"), "round trip formatted");
  assert.ok(all.includes("CAUTION"), "safety level upper-cased");
  assert.ok(all.includes("some slopes over 10deg"), "reason codes spelled out");
  assert.ok(all.includes("63% of the 8 h 00 min EVA budget"), "O2 reserve line");
  assert.ok(all.includes("23.76143, 137.44044"), "start coordinates");
  assert.ok(all.endsWith("Team: Darb - NASA Space Apps 2026"), "team line last");
});

test("fmtH rounds minutes correctly", () => {
  assert.strictEqual(Report.fmtH(0), "0 h 00 min");
  assert.strictEqual(Report.fmtH(0.99), "0 h 59 min", "0.99 h is 59.4 min, rounds to 59");
  assert.strictEqual(Report.fmtH(0.999), "1 h 00 min", "59.94 min rounds up to the next hour");
  assert.strictEqual(Report.fmtH(2.25), "2 h 15 min");
});
