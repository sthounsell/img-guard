# img-guard

A Rust image-comparison library, exposed via WebAssembly and consumed from Node, that checks a candidate image against a store of previously-seen images and classifies it as new, an exact duplicate, or a near-duplicate.

## Language

### Persistence

**Entry**:
A record of one previously-seen image: its path/id, MD5 digest, perceptual hash (phash), and when it was recorded.
_Avoid_: Record, hash pair

**Store**:
The persistence mechanism holding all known Entries. Implemented as SQLite, with an indexed `md5` column (ADR 0003, superseding v1's JSON file); the concept itself remains storage-agnostic.
_Avoid_: "the database" / "the JSON file" (when referring to the concept rather than the current implementation)

### Comparison

**Classification**:
The outcome of comparing a candidate image against the Store: `New`, `Exact`, or `Similar`, carrying the triggering distance and the matched Entry (if any).
_Avoid_: Result, duplicate check

**New**:
A Classification outcome: no Entry in the Store matches the candidate by MD5 or by phash within the Similarity Threshold. Carries the closest distance found across the whole Store, even though it didn't cross the threshold — free to compute, since a full scan is already required to conclude New.

**Exact**:
A Classification outcome: an Entry with a matching MD5 exists — the candidate is byte-identical to a previously-seen image. Carries a distance of `0` without actually computing phash, since MD5 identity already guarantees it.
_Avoid_: Duplicate (ambiguous between Exact and Similar)

**Similar**:
A Classification outcome: no MD5 match, but an Entry exists whose phash is within the Similarity Threshold of the candidate's phash. Carries the distance and Entry that triggered it — the *first* qualifying Entry found, not necessarily the closest, since the comparison short-circuits once a match is found.

**Hamming distance**:
The count of differing bits between two phashes; the measure used to decide Similar vs. New.

_Limitation_: phash is a low-frequency summary of the image (heavy downscale + DCT), so it's blind to small, localized, high-frequency edits — e.g. a thin drawn line reduced distance to `0` (bit-identical phash) against the original despite the MD5 differing. Detecting that kind of edit would need a different/complementary algorithm, not a threshold change.

**Similarity Threshold**:
The maximum Hamming distance, inclusive, at which two images are classified as Similar. Exposed as a `--threshold` CLI flag, default `10`.

### Consumer-facing

**ValidationResult**:
A thin, optional view over Classification for consumers that only need a pass/fail signal: `Passed` (Classification is New) or `Failed` (Classification is Exact or Similar). Not a core domain concept — one example of how a consumer might use Classification, reflecting a guess at the likely use case (a live upload-validation gate) rather than a confirmed requirement. The Rust core and Node orchestration only ever deal in Classification.
