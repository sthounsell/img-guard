# img-guard vs. Radu's four candidates — written comparison

Prepared for Radu (issue #19), closing the loop on issue #12's benchmark ask
and ADR 0001/0002's Open Questions. Source data: the raw harness output in
this directory (`compute-axis-2026-08-27T11-35-58-501Z.md`,
`lookup-axis-2026-08-27T12-03-35-725Z.md`, `notes.md`) — this doc explains
and interprets those numbers, it doesn't re-derive them. Two earlier
`compute-axis-*.md` files (10:35, 10:52) are superseded partial runs from
before all three compute candidates were wired in; the 11:05 file is a
complete but pre-correction run, superseded by 11:35 (identical
methodology, re-run to confirm the numbers hold — they do, within normal
run-to-run noise). The 10:46 `lookup-axis-*.md` file is superseded outright
by 11:36: a post-review pass found the lookup-axis harness itself had a
measurement bug (see "Correction from the original run" below), so the
10:46 numbers aren't just old, they're wrong. 11:36 is in turn superseded by
12:03: a third lookup-axis candidate (issue #20) was added to split the
img-guard-vs-`bktree-fast` gap 11:36 reported into two attributable pieces
(see "Second correction" below) — the 11:36 two-candidate numbers weren't
wrong, just conflating two different effects into one figure.

### Correction from the original run

A code review of this harness after the first lookup-axis run found two
methodology problems, both now fixed (see `src/lookupRunner.js` and
`src/candidates/img-guard-lookup.js` for the detail):

1. **Measurement asymmetry**: img-guard's candidate generated a fresh
   random MD5 _inside_ `query()`, on every single timed call, while
   `bktree-fast`'s candidate did no equivalent per-call work. That added
   real overhead to img-guard's numbers that had nothing to do with its
   linear-scan lookup — visible at store size 0, where with nothing to
   scan img-guard was still measured ~4.5x slower than `bktree-fast`. Fixed
   by generating the query probe (`{ md5, phash }`) once per store size and
   reusing the same probe for every timed call, for both candidates.
2. **`build()` cost wasn't timed at all**, despite the original doc
   claiming it was folded into the steady-state query stats — it's
   actually excluded from every number below. Fixed by timing it
   separately; every row now reports a `build (ms)` figure alongside the
   query stats.

Below reflects the corrected run. The bottom line is unchanged — `bktree-fast`
is still meaningfully faster, and the gap still grows with store size — but
the earlier "roughly two orders of magnitude" framing overstated the size of
that gap; see the headline finding below for the corrected figure.

### Second correction: SQL overhead vs. algorithmic gap

The two-candidate comparison above still conflated two different effects
into one "`bktree-fast` beats img-guard's linear scan" number (issue #20).
img-guard's candidate goes through the real Store — every `query()` call
parses, executes, and marshals rows via `better-sqlite3`, even against an
in-memory database — while `bktree-fast` has no query layer of any kind, so
part of the reported gap was never about linear-scan-vs-BK-tree at all, it
was SQL engine overhead.

A third candidate (`plain-array-lookup.js`) isolates the two: the _same_
O(n) linear-scan algorithm as img-guard's own `classify()`, over a plain
in-memory JS array, with no SQLite/Store/query engine involved. Run through
the same harness, it splits the previously-reported figure into:

- **SQL overhead** — img-guard's SQLite-backed candidate vs. the plain-array
  candidate (same algorithm, different execution path)
- **Algorithmic gap** — the plain-array candidate vs. `bktree-fast` (same
  "no query engine" execution path, different algorithm)

At 10,000 entries, steady-state query mean: img-guard 1.770ms, plain-array
0.102ms, `bktree-fast` 0.053ms. That's **~17x** attributable to SQL
overhead and only **~2x** attributable to the algorithm itself — most of
the previously-reported "linear scan vs. BK-tree" gap was actually the cost
of going through a SQL query engine at all, not linear scan losing to a
BK-tree. See the Lookup axis section below for the full breakdown and ADR
0001/0002's updated Open Questions for what this changes.

## Headline finding

On the **compute axis**, img-guard's WASM `phash` is competitive at small
and medium image sizes but falls behind both external candidates at large
sizes (2048px+) — and all three real candidates converge on the same 64-bit
hash width, so the comparison is apples-to-apples. Steady-state compute cost
alone doesn't point at WASM overhead as the bottleneck: `sharp-phash` (a
native binding, the closest analogue to what `napi-rs` would give img-guard)
is faster per-call than img-guard above 64x64, but not by a margin that
looks like "the WASM boundary is costing us" rather than "a different,
possibly more optimised DCT implementation."

**Real-world correction (2026-08-27, issue #21)**: against Radu's actual
sample photos rather than synthetic squares, the gap against `sharp-phash`
at large sizes is bigger than the synthetic sweep suggested — 3.85x-8.31x,
not ~1.9x — and has an identified, specific cause rather than just "a
different implementation": JPEG supports shrink-on-load (decoding directly
to a downscaled image, far cheaper than full-resolution decode), which
`sharp-phash`'s libvips backend exploits and img-guard's `image`-crate
decoder structurally can't. That's a real decode-path difference a
`napi-rs` rewrite using the same crate wouldn't fix on its own — see "Real-
world images" under Compute axis below, and ADR 0002.

On the **lookup axis**, the difference is much starker and orthogonal to
WASM vs. `napi-rs` entirely: at a 10,000-entry store, `bktree-fast`'s
steady-state query mean is **~33x faster** than img-guard's own
linear-scan lookup (0.053ms vs. 1.770ms). But that combined figure
conflates two separate effects (issue #20's "Second correction" above): a
plain in-memory-array linear scan — the same algorithm as img-guard's, with
no SQLite involved — lands at 0.102ms, meaning **~17x** of the gap is SQL
query-engine overhead and only **~2x** is the linear-scan-vs-BK-tree
algorithm itself. Counting cold start + build + 100 queries together,
`bktree-fast` is **~12x faster** than img-guard overall (16.3ms vs.
198.7ms, see below), with confirmed-matching distance/threshold semantics.
Still a real, addressable bottleneck in img-guard's own Store lookup —
worth pursuing regardless of how the WASM-vs-`napi-rs` question resolves —
but the split matters for _what_ to fix: most of the win available here
comes from getting off the SQL query engine for the phash scan, not
specifically from adopting a BK-tree over a linear scan.

## Methodology

- **Fixtures**: synthetic BMP images generated by `bmpBytes()`
  (`node/scripts/benchmark.js`) — 24-bit uncompressed BITMAPINFOHEADER,
  bottom-up rows, BGR pixel order, rows padded to a 4-byte boundary. Reused
  directly rather than reimplemented, so this harness's fixtures can't drift
  from img-guard's own Criterion/`benchmark.js` baselines.
- **Compute-axis sizes**: 64x64, 512x512, 2048x2048, 4096x4096 — the same
  sweep `benches/phash_bench.rs` and `benchmark.js` already use.
- **Lookup-axis store sizes**: 0, 100, 1,000, 10,000 entries, seeded with
  `randomMd5`/`randomPhash` (`benchmark.js`) — same sweep and seeding
  approach as img-guard's own lookup benchmarking. Every query uses the
  _same_ random `{ md5, phash }` probe, generated once per store size and
  guaranteed absent from the seeded Store, so every candidate exercises a
  genuine non-hit (img-guard's full `findExactMatch` miss + phash linear
  scan; a real BK-tree miss) rather than an early Exact short-circuit — and
  so every timed call does equivalent per-call work across candidates (see
  "Correction from the original run" above for why that wasn't true of the
  first run).
- **Threshold**: 10 (CONTEXT.md's Similarity Threshold default), used for
  both img-guard's `classify()` and `bktree-fast`'s `find()`.
- **Runs**: 20 steady-state samples per (candidate, size) or (candidate,
  store size); mean/min/max reported.
- **Cold start vs. steady state**: "cold start" is the one-time cost of a
  candidate's factory call — `require()`, WASM instantiation, or (for
  `sharp-phash`) `require()` plus one throwaway warm-up call absorbing
  libvips' lazy worker-thread-pool init, which otherwise leaks into the
  first steady-state sample instead of cold start. "Steady state" is the
  mean/min/max of the timed `compute()`/`query()` calls that follow, once
  everything is already loaded/warm.
- **Machine**: one local machine (macOS arm64, Node 26; `sharp` 0.35.4 /
  libvips 8.18.6 prebuilt binaries) — not a controlled benchmark rig.
  Absolute numbers will differ elsewhere; the relative comparison between
  candidates, run under identical conditions on the same machine, is what's
  load-bearing here.
- **Build cost**: the lookup-axis harness times each store size's `build()`
  call — the one-time cost of constructing that candidate's Index at that
  size (an indexed-MD5 Store insert per entry, or a BK-tree insert per
  entry) — separately from the steady-state `query()` stats, and reports it
  as its own `build (ms)` figure per row rather than folding it into either
  cold start or the query mean. The illustrative lookup-axis total below is
  cold start + build + N queries.

## Compute axis

### Per-operation breakdown

| candidate                      | image size | bits | cold start (ms)         | mean (ms) | min (ms) | max (ms) |
| ------------------------------ | ---------- | ---- | ----------------------- | --------- | -------- | -------- |
| img-guard (WASM)               | 64x64      | 64   | 1.907                   | 0.292     | 0.057    | 3.215    |
| img-guard (WASM)               | 512x512    | 64   | 1.907                   | 1.654     | 1.616    | 1.860    |
| img-guard (WASM)               | 2048x2048  | 64   | 1.907                   | 32.723    | 32.227   | 33.740   |
| img-guard (WASM)               | 4096x4096  | 64   | 1.907                   | 144.295   | 143.298  | 149.514  |
| `phash` (npm)                  | —          | —    | — excluded, see below — |           |          |          |
| `@stabilityprotocol.com/phash` | 64x64      | 64   | 4.342                   | 2.937     | 2.710    | 4.186    |
| `@stabilityprotocol.com/phash` | 512x512    | 64   | 4.342                   | 3.287     | 3.128    | 3.716    |
| `@stabilityprotocol.com/phash` | 2048x2048  | 64   | 4.342                   | 9.826     | 9.420    | 10.599   |
| `@stabilityprotocol.com/phash` | 4096x4096  | 64   | 4.342                   | 30.265    | 29.214   | 35.091   |
| `sharp-phash`                  | 64x64      | 64   | 49.642                  | 1.370     | 1.278    | 1.559    |
| `sharp-phash`                  | 512x512    | 64   | 49.642                  | 2.537     | 2.495    | 2.647    |
| `sharp-phash`                  | 2048x2048  | 64   | 49.642                  | 21.111    | 19.301   | 44.033   |
| `sharp-phash`                  | 4096x4096  | 64   | 49.642                  | 75.237    | 73.937   | 80.464   |

### Illustrative total execution time

Cold start + 100 calls at 512x512 (a mid-range size, and 100 calls to give
per-call cost room to dominate over one-time load — a single call would
just restate the cold-start column):

| candidate                      | cold start | 100 × 512x512 calls | **total (illustrative)** |
| ------------------------------ | ---------- | ------------------- | ------------------------ |
| img-guard (WASM)               | 1.907ms    | 165.400ms           | **167.307ms**            |
| `@stabilityprotocol.com/phash` | 4.342ms    | 328.700ms           | **333.042ms**            |
| `sharp-phash`                  | 49.642ms   | 253.700ms           | **303.342ms**            |

At this size and call count, img-guard's low cold start keeps it ahead of
both externals despite a higher per-call cost than `sharp-phash`;
`sharp-phash`'s large native-binding cold start is still not fully repaid by
its per-call speed at only 100 calls. The crossover point shifts with size
and call count — see the per-operation breakdown for the full picture,
particularly at 2048/4096px where `sharp-phash` and `@stabilityprotocol.com/
phash` pull further ahead per-call.

### `phash` (npm) — excluded

Not wired in as a compute-axis candidate (issue #14): unbuildable on any
current Node.js, not an environment quirk. Its native C++ addon is written
against a pre-2015 V8 addon API that V8 removed around Node 4-6 — compiling
against Node 26 fails immediately with ~20 errors. Last published in 2013 (4
versions total, per `npm view phash`), so there's no newer release that
fixes this. Its native library dependency (`libpHash`) is also no longer
available via the Homebrew formula the package's own README points at.
Fixing both would mean forking and patching a third-party package, out of
scope for this benchmark. Full detail in `notes.md`.

This is itself a data point for the WASM-vs-`napi-rs` question: a
`napi-rs`-style native addon can bit-rot against V8/Node ABI changes in a
way img-guard's WASM boundary structurally can't — `phash` is a concrete
example of that risk materialising, twelve years after publication.

### Hash bit-length

All three candidates that actually ran produce a **64-bit hash** —
img-guard's WASM `phash` (`image_hasher`'s fixed-width u64), `sharp-phash`
(a 64-character `'0'`/`'1'` string from its own 8x8 DCT-coefficient grid),
and `@stabilityprotocol.com/phash` (a 16-hex-char string at its default
`hashSize: 8`). This parity is confirmed from each candidate's actual output
length, not assumed — issue #12 explicitly left bit-length parity as a
discover-as-we-go risk rather than a pre-implementation check, and it
happened to resolve as "no divergence" across all three. Called out
explicitly here per that Further Note, rather than silently normalized past
— had one candidate produced e.g. a 256-bit hash, its timings would not be
directly comparable to a 64-bit hash's without accounting for the extra work
per bit.

### Integration wrinkles worth knowing about

- **`@stabilityprotocol.com/phash`** only accepts already-decoded RGBA pixel
  data (`fromRgba`/`fromImageData`) — unlike img-guard's WASM `phash` and
  the excluded `phash` package, which both decode an encoded image file
  themselves. Its candidate wrapper
  (`benchmarks/external-comparison/src/candidates/stabilityprotocol-phash.js`)
  decodes the harness's BMP fixture itself before calling `fromRgba`, so
  decode cost stays inside the timed call — the same "file bytes in, hash
  out" methodology as every other candidate, not a shortcut that only times
  the DCT step.
- **`sharp-phash`** can't decode the harness's BMP fixture at all through
  its normal path: `sharp`'s standard prebuilt binary doesn't compile in
  ImageMagick/GraphicsMagick's BMP loader, so handing it the raw BMP throws
  `Input buffer contains unsupported image format`. Same fix as above — the
  wrapper decodes the fixture's specific BMP shape itself and hands `sharp`
  already-decoded raw pixel data via its `{ raw: {...} }` input mode.
  Separately, `sharp-phash` is unavoidably async (`sharp` has no synchronous
  API — every operation runs through libvips' worker-thread pool), which is
  why this harness needed its own async-aware `timeIt`
  (`src/timeIt.js`) rather than reusing `benchmark.js`'s synchronous-only
  one.

### Real-world images (2026-08-27, issue #21)

Radu supplied 4 real sample photos (real cameras — Google Pixel 10 Pro XL,
Sony ILCE-7RM5 — 4898x3265 up to 9504x6336, 2.9-52MB) to check the synthetic
sweep's findings against actual files rather than only synthetic BMP
squares up to 4096x4096. Not committed to the repo (real photos with GPS
EXIF data); run via `--images` (see "Reproducing this" below). Full numbers
in `compute-axis-2026-08-27T14-50-35-530Z.md`.

**Hash size still matches across all three candidates for every real photo**
(64-bit throughout) — the parity noted above under "Hash bit-length" isn't
an artefact of the synthetic fixture, it holds at real-world resolutions
too.

**The gap at large sizes is worse than the synthetic sweep predicted, and
now has an identified cause.** At 4096x4096 (synthetic), img-guard trailed
`sharp-phash` by ~1.9x. Against the real photos, the gap is **3.85x-8.31x**
— on Radu2 (4898x3265, fewer total pixels than the 4096x4096 synthetic
square), img-guard takes 173.181ms against `sharp-phash`'s 20.848ms.

The cause: `sharp-phash` decodes via `sharp`/libvips, and JPEG — unlike raw
pixel data — supports *shrink-on-load*: the decoder can produce a
downscaled image directly from the compressed stream at a fraction of
full-resolution decode cost, before phash's own 8x8 DCT-coefficient grid
ever needs the full pixel count. img-guard's WASM `phash` decodes via the
`image` crate, which has no equivalent fractional-decode path for
JPEG — every call pays full-resolution decode cost regardless of how much
of that detail phash actually uses. The synthetic BMP sweep couldn't surface
this at all: raw pixel data has no compressed lower-resolution
representation for *any* decoder to shrink into, so it understated
`sharp-phash`'s real-world advantage specifically on JPEG input.

**`@stabilityprotocol.com/phash`'s real-image numbers don't show the same
widening** — the gap against img-guard is actually *narrower* than
synthetic implied (2.28x-3.29x here vs. ~4.65x at 4096x4096 synthetic).
This isn't a property of the library — `fromRgba` only ever takes
pre-decoded pixels, it doesn't decode images itself — it's a property of
this harness's adapter: real images are decoded via `sharp` at full
resolution (`.raw().ensureAlpha()`, no resize) before handing pixels to
`fromRgba`, so this candidate doesn't benefit from shrink-on-load the way
`sharp-phash` does internally. Its real-image numbers reflect "full JPEG
decode via sharp, no shrink, plus a pure-JS DCT reduction" — a different
decode path from the synthetic BMP one (a cheap hand-rolled decoder with no
equivalent cost), which is why the two aren't a clean size-for-size
comparison. Worth a future ticket if `@stabilityprotocol.com/phash`'s
real-world number specifically matters to Radu's decision — pre-resizing
during the `sharp` decode step would likely close most of this gap, but
wasn't done here since it changes what's being measured (decode-to-thumbnail
cost, not "this library's real per-call cost") without a clear steer to
make that call.

| candidate                      | image                  | bits | mean (ms) |
| ------------------------------ | ----------------------- | ---- | --------- |
| img-guard (WASM)               | Radu1.jpg (4992x3136)   | 64   | 184.543   |
| img-guard (WASM)               | Radu2.jpg (4898x3265)   | 64   | 173.181   |
| img-guard (WASM)               | Radu3.jpg (9504x6336)   | 64   | 930.412   |
| img-guard (WASM)               | Radu4.jpg (9504x6336)   | 64   | 992.980   |
| `@stabilityprotocol.com/phash` | Radu1.jpg (4992x3136)   | 64   | 81.033    |
| `@stabilityprotocol.com/phash` | Radu2.jpg (4898x3265)   | 64   | 52.680    |
| `@stabilityprotocol.com/phash` | Radu3.jpg (9504x6336)   | 64   | 368.744   |
| `@stabilityprotocol.com/phash` | Radu4.jpg (9504x6336)   | 64   | 393.173   |
| `sharp-phash`                  | Radu1.jpg (4992x3136)   | 64   | 32.089    |
| `sharp-phash`                  | Radu2.jpg (4898x3265)   | 64   | 20.848    |
| `sharp-phash`                  | Radu3.jpg (9504x6336)   | 64   | 232.419   |
| `sharp-phash`                  | Radu4.jpg (9504x6336)   | 64   | 258.049   |

## Lookup axis

### Per-operation breakdown

| candidate                                   | store size | matched | distance | cold start (ms) | build (ms) | mean (ms) | min (ms) | max (ms) |
| ------------------------------------------- | ---------- | ------- | -------- | --------------- | ---------- | --------- | -------- | -------- |
| img-guard (indexed-MD5 + linear-scan-phash) | 0          | false   | —        | 8.467           | 5.232      | 0.005     | 0.001    | 0.053    |
| img-guard (indexed-MD5 + linear-scan-phash) | 100        | false   | 24       | 8.467           | 0.467      | 0.041     | 0.020    | 0.207    |
| img-guard (indexed-MD5 + linear-scan-phash) | 1000       | false   | 19       | 8.467           | 1.627      | 0.201     | 0.150    | 0.339    |
| img-guard (indexed-MD5 + linear-scan-phash) | 10000      | false   | 17       | 8.467           | 13.186     | 1.770     | 1.485    | 2.087    |
| plain array (linear-scan, no query engine)  | 0          | false   | —        | 0.039           | 0.004      | 0.002     | 0.000    | 0.021    |
| plain array (linear-scan, no query engine)  | 100        | false   | 19       | 0.039           | 0.000      | 0.004     | 0.003    | 0.009    |
| plain array (linear-scan, no query engine)  | 1000       | false   | 19       | 0.039           | 0.002      | 0.015     | 0.010    | 0.047    |
| plain array (linear-scan, no query engine)  | 10000      | false   | 15       | 0.039           | 0.001      | 0.102     | 0.035    | 0.408    |
| bktree-fast (BK-tree)                       | 0          | false   | —        | 8.767           | 0.074      | 0.002     | 0.000    | 0.033    |
| bktree-fast (BK-tree)                       | 100        | false   | —        | 8.767           | 0.037      | 0.001     | 0.001    | 0.003    |
| bktree-fast (BK-tree)                       | 1000       | false   | —        | 8.767           | 0.297      | 0.005     | 0.004    | 0.015    |
| bktree-fast (BK-tree)                       | 10000      | false   | —        | 8.767           | 2.281      | 0.053     | 0.047    | 0.096    |

Every query in this run is a genuine miss (`matched: false`) by design —
every candidate is handed the same freshly-random probe for a given store
size, never present in the seeded Store, so every candidate exercises its
real non-hit path rather than an early Exact short-circuit. img-guard and
the plain-array candidate both still report a distance on every miss
because their linear scan already visits the whole array, so the closest
distance found is free to report (CONTEXT.md's `New` definition) — the
plain-array candidate deliberately mirrors `classify()`'s scan/short-circuit
logic exactly, just over a plain array instead of the Store. `bktree-fast`
reports `—` (`null`) on every miss — see the parity/gap finding below for
why that's structural, not a data artefact.

At store size 0, with nothing to scan for any candidate, the numbers are all
sub-millisecond and dominated by per-call adapter noise rather than any real
lookup cost — not a meaningful comparison point on its own (unlike cold
start, which is where store-size-0 differences actually matter; see the
per-operation table's cold-start column).

The plain-array candidate's own cold start (0.039ms) is what the SQL
overhead figure below excludes: `require("../../../../node/pkg")` for the
WASM `hammingDistance` is effectively free, unlike img-guard's candidate
`require`-ing `better-sqlite3`'s native binding (8.467ms) or `bktree-fast`'s
own native module load (8.767ms) — both one-off costs, separate from the
steady-state SQL-overhead figure below, which is about per-query cost.

### Illustrative total execution time

Cold start + build + 100 queries at store size 1,000 (mid-range in the
sweep):

| candidate                                   | cold start | build   | 100 × queries (store size 1,000) | **total (illustrative)** |
| ------------------------------------------- | ---------- | ------- | -------------------------------- | ------------------------ |
| img-guard (indexed-MD5 + linear-scan-phash) | 8.467ms    | 1.627ms | 20.100ms                         | **30.194ms**             |
| plain array (linear-scan, no query engine)  | 0.039ms    | 0.002ms | 1.500ms                          | **1.541ms**              |
| bktree-fast (BK-tree)                       | 8.767ms    | 0.297ms | 0.500ms                          | **9.564ms**              |

The gap widens as the store grows: at store size 10,000, the same total is
**198.653ms** for img-guard (8.467ms + 13.186ms + 100 × 1.770ms), **10.240ms**
for the plain-array candidate (0.039ms + 0.001ms + 100 × 0.102ms), and
**16.348ms** for `bktree-fast` (8.767ms + 2.281ms + 100 × 0.053ms) — img-guard
to `bktree-fast` overall is **~12x**, unchanged from the two-candidate
comparison's headline figure, since cold start and one-off build cost still
dominate a 100-query illustrative total for both. Counted as steady-state
query mean alone (no cold start or build), the full img-guard-to-`bktree-fast`
gap at store size 10,000 is **~33x** (1.770ms vs. 0.053ms) — see "SQL
overhead vs. algorithmic gap" below for how that splits between the two
candidates now available. Either way, img-guard's linear scan grows roughly
linearly with store size, while the BK-tree's per-query cost barely moves,
and `build()` cost itself also grows fastest for img-guard's SQLite-backed
Index (13.186ms at 10,000 entries) — the plain array's `build()` is
essentially free (0.001ms: no index structure to construct, the array
already _is_ the data) and `bktree-fast`'s sits in between (2.281ms).

### SQL overhead vs. algorithmic gap

Steady-state query mean at each store size, three candidates:

| store size | img-guard (SQLite) | plain array | bktree-fast | SQL overhead | algorithmic gap |
| ---------- | ------------------ | ----------- | ----------- | ------------ | --------------- |
| 100        | 0.041ms            | 0.004ms     | 0.001ms     | ~10x         | ~4x             |
| 1,000      | 0.201ms            | 0.015ms     | 0.005ms     | ~13x         | ~3x             |
| 10,000     | 1.770ms            | 0.102ms     | 0.053ms     | ~17x         | ~2x             |

(Store size 0 omitted — with nothing to scan, all three candidates are
sub-millisecond and dominated by per-call adapter noise rather than any
real lookup cost, see above.)

Two consistent patterns across the sweep: **SQL overhead is the larger and
faster-growing effect** — img-guard's SQLite-backed candidate is 10-17x
slower than the plain-array candidate running the _identical_ linear-scan
algorithm, and that multiple grows with store size (more rows for
`better-sqlite3` to marshal per query). **The algorithmic gap shrinks with
store size**, from ~4x at 100 entries down to ~2x at 10,000 — the opposite
of what "BK-tree beats linear scan" would predict if algorithm were the
dominant effect; more likely, per-query fixed overhead (object/array
allocation, WASM call marshalling) is a larger fraction of the very small
absolute numbers here than genuine O(n)-vs-O(log n) traversal cost at these
store sizes. Read together: most of the previously-reported "linear scan
loses to BK-tree" gap was never really that — it was mostly the cost of
routing every phash comparison through a SQL query engine at all.

### `bktree-fast` distance/threshold parity finding

Confirmed to match img-guard's Hamming-distance Similarity Threshold before
treating results as comparable (issue #18's acceptance criterion):

- **Distance metric**: `bktree-fast`'s `distance()` (documented in its
  README as Hamming distance) was empirically verified against img-guard's
  WASM `hammingDistance` over 2,000 random 64-bit hash pairs plus the
  0/all-bits-differing edge cases — zero mismatches.
- **Threshold semantics**: `bktree-fast`'s cutoff is inclusive
  (`dist <= maxDist` in its source), matching img-guard's `distance <=
threshold` (CONTEXT.md: "maximum Hamming distance, inclusive"). A "hit" in
  one means a "hit" in the other — the two are directly comparable.

**The one real gap**: img-guard's linear scan always visits every Entry, so
even a non-hit (`New`) carries the closest distance found across the whole
Store "for free." A BK-tree's entire advantage is _not_ visiting nodes
outside the query radius, so on a non-hit there is no "closest distance"
available without an unbounded scan that would defeat the structure's
purpose — `bktree-fast` returns `null` (rendered as `—` above) on a miss,
where img-guard's own candidate still reports a closest-so-far distance.
Adopting a BK-tree for img-guard's real Store would mean giving up that
"closest distance even on New" diagnostic, which issue #1's Implementation
Decisions currently rely on for tuning the default Similarity Threshold —
worth weighing against the lookup-speed win, not a free upgrade.

## What this means for ADR 0001 / 0002

- **Compute axis**: steady-state per-call cost doesn't show WASM as an
  obvious drag — img-guard is competitive at small/medium sizes and only
  meaningfully behind at large images, where a native binding
  (`sharp-phash`) and a pure-JS library (`@stabilityprotocol.com/phash`)
  both pull ahead. That's weak evidence, at best, that switching to
  `napi-rs` would meaningfully improve compute performance — see ADR 0002.
  Real-world images (issue #21) sharpen this: the gap at large sizes is
  bigger than synthetic sizes suggested, and specifically caused by JPEG
  shrink-on-load — a decode-path capability, not a WASM-vs-native-binding
  question. Swapping WASM for `napi-rs` on the same `image` crate wouldn't
  close it; only a decoder with fractional/shrink-on-load JPEG decoding
  would.
- **Lookup axis**: img-guard's own lookup is the real bottleneck at scale,
  and it's a Node-side implementation choice, not a consequence of the
  Rust/WASM boundary at all — but issue #20's plain-array candidate shows
  most of that bottleneck (~17x of a ~33x steady-state gap at 10,000
  entries) is SQL query-engine overhead, not the linear-scan-vs-BK-tree
  algorithm (~2x). Getting off SQL for the phash scan is the larger win and
  doesn't require adopting a BK-tree at all; a BK-tree on top of that would
  add a smaller additional win, with the closest-distance-on-miss trade-off
  noted above. Either direction would help regardless of the
  WASM-vs-`napi-rs` outcome. See ADR 0001's Open Questions.

## Reproducing this

```
cd benchmarks/external-comparison
npm run benchmark:compute   # writes benchmarks/results/compute-axis-<timestamp>.md
npm run benchmark:lookup    # writes benchmarks/results/lookup-axis-<timestamp>.md
```

Both scripts accept `--sizes`/`--store-sizes` and `--runs` flags — see
`scripts/run-compute.js`/`scripts/run-lookup.js`. `run-compute.js` also
takes `--images path1.jpg,path2.jpg,...` to add real files (from anywhere
on disk — never committed to this repo) to the sweep alongside the
synthetic sizes, e.g. the "Real-world images" run above:

```
npm run benchmark:compute -- --images /path/to/Radu1.jpg,/path/to/Radu2.jpg --runs 10
```
