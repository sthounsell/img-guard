"use strict";

/**
 * Classifies `candidate` against `store` as New, Exact, or Similar (see
 * CONTEXT.md's "Comparison" section for the full vocabulary).
 *
 * Pure and side-effect-free itself: no file I/O, and no WASM calls of its
 * own — `hammingDistance` is injected, and `store` only needs to implement
 * `findExactMatch`/`getEntries`, so this seam is testable against a plain
 * fake, independent of both the real Store's persistence (issue #5, ADR
 * 0003) and the WASM boundary (issue #3). The `validate` CLI (issue #7)
 * wires in the real Store and the real WASM-exposed `hammingDistance`.
 *
 * `candidate.getPhash` is a thunk, not a value: an Exact match is decided
 * from MD5 alone, so the candidate's phash — WASM work the caller would
 * otherwise have paid for up front — is only computed if the scan for
 * Similar/New actually needs it (CONTEXT.md's Exact: "distance of 0
 * without actually computing phash, since MD5 identity already guarantees
 * it").
 *
 * @param {{ md5: string, getPhash: () => * }} candidate
 * @param {{ findExactMatch: (md5: string) => object|null, getEntries: () => Array<{ path: string, md5: string, phash: *, recordedAt: string }> }} store
 * @param {number} threshold - inclusive Hamming-distance cutoff for Similar
 * @param {(a: *, b: *) => number} hammingDistance
 * @returns {{ type: "New"|"Exact"|"Similar", distance: number|null, matchedEntry: object|null }}
 */
function classify(candidate, store, threshold, hammingDistance) {
  // MD5 identity already guarantees the images are byte-identical, so this
  // short-circuits before any Hamming-distance comparison — or the phash
  // computation feeding it — runs at all. Going through the Store's own
  // indexed lookup (ADR 0003) also means the common case never has to
  // materialise every other Entry just to answer this check.
  const exactMatch = store.findExactMatch(candidate.md5);
  if (exactMatch) {
    return { type: "Exact", distance: 0, matchedEntry: exactMatch };
  }

  const candidatePhash = candidate.getPhash();
  let minDistance = null;
  for (const storeEntry of store.getEntries()) {
    const distance = hammingDistance(candidatePhash, storeEntry.phash);
    if (minDistance === null || distance < minDistance) {
      minDistance = distance;
    }
    // First qualifying entry wins — not necessarily the closest, since a
    // large Store shouldn't pay for an exhaustive scan once Similar is known.
    if (distance <= threshold) {
      return { type: "Similar", distance, matchedEntry: storeEntry };
    }
  }

  return { type: "New", distance: minDistance, matchedEntry: null };
}

module.exports = { classify };
