"use strict";

const { runComputeBenchmark } = require("../src/runner");

/** Calls `fn` `runs` times (so call-count assertions still hold), awaiting
 * each call — `runComputeBenchmark` (issue #16) awaits both the candidate
 * factory and `compute()`, so its injected `timeIt` must be able to await
 * `fn` too — but returns fixed stats, deterministic, and keeps this suite
 * independent of the real `src/timeIt.js` (issue #13's Testing Decision:
 * orchestration logic tested against fakes, not real infra). */
async function fakeTimeIt(fn, runs) {
  let value;
  for (let i = 0; i < runs; i += 1) value = await fn();
  return { mean: 1, min: 1, max: 1, value };
}

const fakeImages = (...labels) =>
  labels.map((label) => ({ label, bytes: Buffer.from(label) }));

describe("runComputeBenchmark", () => {
  it("loads each candidate once (cold start) and times compute() once per (image, run)", async () => {
    let loadCount = 0;
    let computeCount = 0;
    const createFake = () => {
      loadCount += 1;
      return {
        name: "fake",
        compute: (bytes) => {
          computeCount += 1;
          return { hash: bytes.length, bits: 64 };
        },
      };
    };

    const rows = await runComputeBenchmark({
      candidates: [createFake],
      images: fakeImages("64x64", "512x512"),
      runs: 3,
      timeIt: fakeTimeIt,
    });

    expect(loadCount).toBe(1);
    expect(computeCount).toBe(6); // 2 images * 3 runs
    expect(rows).toHaveLength(2);
  });

  it("records the candidate's name, image label, bit-length, cold-start cost, and steady-state stats per row", async () => {
    const createFake = () => ({
      name: "fake-candidate",
      compute: () => ({ hash: 0, bits: 128 }),
    });

    const rows = await runComputeBenchmark({
      candidates: [createFake],
      images: fakeImages("64x64 (synthetic)"),
      runs: 1,
      timeIt: fakeTimeIt,
    });

    expect(rows).toEqual([
      {
        candidate: "fake-candidate",
        label: "64x64 (synthetic)",
        bits: 128,
        coldStartMs: expect.any(Number),
        mean: 1,
        min: 1,
        max: 1,
      },
    ]);
  });

  it("produces one row per (candidate, image) pair, in candidate order then image order", async () => {
    const a = () => ({ name: "a", compute: () => ({ hash: 0, bits: 64 }) });
    const b = () => ({ name: "b", compute: () => ({ hash: 0, bits: 256 }) });

    const rows = await runComputeBenchmark({
      candidates: [a, b],
      images: fakeImages("64x64", "512x512"),
      runs: 1,
      timeIt: fakeTimeIt,
    });

    expect(rows.map((r) => [r.candidate, r.label])).toEqual([
      ["a", "64x64"],
      ["a", "512x512"],
      ["b", "64x64"],
      ["b", "512x512"],
    ]);
  });

  it("does not mistake one candidate's bit-length for another's", async () => {
    const a = () => ({ name: "a", compute: () => ({ hash: 0, bits: 64 }) });
    const b = () => ({ name: "b", compute: () => ({ hash: 0, bits: 256 }) });

    const rows = await runComputeBenchmark({
      candidates: [a, b],
      images: fakeImages("64x64"),
      runs: 1,
      timeIt: fakeTimeIt,
    });

    expect(rows.map((r) => r.bits)).toEqual([64, 256]);
  });

  // Issue #21: a real photo isn't square, so labels carry filenames/
  // dimensions rather than assuming `${size}x${size}` — proven here with a
  // label shaped like a real-image entry alongside a synthetic one, both
  // going through the same loop with no special-casing.
  it("accepts non-synthetic labels (e.g. a real image filename) alongside synthetic ones", async () => {
    const createFake = () => ({
      name: "fake",
      compute: () => ({ hash: 0, bits: 64 }),
    });

    const rows = await runComputeBenchmark({
      candidates: [createFake],
      images: fakeImages("64x64 (synthetic)", "Radu1.jpg (4992x3136)"),
      runs: 1,
      timeIt: fakeTimeIt,
    });

    expect(rows.map((r) => r.label)).toEqual([
      "64x64 (synthetic)",
      "Radu1.jpg (4992x3136)",
    ]);
  });

  // Issue #16: `sharp-phash` needs both an async factory (to absorb
  // libvips' lazy first-use init into cold start) and an async `compute()`
  // (sharp has no synchronous API) — proven here against fakes shaped the
  // same way, without touching the real native binding.
  it("awaits an async factory and an async compute(), same as a synchronous candidate", async () => {
    let loadCount = 0;
    let computeCount = 0;
    const createAsyncFake = async () => {
      await Promise.resolve();
      loadCount += 1;
      return {
        name: "async-fake",
        async compute(bytes) {
          await Promise.resolve();
          computeCount += 1;
          return { hash: bytes.length, bits: 64 };
        },
      };
    };

    const rows = await runComputeBenchmark({
      candidates: [createAsyncFake],
      images: fakeImages("64x64", "512x512"),
      runs: 2,
      timeIt: fakeTimeIt,
    });

    expect(loadCount).toBe(1);
    expect(computeCount).toBe(4); // 2 images * 2 runs
    expect(rows.map((r) => [r.candidate, r.label, r.bits])).toEqual([
      ["async-fake", "64x64", 64],
      ["async-fake", "512x512", 64],
    ]);
  });
});
