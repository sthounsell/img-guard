"use strict";

/**
 * Decodes the narrow BMP shape `node/scripts/benchmark.js`'s `bmpBytes()`
 * produces — 24-bit uncompressed BITMAPINFOHEADER, bottom-up rows, BGR
 * pixel order, rows padded to a 4-byte boundary — into top-down RGB(A)
 * pixel data. Not BMP-the-format generally (no RLE compression, no
 * palettes, no top-down variant): sufficient for this harness's synthetic
 * fixtures, nothing more (same scope note `stabilityprotocol-phash.js` and
 * `sharp-phash.js` each carried before this was factored out).
 *
 * Shared between `stabilityprotocol-phash.js` (issue #15, wants RGBA as a
 * `Uint8ClampedArray`) and `sharp-phash.js` (issue #16, wants RGB — no
 * alpha byte — as a plain `Buffer`): the two decoders were near-identical
 * ~20-line copies differing only in output buffer type and whether an
 * alpha byte gets appended, so `withAlpha` parameterises that one
 * difference instead of keeping two copies to drift apart.
 *
 * @param {Buffer} buf
 * @param {object} [options]
 * @param {boolean} [options.withAlpha] - append a 255 alpha byte per pixel and return a `Uint8ClampedArray` (RGBA); omit for a plain RGB `Buffer`.
 * @returns {{pixels: Buffer|Uint8ClampedArray, width: number, height: number}}
 */
function decodeBmp(buf, { withAlpha = false } = {}) {
  const width = buf.readInt32LE(18);
  const height = buf.readInt32LE(22);
  const pixelOffset = buf.readUInt32LE(10);
  const rowSize = Math.ceil((width * 3) / 4) * 4; // rows pad to a 4-byte boundary
  const channels = withAlpha ? 4 : 3;
  const pixels = withAlpha
    ? new Uint8ClampedArray(width * height * channels)
    : Buffer.alloc(width * height * channels);

  for (let y = 0; y < height; y += 1) {
    // BMP rows are stored bottom-up; flip to top-down.
    const srcRow = pixelOffset + (height - 1 - y) * rowSize;
    for (let x = 0; x < width; x += 1) {
      const srcIdx = srcRow + x * 3;
      const dstIdx = (y * width + x) * channels;
      pixels[dstIdx] = buf[srcIdx + 2]; // R (BMP stores B, G, R)
      pixels[dstIdx + 1] = buf[srcIdx + 1]; // G
      pixels[dstIdx + 2] = buf[srcIdx]; // B
      if (withAlpha) {
        pixels[dstIdx + 3] = 255; // A
      }
    }
  }

  return { pixels, width, height };
}

module.exports = { decodeBmp };
