"use strict";

// The one boundary integration test (issue #3 / CONTEXT.md "Comparison"):
// exercises the actual compiled wasm-pack artifact in `../pkg`, not the
// native Rust functions cargo test already covers. Its job is to catch
// marshalling bugs across the WASM boundary (byte arrays, u64 <-> bigint)
// that native unit tests structurally can't see — not to re-verify phash's
// algorithmic behaviour, which is `cargo test`'s job. A single smoke check,
// not a parameterized suite, per CONTEXT.md's testing decisions.

const crypto = require("node:crypto");
const { md5, phash, hammingDistance } = require("../pkg");
const { gradient, noise } = require("./fixtures");

describe("wasm boundary", () => {
  it("md5 matches Node's own crypto digest for real image bytes", () => {
    const expected = crypto.createHash("md5").update(gradient).digest("hex");
    expect(md5(gradient)).toBe(expected);
  });

  it("phash returns a deterministic bigint for real image bytes", () => {
    const first = phash(gradient);
    const second = phash(gradient);
    expect(typeof first).toBe("bigint");
    expect(second).toBe(first);
  });

  it("hammingDistance round-trips a phash against itself as zero", () => {
    const hash = phash(gradient);
    expect(hammingDistance(hash, hash)).toBe(0);
  });

  it("hammingDistance of two different images' phashes crosses the WASM boundary correctly", () => {
    const a = phash(gradient);
    const b = phash(noise);
    expect(hammingDistance(a, b)).toBeGreaterThan(0);
  });

  it("phash rejects bytes that aren't a decodable image", () => {
    expect(() => phash(Buffer.from("not an image"))).toThrow();
  });
});
