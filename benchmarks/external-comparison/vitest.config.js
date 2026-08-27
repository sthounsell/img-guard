"use strict";

const { defineConfig } = require("vitest/config");

// `globals: true` lets test files use describe/it/expect without importing
// the (ESM-only) "vitest" package — our test files are plain CommonJS,
// matching node/'s convention.
module.exports = defineConfig({
  test: {
    globals: true,
  },
});
