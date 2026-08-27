"use strict";

/**
 * Orchestrates the compute-axis benchmark (issue #13): for each candidate
 * factory, loads the candidate once — timed separately as cold-start, the
 * same split `node/scripts/benchmark.js` already applies to img-guard's own
 * WASM instantiation, since a one-time module-load / native-binding-init
 * cost (e.g. `sharp-phash`'s native binding) isn't ongoing per-image cost —
 * then times steady-state `compute()` calls across every image.
 *
 * Pure and injectable (`timeIt` passed in rather than required directly) so
 * it's testable against a trivial fake candidate without touching the real
 * WASM module or any real image (issue #13's Testing Decision) — same
 * pattern `classify()` uses against a fake Store.
 *
 * Takes a caller-built `images` list (issue #21) rather than `sizes` +
 * `bmpBytes` — the runner no longer knows or cares whether an image is a
 * synthetic fixture or a real photo, only that it has `bytes` to hand a
 * candidate and a `label` to carry through to the results table. Building
 * that list (synthetic sweep, optionally plus real files read from disk) is
 * the caller's job, mirroring `node/scripts/benchmark.js`'s own
 * `benchmarkImageSizes`, which already combines a synthetic sweep with one
 * optional real image the same way.
 *
 * Candidate factory shape (issue #12's compute-axis adapter interface):
 * `() => { name, compute(imageBytes) -> { hash, bits } }`. The factory call
 * itself is what performs — and what gets timed as — the one-time module
 * load; `compute()` is assumed cheap to call repeatedly once loaded.
 *
 * Both the factory and `compute()` are `await`ed rather than called bare
 * (issue #16): a plain synchronous candidate is unaffected — `await`ing a
 * non-Promise just resolves it on the spot — but this is what lets a
 * candidate whose real work is unavoidably async (`sharp-phash`, built on
 * `sharp`/libvips, which has no synchronous API) participate with no
 * per-candidate branching here. It's also what lets a factory absorb a
 * native binding's lazy first-use init (e.g. libvips' worker-thread
 * spin-up, which only happens on its first real image operation, not on
 * `require()`) into the cold-start window, by doing a throwaway warm-up
 * call itself before returning. `timeIt` (`src/timeIt.js`) is the
 * async-capable counterpart this needs — `node/scripts/benchmark.js`'s own
 * `timeIt` never awaits `fn()`, so it can't correctly time a candidate
 * whose `compute()` returns a Promise.
 *
 * @param {object} args
 * @param {Array<() => ({name: string, compute: (bytes: Buffer) => ({hash: unknown, bits: number} | Promise<{hash: unknown, bits: number}>)}) | Promise<{name: string, compute: Function}>>} args.candidates
 * @param {Array<{label: string, bytes: Buffer}>} args.images - images to sweep, synthetic and/or real; `label` is carried through to each row unchanged.
 * @param {number} args.runs - steady-state samples per (candidate, image).
 * @param {(fn: () => unknown, runs: number) => Promise<{mean: number, min: number, max: number, value: unknown}>} args.timeIt
 * @returns {Promise<Array<{candidate: string, label: string, bits: number, coldStartMs: number, mean: number, min: number, max: number}>>}
 */
async function runComputeBenchmark({ candidates, images, runs, timeIt }) {
  const rows = [];

  for (const createCandidate of candidates) {
    const loadStart = performance.now();
    const candidate = await createCandidate();
    const coldStartMs = performance.now() - loadStart;

    for (const { label, bytes } of images) {
      const { value, ...stats } = await timeIt(
        () => candidate.compute(bytes),
        runs,
      );

      rows.push({
        candidate: candidate.name,
        label,
        bits: value.bits,
        coldStartMs,
        ...stats,
      });
    }
  }

  return rows;
}

module.exports = { runComputeBenchmark };
