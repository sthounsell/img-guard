"use strict";

/**
 * Third lookup-axis candidate (issue #20): img-guard's phash entries held
 * in a plain in-memory JS array — no SQLite, no `Store`, no query engine of
 * any kind — linear-scanned via the WASM `hammingDistance` directly.
 * Mirrors `classify()`'s own Similar/New scan (`node/src/classify.js`):
 * the first entry within `threshold` short-circuits with `matched: true`;
 * otherwise the whole array is scanned and the closest distance found is
 * returned as a miss, exactly as `classify()`'s `New` case does.
 *
 * Exists to split the ~25x/~12x gap `comparison.md` reported between
 * `img-guard-lookup.js` and `bktree-lookup.js` into two attributable
 * pieces, rather than one conflated number (issue #20): img-guard's own
 * candidate pays real `better-sqlite3` query-engine overhead (parse,
 * execute, marshal rows) on every `getEntries()` call, even against an
 * in-memory database, while `bktree-fast` has no query layer at all. This
 * candidate is the *same* O(n) linear-scan algorithm as img-guard's, with
 * the query-engine execution path removed — so, run through the same
 * harness:
 *   - `img-guard-lookup.js` vs. this candidate isolates SQL overhead (same
 *     algorithm, different execution path)
 *   - this candidate vs. `bktree-lookup.js` isolates the algorithmic gap
 *     (same "no query engine" execution path, different algorithm)
 *
 * `query()` deliberately never looks at `probe.md5` — img-guard's real
 * `classify()` only reaches the phash scan after its indexed `md5` lookup
 * (`findExactMatch`) already misses, and this candidate exists purely to
 * time that phash scan in isolation, same as `bktree-lookup.js` already
 * does. `probe.md5` is still accepted, to keep the same adapter shape as
 * the other two candidates, it's just unused.
 *
 * Not unit-tested (issue #17/#18/#20's Testing Decision, mirroring
 * `img-guard-lookup.js`/`bktree-lookup.js`): this is the real WASM
 * `hammingDistance`, exercised only by actually running the benchmark.
 * `lookupRunner.test.js` already covers the generic orchestration this
 * candidate plugs into, against a fake.
 */
function createCandidate() {
  const { hammingDistance } = require("../../../../node/pkg");

  return {
    name: "plain array (linear-scan, no query engine)",

    build(entries) {
      // No index to construct — the array *is* the Index, so build() is
      // just handing it back. Timed like every other candidate's build()
      // regardless, so the results table's build (ms) column stays
      // meaningful as "near-zero" rather than an omitted/undefined figure.
      return entries;
    },

    query(entries, probe, threshold) {
      let minDistance = null;
      for (const entry of entries) {
        const distance = hammingDistance(probe.phash, entry.phash);
        if (minDistance === null || distance < minDistance) {
          minDistance = distance;
        }
        // First qualifying entry wins, same short-circuit as classify()'s
        // Similar case — not necessarily the closest.
        if (distance <= threshold) {
          return { distance, matched: true };
        }
      }
      return { distance: minDistance, matched: false };
    },
  };
}

module.exports = { createCandidate };
