# Expose the Rust core to Node via WebAssembly

Status: accepted

Radu's brief specified WebAssembly as the delivery mechanism for the Rust core, consumed from Node via `wasm-pack --target nodejs`. We considered and rejected `napi-rs` (a native Node addon) as an alternative.

## Considered Options

- **napi-rs native addon**: would give true native speed and full `std` access (no wasm sandbox), and is the more common choice for Node-only, performance-critical Rust integrations in the wider ecosystem. Rejected because it's Node-only (needs a separately compiled binary per OS/architecture) and the brief specifically asked for WebAssembly — likely because the client's real architecture wants portability beyond Node.
- **WebAssembly via wasm-bindgen** (chosen): the same compiled artifact can run in Node, a browser, or other WASM hosts unchanged, and its sandboxing (no filesystem, no arbitrary syscalls) reinforces the side-effect-free design in ADR 0001 for free.

## Open Questions (2026-08-21)

Radu has been emphasising performance. Two things pending his input, not yet decided:

- **Is WebAssembly a hard requirement, or a default we chose absent a stated constraint?** If portability beyond Node was never actually load-bearing for the client's real use case, napi-rs's native speed may be worth the per-OS/arch build cost after all. Raised with Radu; this ADR's "accepted" status stands until he answers.
- **Benchmarking**: Radu mentioned an existing Node solution to the same problem. Asked him to send it over so we can benchmark img-guard against it — a concrete performance number, rather than the theoretical WASM-vs-napi-rs tradeoff above, may settle both this question and whether performance work here is even warranted.
