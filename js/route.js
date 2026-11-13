/*
 * route.js — Darb route planner (Algorithm agent)
 * ------------------------------------------------
 * 1. Turn the data grid (slope + thermal) into a COST for every cell.
 * 2. Use A* ("A-star") to find the cheapest path from START to GOAL.
 * 3. Measure the route: distance, walking time, oxygen budget, safety score.
 *
 * Works in the browser (window.DarbRoute) and in Node.js (require) so we can unit-test it.
 *
 * Data sources for the grid: HiRISE 1 m elevation (USGS Gale DEM, ~25 m cells) + THEMIS night IR (see SOURCES.md).
 * The thresholds below are OUR design assumptions for a suited astronaut,
 * not official NASA limits — they are written in the docs as assumptions.
 */
(function (root) {
  "use strict";

  // ---------- Settings you can tune ----------
  var DEFAULTS = {
    safeSlope: 10,        // degrees: below this walking is easy
    cautionSlope: 15,     // degrees: below this it is hard but OK
    maxSlope: 20,         // degrees: above this the cell is BLOCKED (too steep to walk)
    sandThreshold: 0.25,  // thermal value below this = probably loose sand / dust
    roughStart: 25,       // roughness (degrees over 4 m) above this costs extra; Curiosity's 2025 stops were 10-22
    roughHigh: 40,        // above this = "very rough" (rocks, steps): warned in the route card and HUD
    flatSpeedKmh: 2.0,    // a suited astronaut walks ~2 km/h on flat ground
    minSpeedKmh: 0.3,     // never assume slower than this
    evaBudgetHours: 8.0,  // oxygen / life-support time for one EVA (walk out AND back)
    buddyMeters: 0     // buddy mode: two astronauts side by side need this much safe width (0 = off)
  };

  function withDefaults(opts) {
    var o = {};
    for (var k in DEFAULTS) o[k] = DEFAULTS[k];
    if (opts) for (var j in opts) if (opts[j] !== undefined) o[j] = opts[j];
    return o;
  }

  // ---------- 1. Cost of a single cell ----------
  // Returns Infinity for a blocked cell, otherwise a number >= 1.
  // 1 = perfect flat hard ground. Bigger = more tiring or more risky.
  function cellCost(slope, thermal, o, rough) {
    if (slope === null || slope === undefined || isNaN(slope)) return Infinity;
    if (slope > o.maxSlope) return Infinity;
    var cost = 1;
    // Steeper = more expensive (grows quickly, like a square)
    cost += 1.5 * Math.pow(slope / o.safeSlope, 2);
    // Loose sand (cold at night in THEMIS) = risk of sinking / slipping
    if (thermal !== null && thermal !== undefined && thermal < o.sandThreshold) {
      cost += 2 * (o.sandThreshold - thermal) / o.sandThreshold;
    }
    // Rough ground (metre-scale steps and rocks from the 1 m HiRISE data) = slow and tiring, risk of tripping.
    // Not blocked: inside a 25 m cell there is usually a smoother way around.
    if (rough !== null && rough !== undefined && rough > o.roughStart) {
      cost += (rough - o.roughStart) / 10;
    }
    return cost;
  }

  // Build the cost array for the whole grid (one number per cell).
  function buildCostGrid(grid, opts) {
    var o = withDefaults(opts);
    var n = grid.rows * grid.cols;
    var cost = new Float64Array(n);
    for (var i = 0; i < n; i++) {
      cost[i] = cellCost(grid.slope[i], grid.thermal ? grid.thermal[i] : null, o,
                         grid.roughness ? grid.roughness[i] : null);
    }
    // Buddy mode: two astronauts walk side by side, up to buddyMeters apart.
    // A cell is only usable if every cell within buddyMeters/2 is also walkable.
    if (o.buddyMeters > 0) {
      var rad = Math.ceil((o.buddyMeters / 2) / Math.min(grid.cellWidthM, grid.cellHeightM));
      var near = nearBlocked(cost, grid.rows, grid.cols, rad);
      for (var k = 0; k < n; k++) if (near[k]) cost[k] = Infinity;
    }
    return cost;
  }

  // For every cell: is there a blocked cell within `rad` cells (a square window)?
  // Done in two passes (along rows, then along columns) with running counts ("prefix sums"),
  // so it is fast even for a big window: the time does not depend on `rad`.
  function nearBlocked(cost, R, C, rad) {
    var rowPass = new Uint8Array(R * C), out = new Uint8Array(R * C);
    var sum = new Int32Array(Math.max(R, C) + 1), r, c, lo, hi;
    for (r = 0; r < R; r++) {                       // pass 1: blocked cell within rad along the row?
      for (c = 0; c < C; c++) sum[c + 1] = sum[c] + (cost[r * C + c] === Infinity ? 1 : 0);
      for (c = 0; c < C; c++) {
        lo = Math.max(0, c - rad); hi = Math.min(C - 1, c + rad);
        rowPass[r * C + c] = sum[hi + 1] - sum[lo] > 0 ? 1 : 0;
      }
    }
    for (c = 0; c < C; c++) {                       // pass 2: ...and within rad along the column?
      for (r = 0; r < R; r++) sum[r + 1] = sum[r] + rowPass[r * C + c];
      for (r = 0; r < R; r++) {
        lo = Math.max(0, r - rad); hi = Math.min(R - 1, r + rad);
        out[r * C + c] = sum[hi + 1] - sum[lo] > 0 ? 1 : 0;
      }
    }
    return out;
  }

  // ---------- 2. A* search ----------
  // A tiny "binary heap" priority queue: always gives back the cell with the lowest score.
  function MinHeap() { this.items = []; }
  MinHeap.prototype.push = function (node, score) {
    var a = this.items; a.push([score, node]);
    var i = a.length - 1;
    while (i > 0) {
      var p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      var t = a[p]; a[p] = a[i]; a[i] = t; i = p;
    }
  };
  MinHeap.prototype.pop = function () {
    var a = this.items, top = a[0], last = a.pop();
    if (a.length > 0) {
      a[0] = last;
      var i = 0;
      for (;;) {
        var l = 2 * i + 1, r = l + 1, m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        var t = a[m]; a[m] = a[i]; a[i] = t; i = m;
      }
    }
    return top[1];
  };
  MinHeap.prototype.size = function () { return this.items.length; };

  /**
   * Find the lowest-cost path.
   * start / goal: {r: row, c: col}
   * Returns {ok:true, path:[{r,c},...], cost} or {ok:false, error:"..."}.
   * Errors: "outside", "same-cell", "start-blocked", "goal-blocked", "no-path".
   */
  function findPath(grid, start, goal, opts) {
    var R = grid.rows, C = grid.cols;
    function inside(p) { return p && p.r >= 0 && p.c >= 0 && p.r < R && p.c < C; }
    if (!inside(start) || !inside(goal)) return { ok: false, error: "outside" };
    if (start.r === goal.r && start.c === goal.c) return { ok: false, error: "same-cell" };

    var cost = (opts && opts.costGrid) || buildCostGrid(grid, opts);
    // If a point is on blocked ground, optionally move it to the nearest walkable cell (opts.snapMeters)
    var snapped = { start: null, goal: null };
    var snapM = (opts && opts.snapMeters) || 0;
    if (cost[start.r * C + start.c] === Infinity && snapM) {
      var ns = nearestWalkable(grid, cost, start, snapM);
      if (ns) { snapped.start = ns; start = ns; }
    }
    if (cost[goal.r * C + goal.c] === Infinity && snapM) {
      var ng = nearestWalkable(grid, cost, goal, snapM);
      if (ng) { snapped.goal = ng; goal = ng; }
    }
    var s = start.r * C + start.c, g = goal.r * C + goal.c;
    if (cost[s] === Infinity) return { ok: false, error: "start-blocked" };
    if (cost[g] === Infinity) return { ok: false, error: "goal-blocked" };
    if (s === g) return { ok: false, error: "same-cell" };

    var w = grid.cellWidthM, h = grid.cellHeightM, d = Math.sqrt(w * w + h * h);
    // 8 neighbours: [row step, col step, distance in metres]
    var steps = [[-1, 0, h], [1, 0, h], [0, -1, w], [0, 1, w],
                 [-1, -1, d], [-1, 1, d], [1, -1, d], [1, 1, d]];

    // Heuristic = straight-line distance × cheapest possible cost (1). Never overestimates,
    // so A* is guaranteed to find the true lowest-cost path.
    function heuristic(i) {
      var dr = (Math.floor(i / C) - goal.r) * h, dc = (i % C - goal.c) * w;
      return Math.sqrt(dr * dr + dc * dc);
    }

    var gScore = new Float64Array(R * C).fill(Infinity);
    var cameFrom = new Int32Array(R * C).fill(-1);
    var closed = new Uint8Array(R * C);
    var open = new MinHeap();
    gScore[s] = 0;
    open.push(s, heuristic(s));

    while (open.size() > 0) {
      var cur = open.pop();
      if (closed[cur]) continue;          // already handled with a better score
      if (cur === g) break;               // reached the goal!
      closed[cur] = 1;
      var cr = Math.floor(cur / C), cc = cur % C;
      for (var k = 0; k < 8; k++) {
        var nr = cr + steps[k][0], nc = cc + steps[k][1];
        if (nr < 0 || nc < 0 || nr >= R || nc >= C) continue;
        var nb = nr * C + nc;
        if (closed[nb] || cost[nb] === Infinity) continue;
        // Moving costs: distance × average cost of the two cells
        var tentative = gScore[cur] + steps[k][2] * (cost[cur] + cost[nb]) / 2;
        if (tentative < gScore[nb]) {
          gScore[nb] = tentative;
          cameFrom[nb] = cur;
          open.push(nb, tentative + heuristic(nb));
        }
      }
    }

    if (gScore[g] === Infinity) return { ok: false, error: "no-path" };
    // Walk backwards from goal to start to read the path
    var path = [];
    for (var at = g; at !== -1; at = cameFrom[at]) path.push({ r: Math.floor(at / C), c: at % C });
    path.reverse();
    return { ok: true, path: path, cost: gScore[g], snapped: snapped };
  }

  // Closest walkable cell within maxMeters of `cell` (a real distance, so the promise "within 150 m" holds
  // even diagonally), or null if there is none. We check growing square "rings" around the cell.
  function nearestWalkable(grid, cost, cell, maxMeters) {
    var best = null, bestD = Infinity, w = grid.cellWidthM, h = grid.cellHeightM;
    var maxCells = Math.ceil(maxMeters / Math.min(w, h));
    for (var k = 1; k <= maxCells; k++) {
      for (var dr = -k; dr <= k; dr++) {
        for (var dc = -k; dc <= k; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== k) continue;   // only the ring, not the inside
          var r = cell.r + dr, c = cell.c + dc;
          if (r < 0 || c < 0 || r >= grid.rows || c >= grid.cols) continue;
          if (cost[r * grid.cols + c] === Infinity) continue;
          var d = Math.sqrt(dr * dr * h * h + dc * dc * w * w);
          if (d > maxMeters) continue;                        // too far: corners of the square are further away
          if (d < bestD) { bestD = d; best = { r: r, c: c, movedM: d }; }
        }
      }
      // every cell in the NEXT ring is at least (k+1)*min(w,h) away, so if we already have one closer, stop
      if (best && bestD <= (k + 1) * Math.min(w, h)) break;
    }
    return best;
  }

  // ---------- 3. Walking speed & route statistics ----------
  // Speed depends on the grade (rise / run) of each step. Based on Tobler's hiking
  // function, scaled so flat ground = flatSpeedKmh. Downhill a little is fastest.
  function walkingSpeedKmh(grade, o) {
    var v = o.flatSpeedKmh * Math.exp(-3.5 * Math.abs(grade + 0.05)) / Math.exp(-3.5 * 0.05);
    return Math.max(o.minSpeedKmh, Math.min(v, o.flatSpeedKmh * 1.2));
  }

  function routeStats(grid, path, opts) {
    var o = withDefaults(opts);
    var C = grid.cols;
    var dist = 0, hoursOut = 0, hoursBack = 0, gain = 0, loss = 0;
    var maxSlope = 0, sandCells = 0, slopeSum = 0, roughCells = 0;
    for (var i = 0; i < path.length; i++) {
      var idx = path[i].r * C + path[i].c;
      var sl = grid.slope[idx];
      if (grid.roughness && grid.roughness[idx] !== null && grid.roughness[idx] > o.roughHigh) roughCells++;
      slopeSum += sl;
      if (sl > maxSlope) maxSlope = sl;
      if (grid.thermal && grid.thermal[idx] !== null && grid.thermal[idx] < o.sandThreshold) sandCells++;
      if (i === 0) continue;
      var prev = path[i - 1], pIdx = prev.r * C + prev.c;
      var dy = (path[i].r - prev.r) * grid.cellHeightM, dx = (path[i].c - prev.c) * grid.cellWidthM;
      var run = Math.sqrt(dx * dx + dy * dy);
      if (run === 0) continue;               // same cell twice: no distance, avoid dividing by 0
      var dz = grid.elevation[idx] - grid.elevation[pIdx];
      dist += run;
      if (dz > 0) gain += dz; else loss -= dz;
      hoursOut += (run / 1000) / walkingSpeedKmh(dz / run, o);
      hoursBack += (run / 1000) / walkingSpeedKmh(-dz / run, o);   // same step, walked the other way
    }
    var roundTrip = hoursOut + hoursBack;
    var sandFraction = path.length ? sandCells / path.length : 0;

    // Safety score (our rules, explained in TEAM-GUIDE.md)
    var reasons = [], level = "safe";
    function raise(to, why) {
      var rank = { safe: 0, caution: 1, danger: 2 };
      if (rank[to] > rank[level]) level = to;
      reasons.push(why);
    }
    if (maxSlope > o.cautionSlope) raise("danger", "slope>" + o.cautionSlope);
    else if (maxSlope > o.safeSlope) raise("caution", "slope>" + o.safeSlope);
    if (roundTrip > o.evaBudgetHours) raise("danger", "o2-exceeded");
    else if (roundTrip > 0.75 * o.evaBudgetHours) raise("danger", "o2-reserve<25%");
    else if (roundTrip > 0.5 * o.evaBudgetHours) raise("caution", "o2-reserve<50%");
    if (sandFraction > 0.2) raise("caution", "sand>20%");
    var roughFraction = path.length ? roughCells / path.length : 0;
    if (roughFraction > 0.15) raise("caution", "rough>15%");

    return {
      distanceM: dist,
      hoursOut: hoursOut,
      hoursRoundTrip: roundTrip,
      o2ReservePct: Math.max(0, 100 * (1 - roundTrip / o.evaBudgetHours)),
      elevationGainM: gain,
      elevationLossM: loss,
      maxSlope: maxSlope,
      meanSlope: path.length ? slopeSum / path.length : 0,
      sandFraction: sandFraction,
      roughFraction: roughFraction,
      safety: level,          // "safe" | "caution" | "danger"
      reasons: reasons
    };
  }

  // ---------- Helpers: convert between map coordinates and grid cells ----------
  function latLonToCell(grid, lat, lon) {
    var b = grid.bounds;
    return { r: Math.floor((b.north - lat) / grid.cellDeg), c: Math.floor((lon - b.west) / grid.cellDeg) };
  }
  function cellToLatLon(grid, cell) {
    var b = grid.bounds;
    return { lat: b.north - (cell.r + 0.5) * grid.cellDeg, lon: b.west + (cell.c + 0.5) * grid.cellDeg };
  }

  var api = {
    DEFAULTS: DEFAULTS,
    cellCost: function (s, t, opts, rough) { return cellCost(s, t, withDefaults(opts), rough); },
    buildCostGrid: buildCostGrid,
    findPath: findPath,
    routeStats: routeStats,
    walkingSpeedKmh: function (grade, opts) { return walkingSpeedKmh(grade, withDefaults(opts)); },
    nearestWalkable: nearestWalkable,
    latLonToCell: latLonToCell,
    cellToLatLon: cellToLatLon
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DarbRoute = api;
})(this);
