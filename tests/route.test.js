// Unit tests for js/route.js — run with:  node --test tests
// These tests use small hand-made TEST grids (not Mars data) so we know the right answer.
const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const fs = require("node:fs");
const R = require("../js/route.js");

// Make a flat test grid: rows x cols, every cell 100 m, slope 0, thermal 1 (hard rock)
function flatGrid(rows, cols) {
  const n = rows * cols;
  return {
    rows, cols, cellDeg: 0.001, cellWidthM: 100, cellHeightM: 100,
    bounds: { north: 0, south: -rows * 0.001, west: 0, east: cols * 0.001 },
    elevation: new Array(n).fill(0), slope: new Array(n).fill(0), thermal: new Array(n).fill(1)
  };
}
function block(g, r, c) { g.slope[r * g.cols + c] = 45; }

test("straight route on flat ground", () => {
  const g = flatGrid(5, 10);
  const res = R.findPath(g, { r: 2, c: 0 }, { r: 2, c: 9 });
  assert.ok(res.ok);
  assert.strictEqual(res.path.length, 10);
  const st = R.routeStats(g, res.path);
  assert.ok(Math.abs(st.distanceM - 900) < 1e-6);
  assert.ok(Math.abs(st.hoursOut - 0.45) < 1e-6, "900 m at 2 km/h = 0.45 h");
  assert.strictEqual(st.safety, "safe");
});

test("start = goal gives a clear error", () => {
  const g = flatGrid(3, 3);
  assert.deepStrictEqual(R.findPath(g, { r: 1, c: 1 }, { r: 1, c: 1 }), { ok: false, error: "same-cell" });
});

test("goal inside a blocked (too steep) cell", () => {
  const g = flatGrid(3, 3); block(g, 2, 2);
  assert.strictEqual(R.findPath(g, { r: 0, c: 0 }, { r: 2, c: 2 }).error, "goal-blocked");
});

test("start inside a blocked cell", () => {
  const g = flatGrid(3, 3); block(g, 0, 0);
  assert.strictEqual(R.findPath(g, { r: 0, c: 0 }, { r: 2, c: 2 }).error, "start-blocked");
});

test("no possible route when a wall cuts the map", () => {
  const g = flatGrid(5, 5);
  for (let r = 0; r < 5; r++) block(g, r, 2);
  assert.strictEqual(R.findPath(g, { r: 2, c: 0 }, { r: 2, c: 4 }).error, "no-path");
});

test("click outside the grid", () => {
  const g = flatGrid(3, 3);
  assert.strictEqual(R.findPath(g, { r: -1, c: 0 }, { r: 2, c: 2 }).error, "outside");
});

test("route goes around a wall with a gap", () => {
  const g = flatGrid(5, 5);
  for (let r = 0; r < 4; r++) block(g, r, 2);      // gap at row 4
  const res = R.findPath(g, { r: 0, c: 0 }, { r: 0, c: 4 });
  assert.ok(res.ok);
  assert.ok(res.path.some(p => p.r === 4 && p.c === 2), "must pass through the gap");
  assert.ok(res.path.every(p => !(p.c === 2 && p.r < 4)), "never steps on a blocked cell");
});

test("prefers gentle ground over a steep shortcut", () => {
  const g = flatGrid(3, 7);
  for (let c = 1; c < 6; c++) g.slope[1 * 7 + c] = 18;   // middle row steep but walkable
  const res = R.findPath(g, { r: 1, c: 0 }, { r: 1, c: 6 });
  assert.ok(res.ok);
  assert.ok(res.path.filter(p => p.r === 1).length <= 2, "detours around the steep row");
});

test("sand (low thermal inertia) costs more than rock", () => {
  assert.ok(R.cellCost(0, 0.0) > R.cellCost(0, 1.0));
});

test("safety goes to danger on steep routes", () => {
  const g = flatGrid(1, 3);
  g.slope = [16, 16, 16];
  const st = R.routeStats(g, [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }]);
  assert.strictEqual(st.safety, "danger");
});

test("walking uphill is slower than flat", () => {
  assert.ok(R.walkingSpeedKmh(0.2) < R.walkingSpeedKmh(0));
  assert.ok(Math.abs(R.walkingSpeedKmh(0) - 2) < 1e-9);
});

test("buddy mode needs a wider safe corridor", () => {
  const g = flatGrid(5, 7);
  // a 1-cell-wide gap in a wall: OK alone, too narrow for two people 300 m apart
  for (let r = 0; r < 5; r++) if (r !== 2) block(g, r, 3);
  assert.ok(R.findPath(g, { r: 2, c: 0 }, { r: 2, c: 6 }).ok);
  assert.strictEqual(R.findPath(g, { r: 2, c: 0 }, { r: 2, c: 6 }, { buddyMeters: 300 }).error, "no-path");
});

test("lat/lon <-> cell round trip", () => {
  const g = flatGrid(10, 10);
  const cell = { r: 3, c: 7 };
  const ll = R.cellToLatLon(g, cell);
  assert.deepStrictEqual(R.latLonToCell(g, ll.lat, ll.lon), cell);
});

test("real Mars grid: Curiosity 2025 positions are walkable and connected", () => {
  const grid = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "grid.json")));
  const wp = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "waypoints.json"))).waypoints;
  const a = R.latLonToCell(grid, wp[0].lat, wp[0].lon);
  const b = R.latLonToCell(grid, wp[wp.length - 1].lat, wp[wp.length - 1].lon);
  const t0 = Date.now();
  const res = R.findPath(grid, a, b);
  assert.ok(res.ok, "route found: " + res.error);
  assert.ok(Date.now() - t0 < 1000, "fast enough for a click");
});
