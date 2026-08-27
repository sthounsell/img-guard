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
 * adapter interface hands every candidate the raw fixture bytes
 * (`bmpBytes()`'s output: a 24-bit uncompressed BITMAPINFOHEADER BMP,
 * bottom-up rows, BGR pixel order, rows padded to a 4-byte boundary — see
 * `node/scripts/benchmark.js`), so `compute()` decodes that specific
 * shape itself before hashing. This keeps decode cost inside the timed
 * call, same as img-guard's WASM candidate (which decodes internally) —
 * comparable "file bytes in, hash out" methodology across candidates,
 * not a shortcut that only times the DCT step.
 *
 * This decoder is intentionally narrow: it only handles the exact BMP
 * shape `bmpBytes()` produces, not BMP-the-format generally (no RLE
 * compression, no palettes, no top-down variant) — sufficient for this
 * harness's synthetic fixtures, nothing more.
 *
 * `require`-ing the package here (rather than at module scope only, which
 * it effectively is — Node caches `require`) is what the runner times as
 * this candidate's cold start, mirroring `img-guard.js`.
 *
 * Not unit-tested (issue #13's Testing Decision, followed by #14 and
 * #15): this is the real npm package, exercised only by actually running
 * the benchmark.
 */
function rgbaFromBmp(buf) {
  const width = buf.readInt32LE(18);
  const height = buf.readInt32LE(22);
  const pixelOffset = buf.readUInt32LE(10);
  const rowSize = Math.ceil((width * 3) / 4) * 4; // rows pad to a 4-byte boundary
  const rgba = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    // BMP rows are stored bottom-up; flip to top-down for RGBA.
    const srcRow = pixelOffset + (height - 1 - y) * rowSize;
    for (let x = 0; x < width; x += 1) {
      const srcIdx = srcRow + x * 3;
      const dstIdx = (y * width + x) * 4;
      rgba[dstIdx] = buf[srcIdx + 2]; // R (BMP stores B, G, R)
      rgba[dstIdx + 1] = buf[srcIdx + 1]; // G
      rgba[dstIdx + 2] = buf[srcIdx]; // B
      rgba[dstIdx + 3] = 255; // A
    }
  }

  return { rgba, width, height };
}

function createCandidate() {
  const { fromRgba } = require("@stabilityprotocol.com/phash");

  return {
    name: "@stabilityprotocol.com/phash",
    compute(imageBytes) {
      const { rgba, width, height } = rgbaFromBmp(imageBytes);
      const hash = fromRgba(rgba, width, height);
      // Default `hashSize` is 8 (8x8 DCT coefficients) => a 16-hex-char,
      // 64-bit hash — same width as img-guard's, but recorded from the
      // actual output rather than assumed, per issue #12's bit-length
      // Further Note (parity is a discover-as-we-go item, not guaranteed).
      return { hash, bits: hash.length * 4 };
    },
  };
}

module.exports = { createCandidate };
