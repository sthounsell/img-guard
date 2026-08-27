"use strict";

const globals = require("globals");

module.exports = [
  {
    ignores: ["node_modules/**"],
  },
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        ...globals.node,
        // Vitest's `globals: true` (vitest.config.js) injects a Jest-shaped
        // API into every test file without an import.
        ...globals.jest,
        vi: "readonly",
      },
    },
    rules: {
      "no-unused-vars": "error",
    },
  },
];
