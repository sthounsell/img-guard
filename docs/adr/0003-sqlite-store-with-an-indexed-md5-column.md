# Switch the Store from a JSON file to SQLite, with an indexed md5 column

Status: accepted

v1 (issue #1) scoped the Store to a single JSON file, explicitly leaving SQLite out of scope, with ADR 0001 noting a later swap was expected not to touch the Rust core or the WASM interface. Radu has been pushing on performance, and a review surfaced two concrete problems with the JSON Store: `addEntry` re-reads and re-parses the entire file only to rewrite it whole again for one new row (`node/src/store.js`, pre-ADR-0003), and Exact-match lookup was a linear scan through an array that had to be fully materialised first (`node/src/classify.js`). We're switching now rather than waiting, since both scale with Store size and Radu's benchmark ask made that concrete.

## Considered Options

- **Keep JSON, add an in-memory Map for md5 lookups** (the first idea raised): would fix the Exact-match scan but not the read-whole/rewrite-whole cost of `addEntry`, and hand-rolls what a real index gives for free.
- **SQLite via `better-sqlite3`** (chosen): a `path TEXT, md5 TEXT UNIQUE, phash INTEGER, recorded_at TEXT` table. `addEntry` becomes a single `INSERT`. The `UNIQUE` index on `md5` gives Exact-match lookup an indexed `SELECT ... WHERE md5 = ?` instead of a linear scan.
- **Node's built-in `node:sqlite`**: avoids adding a dependency, but its stability guarantees vary by Node version, and CI currently pins Node 22 — not worth the version-compatibility risk for a dependency-count saving. `better-sqlite3` is a mature, synchronous-API package that matches the Store's existing sync style, with prebuilt binaries so `npm install` doesn't need a native compile step.

## Schema notes

- **`md5 TEXT UNIQUE`**: every stored Entry has a distinct md5 by construction (only `New` candidates get persisted, and `New` already means no Exact match exists), so `UNIQUE` is a correctness constraint as well as what makes the Exact-match lookup indexed.
- **`phash INTEGER`, stored via signed/unsigned bit reinterpretation**: SQLite's `INTEGER` is a signed 64-bit type; a u64 phash can exceed that range. `store.js` round-trips it losslessly with `BigInt.asIntN(64, phash)` on write and `BigInt.asUintN(64, row.phash)` on read — a reinterpretation of the same 64 bits, not a truncation. `better-sqlite3`'s `defaultSafeIntegers(true)` is required alongside this so the driver hands back `bigint` instead of `number`, which would silently lose precision above 2^53.
- **No index on `phash`, deliberately**: Hamming distance isn't an operator SQLite (or any B-tree index) can accelerate — a Similar/New classification still has to compare the candidate's phash against every stored Entry, same O(n) cost as the old JSON array scan. Indexing `phash` would add write overhead for no read benefit. A sublinear approach (e.g. a BK-tree over the phash space) is future work if the Store grows large enough for the linear scan itself to matter — not needed for this exercise's scale.
- **`classify()`'s interface changed** (`node/src/classify.js`): it now takes a `store`-like object (`findExactMatch(md5)`, `getEntries()`) instead of a raw entries array, so the Exact path can use the indexed lookup without the caller first materialising the whole Store. `classify()` stays pure and testable against a plain fake object — the persistence/WASM decoupling issue #5 and #3 established still holds, just through a slightly richer interface than a bare array.

## Consequences

- `getEntries()` (used for the Similar/New scan) is still O(n) — this ADR doesn't change that complexity class, it removes the *extra*, avoidable O(n) work `addEntry` and the Exact path used to pay on top of it.
- The Store interface itself (`getEntries`, `addEntry`, now also `findExactMatch`) stays stable if the persistence layer changes again later (ADR 0001's original point).
