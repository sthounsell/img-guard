"use strict";

/**
 * An async-aware sibling of `node/scripts/benchmark.js`'s `timeIt` (which
 * the compute axis reused directly through #13/#14/#15). #16's
 * `sharp-phash` breaks that reuse: it's a native binding whose hashing
 * entry point is unavoidably Promise-based (`sharp`, the library it's
 * built on, has no synchronous API — every image operation goes through
 * libvips' worker-thread pool). `benchmark.js`'s `timeIt` calls `fn()` and
 * measures elapsed time without ever awaiting the result, so handed an
 * async `fn` it would only measure the cost of kicking off the Promise —
 * not the real decode+hash work — and never actually wait for `bits` to
 * be assigned before the next sample starts.
 *
 * Kept as its own small file, not folded into `runner.js`, so it stays
 * independently injectable/fakeable the same way `benchmark.js`'s `timeIt`
 * is (issue #13's Testing Decision: orchestration logic tested against
 * fakes). Same mean/min/max-over-N-runs statistical approach as
 * `benchmark.js`'s version — the only difference is `await`ing each call —
 * and used uniformly for every compute-axis candidate (not only async
 * ones), so no candidate needs special-casing in the runner and every
 * candidate in a given run is measured by the same code.
 *
 * Returns `value` — `fn`'s own resolved return value from its last call —
 * alongside the timing stats, so a caller that needs what the timed call
 * produced doesn't have to smuggle it out via an outer-scope variable.
 *
 * @param {() => unknown} fn - may return a plain value or a Promise; either way it's awaited before the next sample starts.
 * @param {number} runs
 * @returns {Promise<{mean: number, min: number, max: number, value: unknown}>}
 */
async function timeIt(fn, runs) {
  const samples = [];
  let value;
  for (let i = 0; i < runs; i += 1) {
    const start = performance.now();
    value = await fn();
    samples.push(performance.now() - start);
  }
  const mean = samples.reduce((sum, ms) => sum + ms, 0) / samples.length;
  return { mean, min: Math.min(...samples), max: Math.max(...samples), value };
}

module.exports = { timeIt };
