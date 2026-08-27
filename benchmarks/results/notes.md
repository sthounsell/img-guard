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
