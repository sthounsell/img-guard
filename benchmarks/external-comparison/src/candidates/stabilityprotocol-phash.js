"use strict";

/**
 * Wraps `@stabilityprotocol.com/phash` (issue #15) to the compute-axis
 * adapter interface (issue #12's Implementation Decisions), so it's timed
 * by the same runner and results table as img-guard's own candidate and
 * the other external candidates, with no per-candidate special-casing in
 * the runner itself.
 *
 * Unlike img-guard's WASM `phash`, this library's hashing entry points
 * (`fromRgba`/`fromImageData`) take decoded RGBA pixel data plus
 * width/height — they don't decode an encoded image file themselves. The
 * adapter interface hands every candidate the raw image bytes, so
 * `compute()` decodes them itself before hashing, keeping decode cost
 * inside the timed call, same as img-guard's WASM candidate (which decodes
 * internally) — comparable "file bytes in, hash out" methodology across
 * candidates, not a shortcut that only times the DCT step. Which decoder
 * runs depends on what's actually in `imageBytes` (`isSyntheticBmp`,
 * shared with `sharp-phash.js`, issue #21):
 *
 * - The harness's synthetic fixture (`bmpBytes()`'s output: a 24-bit
 *   uncompressed BITMAPINFOHEADER BMP, bottom-up rows, BGR pixel order,
 *   rows padded to a 4-byte boundary — see `node/scripts/benchmark.js`)
 *   decodes via `../bmpDecode.js` (shared with `sharp-phash.js`), which
 *   only understands that one narrow shape.
 * - A real encoded image (e.g. a JPEG) decodes via `sharp` — already
 *   present in the dependency tree as `sharp-phash`'s peer dependency, so
 *   nothing new to install — asked for raw RGBA output directly
 *   (`.raw().ensureAlpha()`), the same pixel shape `fromRgba` wants. This
 *   makes `compute()` async for real images (sharp has no synchronous
 *   API, same reason `sharp-phash.js` is async); `runComputeBenchmark`
 *   already `await`s every candidate's `compute()` uniformly (issue #16),
 *   so a candidate that's sync for the BMP path and async for the real
 *   path needs no special-casing there.
 *
 * `require`-ing the package here (rather than at module scope only, which
 * it effectively is — Node caches `require`) is what the runner times as
 * this candidate's cold start, mirroring `img-guard.js`.
 *
 * Not unit-tested (issue #13's Testing Decision, followed by #14 and
 * #15): this is the real npm package, exercised only by actually running
 * the benchmark.
 */
const { decodeBmp, isSyntheticBmp } = require("../bmpDecode");

function createCandidate() {
  const { fromRgba } = require("@stabilityprotocol.com/phash");
  const sharp = require("sharp");

  return {
    name: "@stabilityprotocol.com/phash",
    async compute(imageBytes) {
      let pixels;
      let width;
      let height;
      if (isSyntheticBmp(imageBytes)) {
        ({ pixels, width, height } = decodeBmp(imageBytes, {
          withAlpha: true,
        }));
      } else {
        const raw = await sharp(imageBytes)
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        pixels = new Uint8ClampedArray(raw.data);
        ({ width, height } = raw.info);
      }
      const hash = fromRgba(pixels, width, height);
      // Default `hashSize` is 8 (8x8 DCT coefficients) => a 16-hex-char,
      // 64-bit hash — same width as img-guard's, but recorded from the
      // actual output rather than assumed, per issue #12's bit-length
      // Further Note (parity is a discover-as-we-go item, not guaranteed).
      return { hash, bits: hash.length * 4 };
    },
  };
}

module.exports = { createCandidate };
