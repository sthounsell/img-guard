# Expose the Rust core to Node via WebAssembly

Status: accepted

Radu's brief specified WebAssembly as the delivery mechanism for the Rust core, consumed from Node via `wasm-pack --target nodejs`. We considered and rejected `napi-rs` (a native Node addon) as an alternative.

## Considered Options

- **napi-rs native addon**: would give true native speed and full `std` access (no wasm sandbox), and is the more common choice for Node-only, performance-critical Rust integrations in the wider ecosystem. Rejected because it's Node-only (needs a separately compiled binary per OS/architecture) and the brief specifically asked for WebAssembly — likely because the client's real architecture wants portability beyond Node.
- **WebAssembly via wasm-bindgen** (chosen): the same compiled artifact can run in Node, a browser, or other WASM hosts unchanged, and its sandboxing (no filesystem, no arbitrary syscalls) reinforces the side-effect-free design in ADR 0001 for free.
