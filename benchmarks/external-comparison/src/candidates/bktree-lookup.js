"use strict";

/**
 * Wraps `bktree-fast`'s native BK-tree — a search structure, not a phash
 * algorithm (issue #12's Implementation Decisions, confirmed with Radu) —
 * to the lookup-axis adapter interface, so it's timed by the same runner
 * and results table as img-guard's own `classify()` lookup path, with no
 * per-candidate special-casing in the runner itself (issue #18).
 *
 * Distance/threshold semantics confirmed to match img-guard's Hamming
 * -distance Similarity Threshold (issue #18's acceptance criterion) before
 * treating results as comparable:
 *  - `bktree-fast`'s `distance()` is documented (its README: "the only
 *    distance metric it supports is the Hamming distance ... the number of
 *    bits that differ between them") and was empirically verified against
 *    img-guard's WASM `hammingDistance` over 2,000 random 64-bit hash pairs
 *    plus the 0/all-bits-differing edge cases — zero mismatches.
 *  - `bktree-fast`'s cutoff is inclusive (its `base.js`: `if (dist <=
 *    maxDist)`), matching img-guard's `distance <= threshold`
 *    (CONTEXT.md's Similarity Threshold: "maximum Hamming distance,
 *    inclusive"). A "hit" in one means a "hit" in the other.
 *
 * One capability gap this surfaces, not a semantics mismatch: img-guard's
 * linear scan always visits every Entry, so even a non-hit ("New") carries
 * the closest distance found across the whole Store. A BK-tree's entire
 * advantage is *not* visiting nodes outside the query radius, so on a
 * non-hit there is no "closest distance" available without an unbounded
 * scan that would defeat the structure's purpose — `distance` is `null`
 * here on a non-hit, unlike img-guard's own candidate, which still reports
 * a closest-so-far distance.
 *
 * `build(entries)` constructs a fresh `BKTree(64)` per call — img-guard's
 * phash is a 64-bit hash (`node/scripts/benchmark.js`'s `randomPhash` reads
 * `crypto.randomBytes(8)`) — and inserts every entry's phash as a
 * zero-padded 16-char hex string, `bktree-fast`'s required key shape;
 * mirroring `img-guard-lookup.js`'s in-memory-per-call Store, since the
 * generic lookup-axis adapter has no cleanup hook.
 *
 * Not unit-tested (issue #17/#18's Testing Decision, mirroring
 * `img-guard-lookup.js`): this is the real native BK-tree, exercised only
 * by actually running the benchmark.
 */
function toHex(phash) {
  return phash.toString(16).padStart(16, "0");
}

function createCandidate() {
  const BKTree = require("bktree-fast");

  return {
    name: "bktree-fast (BK-tree)",

    build(entries) {
      const tree = new BKTree(64);
      for (const entry of entries) {
        tree.add(toHex(entry.phash));
      }
      return tree;
    },

    query(tree, candidateHash, threshold) {
      // find() prunes the tree to only the nodes within `threshold` and
      // returns them sorted ascending by distance, so [0] is the closest
      // qualifying match — unlike img-guard's candidate, which returns the
      // *first* qualifying entry a linear scan happens to reach.
      const found = tree.find(toHex(candidateHash), threshold);
      if (found.length === 0) {
        return { distance: null, matched: false };
      }
      return { distance: found[0].distance, matched: true };
    },
  };
}

module.exports = { createCandidate };
