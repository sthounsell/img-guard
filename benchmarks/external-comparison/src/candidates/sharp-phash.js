"use strict";

/**
 * Wraps `sharp-phash` (issue #16) to the compute-axis adapter interface
 * (issue #12's Implementation Decisions), so it's timed by the same runner
 * and results table as img-guard's own candidate and the other external
 * candidates, with no per-candidate special-casing in the runner itself.
 *
 * Two integration wrinkles, both worth recording (mirrors #15's own note):
 *
 * 1. `sharp-phash` decodes images via `sharp` — a native binding on top of
 *    `libvips` — but the standard prebuilt `sharp` binary doesn't compile
 *    in ImageMagick/GraphicsMagick's BMP loader (`sharp.format.magick`
 *    exists but its input/output flags are all `false`), so handing it the
 *    harness's raw BMP fixture directly throws "Input buffer contains
 *    unsupported image format" — confirmed, not a sandbox artifact (see
 *    benchmarks/results/notes.md). Same fix as `@stabilityprotocol.com/
 *    phash` (#15): decode the harness's specific BMP shape ourselves
 *    (`../bmpDecode.js`, shared with that candidate) and hand `sharp`
 *    already-decoded raw pixel data via its `{ raw: { width, height,
 *    channels } }` input mode instead of asking it to decode BMP. Decode
 *    cost stays inside the timed call, same methodology as every other
 *    candidate.
 *
 * 2. `sharp-phash`'s hashing function is unavoidably async (`sharp` has no
 *    synchronous API — every operation runs through libvips' worker-thread
 *    pool), so `compute()` below is `async`, resolving to the same
 *    `{ hash, bits }` shape every other candidate returns synchronously.
 *    `runComputeBenchmark` (`src/runner.js`, issue #16) `await`s every
 *    candidate's `compute()` uniformly, so this doesn't need a
 *    per-candidate branch in the runner — synchronous candidates are
 *    unaffected, since `await`ing a plain value just resolves it in place.
 *
 * Cold-start isolation (issue #16's core ask): `require("sharp-phash")`
 * only loads the JS wrapper plus `sharp`'s native binding shared library —
 * cheap, and, like every other candidate, timed as this candidate's cold
 * start simply by happening inside `createCandidate()`. The real cost is
 * libvips' own *lazy* first-use init (its worker-thread pool only spins up
 * on the first actual image operation, not on `require()`): measured
 * directly on this machine, a first real hash call took ~7.0ms vs. ~1.3ms
 * steady-state — a first-call tax that would otherwise land inside the
 * "64x64" steady-state row rather than cold start. `createCandidate()` is
 * itself `async` and absorbs this by doing one throwaway hash call on a
 * minimal 1x1 image before returning, so every steady-state call the
 * runner times afterwards is already warm.
 *
 * Not unit-tested (issue #13's Testing Decision, followed by #14/#15):
 * this is the real npm package (and the real `sharp`/libvips native
 * binding), exercised only by actually running the benchmark.
 */
const { decodeBmp } = require("../bmpDecode");

async function createCandidate() {
  const sharpPhash = require("sharp-phash");

  // Absorb libvips' lazy first-use init into cold start (see doc comment
  // above) — the image content doesn't matter, only that a real hash
  // pipeline runs once before steady-state timing starts.
  await sharpPhash(Buffer.alloc(3), {
    raw: { width: 1, height: 1, channels: 3 },
  });

  return {
    name: "sharp-phash",
    async compute(imageBytes) {
      const { pixels, width, height } = decodeBmp(imageBytes);
      const hash = await sharpPhash(pixels, {
        raw: { width, height, channels: 3 },
      });
      // sharp-phash's DCT hash is a fixed 8x8 low-frequency-coefficient
      // grid (LOW_SIZE=8 in its own source), returned as a 64-character
      // '0'/'1' string — 64 bits, recorded from the actual output length
      // rather than assumed, per issue #12's bit-length-parity Further
      // Note. Happens to match img-guard's and @stabilityprotocol.com's.
      return { hash, bits: hash.length };
    },
  };
}

module.exports = { createCandidate };
