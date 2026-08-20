# img-guard

A Rust image-comparison library, exposed via WebAssembly and consumed from Node, that checks a candidate image against a store of previously-seen images and classifies it as new, an exact duplicate, or a near-duplicate.

See `CONTEXT.md` for the domain model and `docs/adr/` for design decisions.

## Usage

```bash
cd node
npm run build:wasm          # builds the WASM module into node/pkg
node src/cli.js path/to/image.jpg
```

- Run it again on the same file → `Exact`
- Run it on a similar-but-different file → `Similar` (or add `--threshold N` to tune)
- Run it on a new file → `New` (gets saved to `store.json` in your current directory)

`cd` somewhere first, or delete `store.json` between runs, if you want a clean slate.
