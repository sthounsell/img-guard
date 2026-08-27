"use strict";

/**
 * Wraps img-guard's own WASM `phash` to the compute-axis adapter interface
 * (issue #12's Implementation Decisions), so it's timed by the same runner
 * and results table as the external candidates future tickets add (#14
 * `phash`, #15 `@stabilityprotocol.com/phash`, #16 `sharp-phash`), with no
 * per-candidate special-casing in the runner itself.
 *
 * `require`-ing `../../../../node/pkg` here (rather than at module scope
 * only, which it effectively is — Node caches `require`) is what the
 * runner times as this candidate's cold start, mirroring how
 * `node/scripts/benchmark.js` isolates WASM module instantiation from
 * steady-state compute cost.
 *
 * Not unit-tested (issue #13's Testing Decision): this is the real WASM
 * module, exercised only by actually running the benchmark.
 */
function createCandidate() {
  const { phash } = require("../../../../node/pkg");

  return {
    name: "img-guard (WASM)",
    compute(imageBytes) {
      // image_hasher's DCT hash is a fixed-width u64 regardless of input
      // size — recorded per-call anyway so the adapter shape stays
      // identical across candidates, some of which may not have parity
      // (issue #12's bit-length-parity Further Note).
      return { hash: phash(imageBytes), bits: 64 };
    },
  };
}

module.exports = { createCandidate };
