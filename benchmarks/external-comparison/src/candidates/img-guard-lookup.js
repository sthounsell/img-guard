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
 * disk cost of its own. Seeds via `Store#addEntries` — a single transaction
 * for the whole store size, rather than one commit per `addEntry` call —
 * and closes the *previous* store size's database before opening the next,
 * since `lookupRunner`'s `build()` is called once per store size in the
 * sweep and nothing else owns that handle; `close()` (called by the runner
 * once this candidate's whole sweep finishes) closes whatever's left.
 *
 * `query(index, probe, threshold)` calls the real `classify()` with the
 * `probe` the runner hands it — the *same* `{ md5, phash }` pair on every
 * timed call within a store size (`lookupRunner.js`'s doc comment), never
 * present in the seeded Store, since `randomMd5`'s keyspace makes a
 * collision negligible — so every query exercises the full lookup path
 * (`findExactMatch`'s guaranteed miss, then the phash linear scan),
 * mirroring `benchmark.js`'s "classify() as New (full scan)" case rather
 * than short-circuiting on Exact. Earlier revisions generated a fresh
 * `randomMd5()` *inside* `query()` on every timed call instead of using the
 * probe the runner already hoisted — real per-call overhead unrelated to
 * the lookup itself, and asymmetric against `bktree-lookup.js`'s `query()`,
 * which never had equivalent per-call work. Fixed by using `probe.md5`
 * here, same as `probe.phash` already was.
 *
 * Not unit-tested (issue #17's Testing Decision, mirroring #13's): this is
 * the real Store and WASM `hammingDistance`, exercised only by actually
 * running the benchmark.
 */
function createCandidate() {
  const { openStore } = require("../../../../node/src/store");
  const { classify } = require("../../../../node/src/classify");
  const { hammingDistance } = require("../../../../node/pkg");

  let currentStore = null;

  return {
    name: "img-guard (indexed-MD5 + linear-scan-phash)",

    build(entries) {
      if (currentStore) {
        currentStore.close();
      }
      currentStore = openStore(":memory:");
      currentStore.addEntries(entries);
      return currentStore;
    },

    query(store, probe, threshold) {
      const classification = classify(
        { md5: probe.md5, getPhash: () => probe.phash },
        store,
        threshold,
        hammingDistance,
      );
      return {
        distance: classification.distance,
        matched: classification.type !== "New",
      };
    },

    close() {
      if (currentStore) {
        currentStore.close();
        currentStore = null;
      }
    },
  };
}

module.exports = { createCandidate };
