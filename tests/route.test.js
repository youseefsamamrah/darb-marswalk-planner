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

test("fast buddy-mode check matches the slow, obvious method", () => {
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;   // repeatable random numbers
  for (let trial = 0; trial < 5; trial++) {
    const g = flatGrid(30, 40);
    for (let i = 0; i < g.slope.length; i++) if (rand() < 0.05) g.slope[i] = 45;
    const buddy = 250, rad = Math.ceil((buddy / 2) / 100);
    const fast = R.buildCostGrid(g, { buddyMeters: buddy });
    const base = R.buildCostGrid(g);
    for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) {
      let blocked = false;                               // slow way: look at every neighbour
      for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) {
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && cc >= 0 && rr < g.rows && cc < g.cols && base[rr * g.cols + cc] === Infinity) blocked = true;
      }
      assert.strictEqual(fast[r * g.cols + c] === Infinity, blocked);
    }
  }
});

test("snap: a goal on blocked ground moves to the nearest walkable cell", () => {
  const g = flatGrid(5, 5); block(g, 2, 4);
  assert.strictEqual(R.findPath(g, { r: 2, c: 0 }, { r: 2, c: 4 }).error, "goal-blocked");   // no snap = error
  const res = R.findPath(g, { r: 2, c: 0 }, { r: 2, c: 4 }, { snapMeters: 150 });
  assert.ok(res.ok);
  assert.ok(res.snapped.goal && Math.abs(res.snapped.goal.movedM - 100) < 1e-6, "moved one cell (100 m)");
  const last = res.path[res.path.length - 1];
  assert.strictEqual(g.slope[last.r * 5 + last.c], 0, "ends on walkable ground");
});

test("snap: too far from walkable ground still gives an error", () => {
  const g = flatGrid(7, 7);
  for (let r = 2; r <= 6; r++) for (let c = 2; c <= 6; c++) block(g, r, c);
  assert.strictEqual(R.findPath(g, { r: 0, c: 0 }, { r: 6, c: 6 }, { snapMeters: 150 }).error, "goal-blocked");
});

test("rough ground costs more but is not blocked", () => {
  assert.strictEqual(R.cellCost(5, 1, undefined, 20), R.cellCost(5, 1, undefined, null), "normal roughness = no extra cost");
  assert.ok(R.cellCost(5, 1, undefined, 50) > R.cellCost(5, 1, undefined, 20));
  assert.ok(Number.isFinite(R.cellCost(5, 1, undefined, 80)), "very rough is slow, not blocked");
});

test("route avoids a very rough strip when a smooth detour is short", () => {
  const g = flatGrid(3, 7);
  g.roughness = new Array(21).fill(10);
  for (let c = 1; c < 6; c++) g.roughness[1 * 7 + c] = 70;          // rocky middle row
  const res = R.findPath(g, { r: 1, c: 0 }, { r: 1, c: 6 });
  assert.ok(res.path.filter(p => p.r === 1).length <= 2, "walks around the rocks");
  const st = R.routeStats(g, [{ r: 1, c: 0 }, { r: 1, c: 1 }, { r: 1, c: 2 }]);
  assert.strictEqual(st.safety, "caution");
  assert.ok(st.reasons.includes("rough>15%"));
});

test("snap never moves a point further than snapMeters (also diagonally)", () => {
  // Reviewer found a goal moved 180 m with snapMeters 150 (square corners are √2 further).
  const g = flatGrid(9, 9);
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (!(r === 0 && c === 0) && !(r === 8 && c === 8)) block(g, r, c);
  g.slope[2 * 9 + 2] = 0;                                   // only free cell near the centre: diagonal, 2√2·100 ≈ 283 m away
  const near = R.nearestWalkable(g, R.buildCostGrid(g), { r: 4, c: 4 }, 250);
  assert.strictEqual(near, null, "283 m > 250 m: must not snap");
  const ok = R.nearestWalkable(g, R.buildCostGrid(g), { r: 4, c: 4 }, 300);
  assert.ok(ok && ok.movedM <= 300 && ok.r === 2 && ok.c === 2);
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
