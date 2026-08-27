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
 * `() => { name, build(entries) -> Index, query(index, candidateHash, threshold) -> { distance, matched } }`.
 * The factory call itself is what performs — and what gets timed as — the
 * one-time module load, mirroring the compute axis; `build()` is timed as
 * part of each store-size row's steady-state stats since — unlike
 * compute's `compute()` — constructing the Index at a given size (an
 * indexed-MD5 Store insert per entry, or a BK-tree insert per entry) is
 * itself part of the lookup-axis comparison, not overhead to hide from it.
 *
 * @param {object} args
 * @param {Array<() => {name: string, build: (entries: Array<{path: string, md5: string, phash: unknown}>) => unknown, query: (index: unknown, candidateHash: unknown, threshold: number) => {distance: number|null, matched: boolean}}>} args.candidates
 * @param {number[]} args.storeSizes - Store sizes to sweep.
 * @param {number} args.runs - steady-state samples per (candidate, storeSize).
 * @param {number} args.threshold - Hamming-distance Similarity Threshold passed to every query().
 * @param {() => string} args.randomMd5
 * @param {() => unknown} args.randomPhash
 * @param {(fn: () => void, runs: number) => {mean: number, min: number, max: number}} args.timeIt
 * @returns {Array<{candidate: string, storeSize: number, coldStartMs: number, distance: number|null, matched: boolean, mean: number, min: number, max: number}>}
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
      const index = candidate.build(entries);
      const candidateHash = randomPhash();

      let distance = null;
      let matched = false;
      const stats = timeIt(() => {
        ({ distance, matched } = candidate.query(
          index,
          candidateHash,
          threshold,
        ));
      }, runs);

      rows.push({
        candidate: candidate.name,
        storeSize,
        coldStartMs,
        distance,
        matched,
        ...stats,
      });
    }
  }

  return rows;
}

module.exports = { runLookupBenchmark };
