# Rust core is a lean, side-effect-free compute kernel

Status: accepted

The Rust/WASM module needs a clear boundary of responsibility between what Rust does and what Node does. We decided Rust exposes only pure, stateless functions (`md5`, `phash`, `hamming_distance`) and owns no I/O; Node owns the Store, the comparison loop, and all orchestration.

## Considered Options

- **Rust owns persistence too** (Jose's initial instinct): the WASM module reads/writes the Store itself. Rejected because it requires targeting `wasm32-wasip1` and Node's `node:wasi` module for filesystem access, which Node's own docs label experimental and explicitly warn isn't hardened for filesystem sandboxing — a meaningful cost for a learning exercise with no need for it.
- **Rust as compute kernel, Node owns I/O** (chosen): keeps Rust compiling to the simpler `wasm32-unknown-unknown` target, with no filesystem dependency at all — the sandbox enforces the architecture rather than relying on convention.

## Consequences

Swapping the Store implementation (e.g. JSON file → SQLite) never touches the Rust core or the WASM interface.
