# Expose the Rust core to Node via WebAssembly

Status: accepted

Radu's brief specified WebAssembly as the delivery mechanism for the Rust core, consumed from Node via `wasm-pack --target nodejs`. We considered and rejected `napi-rs` (a native Node addon) as an alternative.

## Considered Options

- **napi-rs native addon**: would give true native speed and full `std` access (no wasm sandbox), and is the more common choice for Node-only, performance-critical Rust integrations in the wider ecosystem. Rejected because it's Node-only (needs a separately compiled binary per OS/architecture) and the brief specifically asked for WebAssembly — likely because the client's real architecture wants portability beyond Node.
- **WebAssembly via wasm-bindgen** (chosen): the same compiled artifact can run in Node, a browser, or other WASM hosts unchanged, and its sandboxing (no filesystem, no arbitrary syscalls) reinforces the side-effect-free design in ADR 0001 for free.

## Open Questions

- **Is WebAssembly a hard requirement, or a default we chose absent a stated constraint?** (raised 2026-08-21) If portability beyond Node was never actually load-bearing for the client's real use case, napi-rs's native speed may be worth the per-OS/arch build cost after all. Raised with Radu; this ADR's "accepted" status stands until he answers. Still unanswered.
- **Benchmarking** — resolved 2026-08-27, verbally, in person: Radu's four links (2026-08-21 Slack — [`phash`](https://npmx.dev/package/phash), [`@stabilityprotocol.com/phash`](https://npmx.dev/package/@stabilityprotocol.com/phash), [`bktree-fast`](https://npmx.dev/package/bktree-fast), [`sharp-phash`](https://npmx.dev/package/sharp-phash)) weren't narrowing to one named baseline — he wants img-guard benchmarked against each of the four. Simon had read the ask as "tell me which one is the baseline" and was waiting on an answer; Radu, following up this morning, indicated the four were already the answer. No single "existing Node solution" to compare against — it's a benchmark matrix across all four (`bktree-fast` is a BK-tree search structure rather than a phash implementation, so it may need pairing with one of the others rather than standing alone).
