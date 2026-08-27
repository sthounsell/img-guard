"use strict";

const { runComputeBenchmark } = require("../src/runner");

/** Calls `fn` `runs` times (so call-count assertions still hold), awaiting
 * each call — `runComputeBenchmark` (issue #16) awaits both the candidate
 * factory and `compute()`, so its injected `timeIt` must be able to await
 * `fn` too — but returns fixed stats, deterministic, and keeps this suite
 * independent of the real `src/timeIt.js` (issue #13's Testing Decision:
 * orchestration logic tested against fakes, not real infra). */
async function fakeTimeIt(fn, runs) {
  for (let i = 0; i < runs; i += 1) await fn();
  return { mean: 1, min: 1, max: 1 };
}

const fakeBmpBytes = (size) => Buffer.alloc(size);

describe("runComputeBenchmark", () => {
  it("loads each candidate once (cold start) and times compute() once per (size, run)", async () => {
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
      sizes: [1, 2],
      runs: 3,
      bmpBytes: fakeBmpBytes,
      timeIt: fakeTimeIt,
    });

    expect(loadCount).toBe(1);
    expect(computeCount).toBe(6); // 2 sizes * 3 runs
    expect(rows).toHaveLength(2);
  });

  it("records the candidate's name, image size, bit-length, cold-start cost, and steady-state stats per row", async () => {
    const createFake = () => ({
      name: "fake-candidate",
      compute: () => ({ hash: 0, bits: 128 }),
    });

    const rows = await runComputeBenchmark({
      candidates: [createFake],
      sizes: [64],
      runs: 1,
      bmpBytes: fakeBmpBytes,
      timeIt: fakeTimeIt,
    });

    expect(rows).toEqual([
      {
        candidate: "fake-candidate",
        size: 64,
        bits: 128,
        coldStartMs: expect.any(Number),
        mean: 1,
        min: 1,
        max: 1,
      },
    ]);
  });

  it("produces one row per (candidate, size) pair, in candidate order then size order", async () => {
    const a = () => ({ name: "a", compute: () => ({ hash: 0, bits: 64 }) });
    const b = () => ({ name: "b", compute: () => ({ hash: 0, bits: 256 }) });

    const rows = await runComputeBenchmark({
      candidates: [a, b],
      sizes: [64, 512],
      runs: 1,
      bmpBytes: fakeBmpBytes,
      timeIt: fakeTimeIt,
    });

    expect(rows.map((r) => [r.candidate, r.size])).toEqual([
      ["a", 64],
      ["a", 512],
      ["b", 64],
      ["b", 512],
    ]);
  });

  it("does not mistake one candidate's bit-length for another's", async () => {
    const a = () => ({ name: "a", compute: () => ({ hash: 0, bits: 64 }) });
    const b = () => ({ name: "b", compute: () => ({ hash: 0, bits: 256 }) });

    const rows = await runComputeBenchmark({
      candidates: [a, b],
      sizes: [64],
      runs: 1,
      bmpBytes: fakeBmpBytes,
      timeIt: fakeTimeIt,
    });

    expect(rows.map((r) => r.bits)).toEqual([64, 256]);
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
      sizes: [64, 512],
      runs: 2,
      bmpBytes: fakeBmpBytes,
      timeIt: fakeTimeIt,
    });

    expect(loadCount).toBe(1);
    expect(computeCount).toBe(4); // 2 sizes * 2 runs
    expect(rows.map((r) => [r.candidate, r.size, r.bits])).toEqual([
      ["async-fake", 64, 64],
      ["async-fake", 512, 64],
    ]);
  });
});
