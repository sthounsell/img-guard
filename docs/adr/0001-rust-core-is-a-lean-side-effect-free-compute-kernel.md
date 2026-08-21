# Rust core is a lean, side-effect-free compute kernel

Status: accepted

The Rust/WASM module needs a clear boundary of responsibility between what Rust does and what Node does. We decided Rust exposes only pure, stateless functions (`md5`, `phash`, `hamming_distance`) and owns no I/O; Node owns the Store, the comparison loop, and all orchestration.

## Considered Options

- **Rust owns persistence too** (Jose's initial instinct): the WASM module reads/writes the Store itself. Rejected because it requires targeting `wasm32-wasip1` and Node's `node:wasi` module for filesystem access, which Node's own docs label experimental and explicitly warn isn't hardened for filesystem sandboxing — a meaningful cost for a learning exercise with no need for it.
- **Rust as compute kernel, Node owns I/O** (chosen): keeps Rust compiling to the simpler `wasm32-unknown-unknown` target, with no filesystem dependency at all — the sandbox enforces the architecture rather than relying on convention.

## Consequences

Swapping the Store implementation (e.g. JSON file → SQLite) never touches the Rust core or the WASM interface — borne out in practice by ADR 0003's JSON-to-SQLite switch, which only touched `node/src/store.js` and `node/src/classify.js`.

## Open Questions (2026-08-21)

This split assumes the WASM boundary from ADR 0002. If that's replaced with napi-rs, this ADR is worth revisiting too: a native addon drops the wasm sandbox that currently enforces "Rust owns no I/O" as a hard constraint rather than a convention, and it may be more performant to move the Store/comparison loop into Rust as well rather than paying Node↔Rust call overhead per operation. Not acted on — depends on ADR 0002's open question resolving first.
