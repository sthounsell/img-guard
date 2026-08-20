"use strict";

const { defineConfig } = require("vitest/config");

// `globals: true` lets test files use describe/it/expect without importing
// the (ESM-only) "vitest" package — our test files are plain CommonJS to
// match the wasm-pack `--target nodejs` output they `require()`.
module.exports = defineConfig({
  test: {
    globals: true,
  },
});
