"use strict";

const { runLookupBenchmark } = require("../src/lookupRunner");

/** Calls `fn` `runs` times (so call-count assertions still hold) but
 * returns fixed stats — deterministic, and keeps this suite independent of
 * `node/scripts/benchmark.js`'s real `timeIt` (issue #17's Testing
 * Decision: orchestration logic tested against fakes, not the real Store). */
function fakeTimeIt(fn, runs) {
  for (let i = 0; i < runs; i += 1) fn();
  return { mean: 1, min: 1, max: 1 };
}

let seedCounter;
const fakeRandomMd5 = () => `md5-${(seedCounter += 1)}`;
const fakeRandomPhash = () => (seedCounter += 1);

describe("runLookupBenchmark", () => {
  beforeEach(() => {
    seedCounter = 0;
  });

  it("loads each candidate once (cold start) and builds a fresh Index once per store size", () => {
    let loadCount = 0;
    let buildCount = 0;
    let queryCount = 0;
    const createFake = () => {
      loadCount += 1;
      return {
        name: "fake",
        build: (entries) => {
          buildCount += 1;
          return entries.length;
        },
        query: (index) => {
          queryCount += 1;
          return { distance: index, matched: index === 0 };
        },
      };
    };

    const rows = runLookupBenchmark({
      candidates: [createFake],
      storeSizes: [0, 100],
      runs: 3,
      threshold: 10,
      randomMd5: fakeRandomMd5,
      randomPhash: fakeRandomPhash,
      timeIt: fakeTimeIt,
    });

    expect(loadCount).toBe(1);
    expect(buildCount).toBe(2); // one per store size
    expect(queryCount).toBe(6); // 2 store sizes * 3 runs
    expect(rows).toHaveLength(2);
  });

  it("seeds build() with exactly `storeSize` entries, each carrying a path/md5/phash", () => {
    const seededSizes = [];
    const createFake = () => ({
      name: "fake",
      build: (entries) => {
        seededSizes.push(entries.length);
        for (const entry of entries) {
          expect(entry).toEqual({
            path: expect.any(String),
            md5: expect.any(String),
            phash: expect.any(Number),
          });
        }
        return null;
      },
      query: () => ({ distance: null, matched: false }),
    });

    runLookupBenchmark({
      candidates: [createFake],
      storeSizes: [0, 5, 20],
      runs: 1,
      threshold: 10,
      randomMd5: fakeRandomMd5,
      randomPhash: fakeRandomPhash,
      timeIt: fakeTimeIt,
    });

    expect(seededSizes).toEqual([0, 5, 20]);
  });

  it("records the candidate's name, store size, cold-start cost, query outcome, and steady-state stats per row", () => {
    const createFake = () => ({
      name: "fake-candidate",
      build: () => "the-index",
      query: (index, candidateHash, threshold) => {
        expect(index).toBe("the-index");
        expect(threshold).toBe(7);
        return { distance: 3, matched: true };
      },
    });

    const rows = runLookupBenchmark({
      candidates: [createFake],
      storeSizes: [100],
      runs: 1,
      threshold: 7,
      randomMd5: fakeRandomMd5,
      randomPhash: fakeRandomPhash,
      timeIt: fakeTimeIt,
    });

    expect(rows).toEqual([
      {
        candidate: "fake-candidate",
        storeSize: 100,
        coldStartMs: expect.any(Number),
        distance: 3,
        matched: true,
        mean: 1,
        min: 1,
        max: 1,
      },
    ]);
  });

  it("produces one row per (candidate, storeSize) pair, in candidate order then storeSize order", () => {
    const a = () => ({
      name: "a",
      build: () => null,
      query: () => ({ distance: 0, matched: false }),
    });
    const b = () => ({
      name: "b",
      build: () => null,
      query: () => ({ distance: 0, matched: false }),
    });

    const rows = runLookupBenchmark({
      candidates: [a, b],
      storeSizes: [0, 100],
      runs: 1,
      threshold: 10,
      randomMd5: fakeRandomMd5,
      randomPhash: fakeRandomPhash,
      timeIt: fakeTimeIt,
    });

    expect(rows.map((r) => [r.candidate, r.storeSize])).toEqual([
      ["a", 0],
      ["a", 100],
      ["b", 0],
      ["b", 100],
    ]);
  });

  it("does not mistake one candidate's query outcome for another's", () => {
    const a = () => ({
      name: "a",
      build: () => null,
      query: () => ({ distance: 1, matched: true }),
    });
    const b = () => ({
      name: "b",
      build: () => null,
      query: () => ({ distance: null, matched: false }),
    });

    const rows = runLookupBenchmark({
      candidates: [a, b],
      storeSizes: [0],
      runs: 1,
      threshold: 10,
      randomMd5: fakeRandomMd5,
      randomPhash: fakeRandomPhash,
      timeIt: fakeTimeIt,
    });

    expect(rows.map((r) => [r.matched, r.distance])).toEqual([
      [true, 1],
      [false, null],
    ]);
  });
});
