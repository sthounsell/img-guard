# img-guard

A Rust image-comparison library, exposed via WebAssembly and consumed from Node, that checks a candidate image against a store of previously-seen images and classifies it as new, an exact duplicate, or a near-duplicate.

See `CONTEXT.md` for the domain model and `docs/adr/` for design decisions.

## Usage

```bash
cd node
npm run build:wasm          # builds the WASM module into node/pkg
node src/cli.js path/to/image.jpg
node src/cli.js path/to/image.jpg --threshold 15   # optional; default is 10
```

- Run it again on the same file → `Exact`
- Run it on a similar-but-different file → `Similar` (lower `--threshold` to tighten the match, raise it to loosen)
- Run it on a new file → `New` (gets saved to `store.db`, a SQLite database, in your current directory)

`cd` somewhere first, or delete `store.db` between runs, if you want a clean slate.

## Benchmarking

```bash
cargo bench                                        # decode vs. hash-compute split, across image sizes
cd node && npm run benchmark path/to/image.jpg      # cold start vs. steady-state compute breakdown
```

The Node benchmark separates Node bootstrap + WASM module instantiation (paid once per CLI invocation) from the actual md5/phash/Store work, so a head-to-head against another solution compares like-for-like compute rather than being skewed by process startup.
