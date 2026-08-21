"use strict";

const { classify } = require("../src/classify");

function entry(overrides) {
  return {
    path: "default.png",
    md5: "md5-default",
    phash: 0,
    recordedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function candidate(md5, phash) {
  return { md5, getPhash: () => phash };
}

/** A plain in-memory fake conforming to classify()'s store interface. */
function fakeStore(entries) {
  return {
    findExactMatch: (md5) => entries.find((e) => e.md5 === md5) ?? null,
    getEntries: () => entries,
  };
}

describe("classify", () => {
  it("classifies an MD5 match as Exact with distance 0, without computing the candidate's phash, any Hamming distance, or the rest of the Store", () => {
    const hammingDistance = vi.fn();
    const getPhash = vi.fn(() => 999);
    const matching = entry({ path: "a.png", md5: "same-md5" });
    const store = {
      findExactMatch: (md5) => (md5 === "same-md5" ? matching : null),
      getEntries: () => {
        throw new Error("should not be called once an Exact match is found");
      },
    };

    const result = classify(
      { md5: "same-md5", getPhash },
      store,
      10,
      hammingDistance,
    );

    expect(result).toEqual({
      type: "Exact",
      distance: 0,
      matchedEntry: matching,
    });
    expect(getPhash).not.toHaveBeenCalled();
    expect(hammingDistance).not.toHaveBeenCalled();
  });

  it("classifies a phash within threshold (no MD5 match) as Similar", () => {
    const close = entry({ path: "close.png", md5: "other-1", phash: 5 });

    const result = classify(
      candidate("candidate-md5", 0),
      fakeStore([close]),
      10,
      (a, b) => Math.abs(a - b),
    );

    expect(result).toEqual({
      type: "Similar",
      distance: 5,
      matchedEntry: close,
    });
  });

  it("returns the first qualifying entry, not the closest, when scanning for Similar", () => {
    const first = entry({ path: "first.png", md5: "m1", phash: 8 });
    const closer = entry({ path: "closer.png", md5: "m2", phash: 1 });

    const result = classify(
      candidate("candidate-md5", 0),
      fakeStore([first, closer]),
      10,
      (a, b) => Math.abs(a - b),
    );

    expect(result.matchedEntry).toBe(first);
    expect(result.distance).toBe(8);
  });

  it("treats the threshold as inclusive", () => {
    const atThreshold = entry({ path: "at.png", md5: "m1", phash: 10 });

    const result = classify(
      candidate("candidate-md5", 0),
      fakeStore([atThreshold]),
      10,
      (a, b) => Math.abs(a - b),
    );

    expect(result.type).toBe("Similar");
  });

  it("classifies as New when nothing matches, carrying the minimum distance across the whole Store", () => {
    const far = entry({ path: "far.png", md5: "m1", phash: 50 });
    const nearer = entry({ path: "near.png", md5: "m2", phash: 20 });

    const result = classify(
      candidate("candidate-md5", 0),
      fakeStore([far, nearer]),
      10,
      (a, b) => Math.abs(a - b),
    );

    expect(result).toEqual({ type: "New", distance: 20, matchedEntry: null });
  });

  it("classifies as New with a null distance when the Store is empty", () => {
    const result = classify(
      candidate("candidate-md5", 0),
      fakeStore([]),
      10,
      () => {
        throw new Error("should not be called against an empty Store");
      },
    );

    expect(result).toEqual({ type: "New", distance: null, matchedEntry: null });
  });
});
