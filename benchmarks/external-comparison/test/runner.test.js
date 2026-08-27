"use strict";

const { runComputeBenchmark } = require("../src/runner");

/** Calls `fn` `runs` times (so call-count assertions still hold) but
 * returns fixed stats — deterministic, and keeps this suite independent of
 * `node/scripts/benchmark.js`'s real `timeIt` (issue #13's Testing
 * Decision: orchestration logic tested against fakes, not real infra). */
function fakeTimeIt(fn, runs) {
  for (let i = 0; i < runs; i += 1) fn();
  return { mean: 1, min: 1, max: 1 };
}

const fakeBmpBytes = (size) => Buffer.alloc(size);

describe("runComputeBenchmark", () => {
  it("loads each candidate once (cold start) and times compute() once per (size, run)", () => {
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

    const rows = runComputeBenchmark({
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

  it("records the candidate's name, image size, bit-length, cold-start cost, and steady-state stats per row", () => {
    const createFake = () => ({
      name: "fake-candidate",
      compute: () => ({ hash: 0, bits: 128 }),
    });

    const rows = runComputeBenchmark({
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

  it("produces one row per (candidate, size) pair, in candidate order then size order", () => {
    const a = () => ({ name: "a", compute: () => ({ hash: 0, bits: 64 }) });
    const b = () => ({ name: "b", compute: () => ({ hash: 0, bits: 256 }) });

    const rows = runComputeBenchmark({
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

  it("does not mistake one candidate's bit-length for another's", () => {
    const a = () => ({ name: "a", compute: () => ({ hash: 0, bits: 64 }) });
    const b = () => ({ name: "b", compute: () => ({ hash: 0, bits: 256 }) });

    const rows = runComputeBenchmark({
      candidates: [a, b],
      sizes: [64],
      runs: 1,
      bmpBytes: fakeBmpBytes,
      timeIt: fakeTimeIt,
    });

    expect(rows.map((r) => r.bits)).toEqual([64, 256]);
  });
});
