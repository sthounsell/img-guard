"use strict";

const { runLookupBenchmark } = require("../src/lookupRunner");

/** Calls `fn` `runs` times (so call-count assertions still hold) but
 * returns fixed stats plus `fn`'s own last return value — deterministic,
 * and keeps this suite independent of `node/scripts/benchmark.js`'s real
 * `timeIt` (issue #17's Testing Decision: orchestration logic tested
 * against fakes, not the real Store). */
function fakeTimeIt(fn, runs) {
  let value;
  for (let i = 0; i < runs; i += 1) value = fn();
  return { mean: 1, min: 1, max: 1, value };
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

  it("records the candidate's name, store size, cold-start/build cost, query outcome, and steady-state stats per row", () => {
    const createFake = () => ({
      name: "fake-candidate",
      build: () => "the-index",
      query: (index, probe, threshold) => {
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
        buildMs: expect.any(Number),
        distance: 3,
        matched: true,
        mean: 1,
        min: 1,
        max: 1,
      },
    ]);
  });

  it("generates the probe once per store size and passes the same probe into every timed query() call", () => {
    const probesSeen = [];
    const createFake = () => ({
      name: "fake",
      build: () => "the-index",
      query: (index, probe) => {
        probesSeen.push(probe);
        return { distance: null, matched: false };
      },
    });

    runLookupBenchmark({
      candidates: [createFake],
      storeSizes: [0, 10],
      runs: 3,
      threshold: 10,
      randomMd5: fakeRandomMd5,
      randomPhash: fakeRandomPhash,
      timeIt: fakeTimeIt,
    });

    expect(probesSeen).toHaveLength(6); // 2 store sizes * 3 runs
    // Every probe within a store size's 3 runs is the exact same object.
    expect(new Set(probesSeen.slice(0, 3)).size).toBe(1);
    expect(new Set(probesSeen.slice(3, 6)).size).toBe(1);
    // Each probe carries both an md5 and a phash.
    for (const probe of probesSeen) {
      expect(probe).toEqual({
        md5: expect.any(String),
        phash: expect.any(Number),
      });
    }
  });

  it("times build() separately from query(), reporting both", () => {
    const createFake = () => ({
      name: "fake",
      build: (entries) => entries.length,
      query: () => ({ distance: null, matched: false }),
    });

    const rows = runLookupBenchmark({
      candidates: [createFake],
      storeSizes: [0],
      runs: 1,
      threshold: 10,
      randomMd5: fakeRandomMd5,
      randomPhash: fakeRandomPhash,
      timeIt: fakeTimeIt,
    });

    expect(rows[0].buildMs).toEqual(expect.any(Number));
    expect(rows[0].buildMs).not.toBe(rows[0].coldStartMs);
  });

  it("calls close() once per candidate, after its whole store-size sweep, when the candidate provides one", () => {
    let closeCount = 0;
    let queryCountAtClose = null;
    let queryCount = 0;
    const createFake = () => ({
      name: "fake",
      build: () => null,
      query: () => {
        queryCount += 1;
        return { distance: null, matched: false };
      },
      close: () => {
        closeCount += 1;
        queryCountAtClose = queryCount;
      },
    });

    runLookupBenchmark({
      candidates: [createFake],
      storeSizes: [0, 10],
      runs: 2,
      threshold: 10,
      randomMd5: fakeRandomMd5,
      randomPhash: fakeRandomPhash,
      timeIt: fakeTimeIt,
    });

    expect(closeCount).toBe(1);
    expect(queryCountAtClose).toBe(4); // all queries ran before close()
  });

  it("doesn't require a candidate to provide close()", () => {
    const createFake = () => ({
      name: "fake",
      build: () => null,
      query: () => ({ distance: null, matched: false }),
    });

    expect(() =>
      runLookupBenchmark({
        candidates: [createFake],
        storeSizes: [0],
        runs: 1,
        threshold: 10,
        randomMd5: fakeRandomMd5,
        randomPhash: fakeRandomPhash,
        timeIt: fakeTimeIt,
      }),
    ).not.toThrow();
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
