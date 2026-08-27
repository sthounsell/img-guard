"use strict";

/**
 * Orchestrates the compute-axis benchmark (issue #13): for each candidate
 * factory, loads the candidate once — timed separately as cold-start, the
 * same split `node/scripts/benchmark.js` already applies to img-guard's own
 * WASM instantiation, since a one-time module-load / native-binding-init
 * cost (e.g. `sharp-phash`'s native binding) isn't ongoing per-image cost —
 * then times steady-state `compute()` calls across every image size.
 *
 * Pure and injectable (`bmpBytes`/`timeIt` passed in rather than required
 * directly) so it's testable against a trivial fake candidate without
 * touching the real WASM module or fixture generator (issue #13's Testing
 * Decision) — same pattern `classify()` uses against a fake Store.
 *
 * Candidate factory shape (issue #12's compute-axis adapter interface):
 * `() => { name, compute(imageBytes) -> { hash, bits } }`. The factory call
 * itself is what performs — and what gets timed as — the one-time module
 * load; `compute()` is assumed cheap to call repeatedly once loaded.
 *
 * @param {object} args
 * @param {Array<() => {name: string, compute: (bytes: Buffer) => {hash: unknown, bits: number}}>} args.candidates
 * @param {number[]} args.sizes - image side lengths to sweep.
 * @param {number} args.runs - steady-state samples per (candidate, size).
 * @param {(size: number) => Buffer} args.bmpBytes
 * @param {(fn: () => void, runs: number) => {mean: number, min: number, max: number}} args.timeIt
 * @returns {Array<{candidate: string, size: number, bits: number, coldStartMs: number, mean: number, min: number, max: number}>}
 */
function runComputeBenchmark({ candidates, sizes, runs, bmpBytes, timeIt }) {
  const rows = [];

  for (const createCandidate of candidates) {
    const loadStart = performance.now();
    const candidate = createCandidate();
    const coldStartMs = performance.now() - loadStart;

    for (const size of sizes) {
      const bytes = bmpBytes(size);
      let bits = null;

      const stats = timeIt(() => {
        ({ bits } = candidate.compute(bytes));
      }, runs);

      rows.push({
        candidate: candidate.name,
        size,
        bits,
        coldStartMs,
        ...stats,
      });
    }
  }

  return rows;
}

module.exports = { runComputeBenchmark };
