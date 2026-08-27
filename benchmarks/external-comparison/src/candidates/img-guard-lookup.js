"use strict";

/**
 * Wraps img-guard's own `classify()` lookup path (indexed-MD5
 * `findExactMatch` + linear-scan-phash) to the lookup-axis adapter interface
 * (issue #12's Implementation Decisions), so it's timed by the same runner
 * and results table as `bktree-fast` once a future ticket adds it, with no
 * per-candidate special-casing in the runner itself.
 *
 * `require`-ing `../../../../node/pkg` and `../../../../node/src/*` here
 * (rather than at module scope only, which it effectively is — Node caches
 * `require`) is what the runner times as this candidate's cold start,
 * mirroring the compute-axis `img-guard.js` candidate.
 *
 * `build(entries)` opens a real Store — `:memory:` rather than a temp file,
 * since the Index is opaque to the generic runner (issue #12's shared
 * lookup-axis interface has no cleanup hook, unlike
 * `node/scripts/benchmark.js`'s own store-size sweep, which owns its loop
 * and can `fs.rmSync` after each size). An in-memory `better-sqlite3`
 * database exercises the identical schema/query plan as the file-backed
 * Store `openStore` normally returns, minus disk I/O — which also makes the
 * comparison fairer against `bktree-fast`, an in-memory structure with no
 * disk cost of its own.
 *
 * `query(index, candidateHash, threshold)` calls the real `classify()` with
 * a freshly-random MD5 — never present in the seeded Store, since
 * `randomMd5`'s keyspace makes a collision negligible — so every query
 * exercises the full lookup path (`findExactMatch`'s guaranteed miss, then
 * the phash linear scan), mirroring `benchmark.js`'s "classify() as New
 * (full scan)" case rather than short-circuiting on Exact.
 *
 * Not unit-tested (issue #17's Testing Decision, mirroring #13's): this is
 * the real Store and WASM `hammingDistance`, exercised only by actually
 * running the benchmark.
 */
function createCandidate() {
  const { openStore } = require("../../../../node/src/store");
  const { classify } = require("../../../../node/src/classify");
  const { hammingDistance } = require("../../../../node/pkg");
  const { randomMd5 } = require("../../../../node/scripts/benchmark");

  return {
    name: "img-guard (indexed-MD5 + linear-scan-phash)",

    build(entries) {
      const store = openStore(":memory:");
      for (const entry of entries) {
        store.addEntry(entry);
      }
      return store;
    },

    query(store, candidateHash, threshold) {
      const result = classify(
        { md5: randomMd5(), getPhash: () => candidateHash },
        store,
        threshold,
        hammingDistance,
      );
      return { distance: result.distance, matched: result.type !== "New" };
    },
  };
}

module.exports = { createCandidate };
