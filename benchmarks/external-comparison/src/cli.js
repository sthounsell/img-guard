"use strict";

/**
 * Shared CLI-arg helpers for `scripts/run-compute.js` and
 * `scripts/run-lookup.js` — both were copy-pasted from
 * `node/scripts/benchmark.js`'s own `parseArgs`/`formatRow` (itself the
 * origin of this `--flag value` convention), and had drifted into two
 * identical copies of `flag()` and `formatRow()` around each script's own
 * flag names. Each script still owns its own `parseArgs` (the flag names
 * and defaults differ per axis), just built on this shared `flag()`.
 */

/**
 * Reads `--name value` out of `argv`, or `fallback` if `--name` isn't
 * present.
 *
 * @param {string[]} argv
 * @param {string} name - e.g. "--runs".
 * @param {string} fallback
 * @returns {string}
 */
function flag(argv, name, fallback) {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : argv[i + 1];
}

/**
 * Formats one steady-state stats row for console output, e.g.
 * `  64x64 (64-bit)                    mean    0.331ms   min    0.138ms   max    3.745ms`.
 *
 * @param {string} label
 * @param {{mean: number, min: number, max: number}} stats
 * @returns {string}
 */
function formatRow(label, { mean, min, max }) {
  const pad = (n) => n.toFixed(3).padStart(9);
  return `  ${label.padEnd(34)} mean${pad(mean)}ms   min${pad(min)}ms   max${pad(max)}ms`;
}

module.exports = { flag, formatRow };
