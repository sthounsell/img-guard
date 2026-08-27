#!/usr/bin/env node
"use strict";

// Lookup-axis comparison harness (issue #17): img-guard's own classify()
// lookup path (indexed-MD5 + linear-scan-phash), a plain in-memory-array
// linear scan with no query engine at all (issue #20, isolating SQL
// overhead from algorithmic gap), and bktree-fast's native BK-tree (issue
// #18) — timed across the same Store-size sweep `node/scripts/benchmark.js`
// already uses. Mirrors run-compute.js's CLI-flag pattern and reuses
// benchmark.js's randomMd5/randomPhash/timeIt helpers directly (rather
// than re-implementing them) so the two harnesses' seeding/timing
// approaches can't drift apart.
//
// Usage: node scripts/run-lookup.js [--store-sizes 0,100,1000,10000]
//                                    [--runs N] [--threshold N]

const path = require("node:path");

const {
  randomMd5,
  randomPhash,
  timeIt,
} = require("../../../node/scripts/benchmark.js");
const { runLookupBenchmark } = require("../src/lookupRunner");
const { writeLookupResultsFile } = require("../src/resultsFile");
const { flag, formatRow } = require("../src/cli");
const {
  createCandidate: createImgGuardCandidate,
} = require("../src/candidates/img-guard-lookup");
const {
  createCandidate: createBktreeCandidate,
} = require("../src/candidates/bktree-lookup");
const {
  createCandidate: createPlainArrayCandidate,
} = require("../src/candidates/plain-array-lookup");

function parseArgs(argv) {
  return {
    storeSizes: flag(argv, "--store-sizes", "0,100,1000,10000")
      .split(",")
      .map(Number),
    runs: Number(flag(argv, "--runs", "20")),
    threshold: Number(flag(argv, "--threshold", "10")),
  };
}

function run(argv) {
  const { storeSizes, runs, threshold } = parseArgs(argv);

  // img-guard first (SQLite-backed), then the plain-array control (same
  // algorithm, no query engine), then bktree-fast (different algorithm,
  // no query engine either) — reading down the results table traces the
  // gap from "SQL overhead" through to "algorithmic gap" (issue #20).
  const candidates = [
    createImgGuardCandidate,
    createPlainArrayCandidate,
    createBktreeCandidate,
  ];

  const rows = runLookupBenchmark({
    candidates,
    storeSizes,
    runs,
    threshold,
    randomMd5,
    randomPhash,
    timeIt,
  });

  console.log(
    `Lookup-axis benchmark (${runs} runs each, threshold ${threshold}):`,
  );
  let lastCandidate = null;
  for (const row of rows) {
    if (row.candidate !== lastCandidate) {
      console.log(
        `\n${row.candidate} — cold start ${row.coldStartMs.toFixed(3)}ms`,
      );
      lastCandidate = row.candidate;
    }
    console.log(
      `${formatRow(`store size ${row.storeSize} (matched=${row.matched})`, row)}   build${row.buildMs.toFixed(3).padStart(9)}ms`,
    );
  }

  const resultsDir = path.join(__dirname, "..", "..", "results");
  const filePath = writeLookupResultsFile(rows, { dir: resultsDir });
  console.log(`\nResults written to ${path.relative(process.cwd(), filePath)}`);
}

if (require.main === module) {
  run(process.argv.slice(2));
}

module.exports = { run, parseArgs };
