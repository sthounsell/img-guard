"use strict";

/**
 * Classifies `candidate` against `storeEntries` as New, Exact, or Similar
 * (see CONTEXT.md's "Comparison" section for the full vocabulary).
 *
 * Pure and side-effect-free: no file I/O, and no WASM calls of its own —
 * `hammingDistance` is injected so this seam is testable against plain
 * fixture data, independent of both the Store's persistence (issue #5) and
 * the WASM boundary (issue #3). The `validate` CLI (issue #7) wires in the
 * real WASM-exposed `hammingDistance`.
 *
 * `candidate.getPhash` is a thunk, not a value: an Exact match is decided
 * from MD5 alone, so the candidate's phash — WASM work the caller would
 * otherwise have paid for up front — is only computed if the scan for
 * Similar/New actually needs it (CONTEXT.md's Exact: "distance of 0
 * without actually computing phash, since MD5 identity already guarantees
 * it").
 *
 * @param {{ md5: string, getPhash: () => * }} candidate
 * @param {Array<{ path: string, md5: string, phash: *, recordedAt: string }>} storeEntries
 * @param {number} threshold - inclusive Hamming-distance cutoff for Similar
 * @param {(a: *, b: *) => number} hammingDistance
 * @returns {{ type: "New"|"Exact"|"Similar", distance: number|null, matchedEntry: object|null }}
 */
function classify(candidate, storeEntries, threshold, hammingDistance) {
  // MD5 identity already guarantees the images are byte-identical, so this
  // short-circuits before any Hamming-distance comparison — or the phash
  // computation feeding it — runs at all.
  const exactMatch = storeEntries.find((entry) => entry.md5 === candidate.md5);
  if (exactMatch) {
    return { type: "Exact", distance: 0, matchedEntry: exactMatch };
  }

  const candidatePhash = candidate.getPhash();
  let minDistance = null;
  for (const storeEntry of storeEntries) {
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
