# Benchmark notes

Hand-maintained notes that don't fit the harness-generated result tables
(`compute-axis-*.md`, `lookup-axis-*.md`) — findings about a candidate itself,
rather than timing data from a run. See issue #12 for methodology.

## `phash` (npm) — excluded from the compute axis (issue #14)

Not wired in as a compute-axis candidate: the package is unbuildable on any
current Node.js, and this isn't an environment quirk — it would fail
identically on any machine or in CI.

- Its native C++ addon (`phash.cpp`) is written against a pre-2015 V8 addon
  API (`Handle<Value>`, `Arguments`, `String::New`, `Persistent<Function>::New`,
  `HandleScope` without an `Isolate`) that V8 removed around Node 4-6.
  Compiling it against Node 26 fails immediately (`no member named 'New' in
  'v8::String'`, ~20 similar errors). `npm view phash versions`/`time` show
  only 4 versions ever published, the last in 2013 — there is no newer
  release that fixes this.
- Its native library dependency, `libpHash` (the `pHash` C++ library the
  addon links against via `-lpHash`), is no longer available through
  Homebrew — the `phash` formula the package's own README points at
  (`brew install phash imagemagick`) has been removed upstream. `libpHash`
  itself can still be built from source (`aetilius/pHash` on GitHub, CMake)
  — confirmed working locally — but that doesn't unblock the addon, which
  fails to compile against modern V8 regardless of whether `libpHash` is
  present.

Both issues would need fixing to get real numbers: rewriting the addon
against a current Node-API and vendoring a self-built `libpHash`, which is a
fork-and-patch of a third-party package, not "add an npm dependency" — out
of scope for this benchmark. No entry was added to
`benchmarks/external-comparison/package.json` since nothing actually
installs or builds.

This is itself a relevant data point for Radu's WASM-vs-`napi-rs` question
(ADR 0002): a `napi-rs`-style native addon can bit-rot against V8/Node ABI
changes in a way img-guard's WASM boundary structurally can't. `phash` is a
concrete example of that risk having already materialized, twelve years
after publication.

## `@stabilityprotocol.com/phash` — wired in as a compute-axis candidate (issue #15)

Pure TypeScript/JS, zero dependencies, ships both CJS and ESM builds —
installs and runs on current Node with no build step. Its default 64-bit
hash (`hashSize: 8`, the library's default) happens to match img-guard's,
so issue #12's bit-length-parity Further Note resolves as "no divergence"
for this candidate — confirmed from the actual output, not assumed.

One integration wrinkle worth recording: unlike img-guard's WASM `phash`
(which decodes an encoded image file itself) and the excluded `phash`
package (which also took encoded bytes), this library's hashing functions
(`fromRgba`/`fromImageData`) only accept already-decoded RGBA pixel data
plus width/height — it doesn't decode image files. To keep the adapter
interface (`compute(imageBytes)`) identical across candidates, the
candidate wrapper (`src/candidates/stabilityprotocol-phash.js`) decodes
the harness's synthetic BMP fixture itself before calling `fromRgba` —
decode cost stays inside the timed call, same as img-guard's WASM
candidate, so the comparison remains apples-to-apples. That decoder only
handles the exact BMP shape `bmpBytes()` produces (24-bit uncompressed
BITMAPINFOHEADER, bottom-up, BGR, row-padded) — not BMP-the-format
generally.

## `sharp-phash` — wired in as a compute-axis candidate (issue #16)

Installs and runs cleanly on this platform (macOS arm64, Node 26, `sharp`
0.35.4 / libvips 8.18.6 prebuilt binaries) — no install/build blocker like
#14's. `sharp` is only a peer dependency of `sharp-phash` (not a direct one
of its own), so it isn't hand-added to `package.json`'s `dependencies`
(per this issue's acceptance criterion — `sharp-phash` only); npm 7+'s
auto-install-peers behaviour installs it anyway, and it's pinned via the
checked-in `package-lock.json` like everything else here.

Two integration wrinkles, both documented in full in
`src/candidates/sharp-phash.js`:

- **BMP unsupported**: `sharp`'s standard prebuilt binary doesn't compile
  in ImageMagick/GraphicsMagick's BMP loader (`sharp.format.magick`'s
  input/output flags are all `false`), so handing it the harness's raw BMP
  fixture throws `Input buffer contains unsupported image format` —
  confirmed by inspecting `sharp.format` directly, not a sandbox artifact.
  Same fix as `@stabilityprotocol.com/phash` (#15): the candidate wrapper
  decodes the harness's specific BMP shape itself and hands `sharp`
  already-decoded raw pixel data via its `{ raw: { width, height,
  channels } }` input mode instead.
- **Unavoidably async**: `sharp` has no synchronous API (every operation
  runs through libvips' worker-thread pool), so `sharp-phash`'s hash
  function is Promise-based. The compute-axis adapter interface and
  runner (`src/runner.js`) were extended to `await` both the candidate
  factory and `compute()` uniformly for every candidate — a no-op for the
  synchronous ones — and a new async-capable `src/timeIt.js` replaces
  `node/scripts/benchmark.js`'s synchronous-only `timeIt` for this axis,
  since the latter can't correctly time a Promise-returning `fn` (it never
  awaits it). Left `node/scripts/benchmark.js` itself untouched — the
  compute axis is the only consumer that needed this.

Cold-start isolation (this issue's core ask): `require("sharp-phash")`
only loads cheaply, but libvips' worker-thread pool initialises lazily on
its *first real image operation*, not on `require()`. Measured directly on
this machine: a first hash call took ~7.0ms vs. ~1.3ms steady-state
(without any warm-up, a first "steady-state" call measured 5.395ms vs.
~1.3-1.7ms for the following four) — a real, reproducible first-call tax
that would otherwise land inside the 64x64 row's mean/max rather than cold
start. `createCandidate()` is itself `async` and absorbs this with one
throwaway hash call on a minimal 1x1 image before returning; the shipped
run's numbers confirm it worked — sharp-phash's cold start is 52.092ms
(require + libvips first-use init) and its 64x64 steady-state row (mean
1.362ms, min 1.237ms, max 1.555ms) shows no first-call spike.

Actual hash bit-length: 64-bit (a 64-character `'0'`/`'1'` string, from its
own fixed 8x8 DCT-coefficient grid) — matches img-guard's and
`@stabilityprotocol.com/phash`'s, confirmed from the real output rather
than assumed.

Sample numbers (20 runs, this machine,
`benchmarks/results/compute-axis-2026-08-27T11-05-20-959Z.md`): cold start
52.092ms; 64x64 mean 1.362ms; 512x512 mean 2.331ms; 2048x2048 mean
18.443ms; 4096x4096 mean 64.553ms — faster than img-guard's WASM candidate
at every size above 64x64, and faster than `@stabilityprotocol.com/phash`
at every size, but with by far the largest cold-start cost of the three
real candidates (native-binding init vs. pure-JS `require()`) — itself a
relevant data point for Radu's WASM-vs-`napi-rs` question (ADR 0002): a
native binding's one-time load cost can dominate a single-image request
even though its steady-state per-call cost is competitive.
