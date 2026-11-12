# Local agent: review of `js/route.js`

Model: `gpt-oss:20b` · 101.8 s · **DRAFT — checked by the Lead before use**

**1. `routeStats` does not guard against missing or `null` grid data**  
- The function assumes `grid.elevation`, `grid.slope`, `grid.thermal`, `grid.cellWidthM`, and `grid.cellHeightM` are all defined and contain numbers.  
- If any of these are `undefined` or contain `null`, operations such as `grid.elevation[idx] - grid.elevation[pIdx]`, `grid.slope[idx]`, or `grid.cellWidthM` produce `NaN`.  
- `NaN` propagates through the whole calculation, yielding `NaN` for distance, time, elevation gain/loss, mean slope, and even the safety score.  
- **Fix**: Add defensive checks (`if (!grid.elevation) …`, `if (grid.slope[idx] == null) continue;`, etc.) and fall back to sensible defaults (e.g., treat missing elevation as 0, missing slope as 0, missing thermal as a safe value).

---

**2. `routeStats` accumulates `NaN` when a cell’s slope is `null`**  
- `slopeSum += sl;` will set `slopeSum` to `NaN` if `sl` is `null`.  
- Consequently `meanSlope` becomes `NaN` even though the rest of the statistics may be valid.  
- **Fix**: Skip cells with `null` slope (`if (sl == null) continue;`) or treat them as 0.

---

**3. `routeStats` divides by `run` without checking for zero**  
- `run` is computed as the Euclidean distance between consecutive cells.  
- If the path contains duplicate cells (or a bug causes `dx` and `dy` to be 0), `run` becomes 0 and `dz / run` becomes `Infinity` or `NaN`.  
- This corrupts the walking‑speed calculation and the resulting time estimates.  
- **Fix**: Add `if (run === 0) continue;` before the speed calculation, or guard the division with `if (run > 0)`.

---

**4. `findPath`’s heuristic can become `NaN` if the grid’s cell dimensions are missing**  
- The heuristic uses `grid.cellWidthM` and `grid.cellHeightM`.  
- If either is `undefined`, `dr` or `dc` becomes `NaN`, so `heuristic(i)` returns `NaN`.  
- The priority queue then receives `NaN` scores, which can lead to unpredictable ordering and potentially infinite loops.  
- **Fix**: Validate that `grid.cellWidthM` and `grid.cellHeightM` are finite numbers before running A*. Throw a clear error if they’re missing.

---

**5. `walkingSpeedKmh` can return `NaN` when `grade` is `NaN`**  
- The function uses `Math.exp(-3.5 * Math.abs(grade + 0.05))`.  
- If `grade` is `NaN` (e.g., because `dz` or `run` was `NaN`), the result is `NaN`.  
- The caller (`routeStats`) then propagates this `NaN` into the time estimates.  
- **Fix**: Add a guard: `if (isNaN(grade)) return o.minSpeedKmh;` or similar.

---

**6. `buildCostGrid`’s buddy‑mode radius calculation can produce `NaN`**  
- `rad = Math.ceil((o.buddyMeters / 2) / Math.min(grid.cellWidthM, grid.cellHeightM));`  
- If either cell dimension is `0` or `undefined`, `Math.min` returns `NaN`, so `rad` becomes `NaN`.  
- The subsequent loops (`for (var dr = -rad; ...`) never execute, leaving the cost array unchanged, which may silently hide a bug.  
- **Fix**: Validate the cell dimensions before computing `rad`; if invalid, skip buddy mode or throw an informative error.

---

**7. `findPath` may push the same node into the heap multiple times**  
- The algorithm does not mark a node as “in‑queue” when it is pushed.  
- While the `closed` array prevents re‑processing, the heap can grow unnecessarily large, especially on large grids or with many blocked cells.  
- **Fix**: Keep a separate `inOpen` flag (e.g., a `Uint8Array`) and set it when pushing. Only push a node if it’s not already in the heap or if a better score is found.

---

**8. Minor but confusing API design: `cellCost` accepts `opts` but ignores defaults**  
- `cellCost` is exported as `cellCost: function (s, t, opts) { return cellCost(s, t, withDefaults(opts)); }`.  
- The internal `cellCost` function already expects a full options object, but the exported wrapper re‑creates defaults each call.  
- This double‑wrapping can be confusing for beginners and may hide bugs if a caller passes an object missing some keys.  
- **Fix**: Expose the internal `cellCost` directly or document that the wrapper is required; otherwise, remove the wrapper and let callers pass a fully‑formed options object.
