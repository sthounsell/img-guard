"use strict";

/**
 * Orchestrates the lookup-axis benchmark (issue #17): for each candidate
 * factory, builds a fresh Index per store size in the sweep — seeded with
 * `randomMd5`/`randomPhash`-generated entries, reusing
 * `node/scripts/benchmark.js`'s existing random-entry seeding approach
 * rather than reimplementing it — then times steady-state `query()` calls
 * against that Index.
 *
 * Pure and injectable (`randomMd5`/`randomPhash`/`timeIt` passed in rather
 * than required directly) so it's testable against a trivial fake candidate
 * without touching the real Store or WASM `hammingDistance` (issue #17's
 * Testing Decision) — same pattern `runComputeBenchmark` uses for the
 * compute axis, and `classify()` uses against a fake Store.
 *
 * Candidate factory shape (issue #12's lookup-axis adapter interface):
 * `() => { name, build(entries) -> Index, query(index, probe, threshold) -> { distance, matched }, close?() }`.
 * The factory call itself is what performs — and what gets timed as — the
 * one-time module load, mirroring the compute axis. `close()` is optional
 * and called once per candidate after its whole store-size sweep finishes,
 * for a candidate (e.g. img-guard's, which opens a real `:memory:`
 * database per store size) that holds a resource needing explicit cleanup.
 *
 * `build()`'s cost is measured separately from `query()`'s (`buildMs` on
 * each row) rather than folded into the steady-state query stats —
 * constructing the Index at a given size (an indexed-MD5 Store insert per
 * entry, or a BK-tree insert per entry) is real, size-dependent lookup-axis
 * cost worth reporting, but it's a one-off per store size, not something
 * `timeIt`'s repeated-sampling steady-state methodology applies to the way
 * it does to `query()`.
 *
 * The `probe` handed to `query()` — an `{ md5, phash }` pair shaped like a
 * seeded Entry minus its `path` — is generated once per store size, before
 * `timeIt` starts, and the *same* probe is passed to every timed `query()`
 * call. Generating it fresh per call (in particular calling `randomMd5()`
 * inside a candidate's own `query()`) was a real bug: it added per-call
 * overhead unrelated to the lookup itself, and asymmetrically, since only
 * one candidate needed an md5 at all — see `img-guard-lookup.js`'s history.
 * A candidate that doesn't need the md5 half (e.g. `bktree-fast`, a pure
 * phash structure) simply ignores it.
 *
 * @param {object} args
 * @param {Array<() => {name: string, build: (entries: Array<{path: string, md5: string, phash: unknown}>) => unknown, query: (index: unknown, probe: {md5: string, phash: unknown}, threshold: number) => {distance: number|null, matched: boolean}, close?: () => void}>} args.candidates
 * @param {number[]} args.storeSizes - Store sizes to sweep.
 * @param {number} args.runs - steady-state samples per (candidate, storeSize).
 * @param {number} args.threshold - Hamming-distance Similarity Threshold passed to every query().
 * @param {() => string} args.randomMd5
 * @param {() => unknown} args.randomPhash
 * @param {(fn: () => unknown, runs: number) => {mean: number, min: number, max: number, value: unknown}} args.timeIt
 * @returns {Array<{candidate: string, storeSize: number, coldStartMs: number, buildMs: number, distance: number|null, matched: boolean, mean: number, min: number, max: number}>}
 */
function runLookupBenchmark({
  candidates,
  storeSizes,
  runs,
  threshold,
  randomMd5,
  randomPhash,
  timeIt,
}) {
  const rows = [];

  for (const createCandidate of candidates) {
    const loadStart = performance.now();
    const candidate = createCandidate();
    const coldStartMs = performance.now() - loadStart;

    for (const storeSize of storeSizes) {
      const entries = [];
      for (let i = 0; i < storeSize; i += 1) {
        entries.push({
          path: `seed-${i}.png`,
          md5: randomMd5(),
          phash: randomPhash(),
        });
      }

      const buildStart = performance.now();
      const index = candidate.build(entries);
      const buildMs = performance.now() - buildStart;

      // Hoisted once per store size, then reused for every timed query()
      // call below — see the doc comment above for why.
      const probe = { md5: randomMd5(), phash: randomPhash() };

      const { value, ...stats } = timeIt(
        () => candidate.query(index, probe, threshold),
        runs,
      );

      rows.push({
        candidate: candidate.name,
        storeSize,
        coldStartMs,
        buildMs,
        distance: value.distance,
        matched: value.matched,
        ...stats,
      });
    }

    candidate.close?.();
  }

  return rows;
}

module.exports = { runLookupBenchmark };
