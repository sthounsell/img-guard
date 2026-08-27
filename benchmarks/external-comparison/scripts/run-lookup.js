#!/usr/bin/env node
"use strict";

// Lookup-axis comparison harness (issue #17): img-guard's own classify()
// lookup path (indexed-MD5 + linear-scan-phash), plus bktree-fast once a
// future ticket adds its adapter, timed across the same Store-size sweep
// `node/scripts/benchmark.js` already uses. Mirrors run-compute.js's
// CLI-flag pattern and reuses benchmark.js's randomMd5/randomPhash/timeIt
// helpers directly (rather than re-implementing them) so the two harnesses'
// seeding/timing approaches can't drift apart.
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
const {
  createCandidate: createImgGuardCandidate,
} = require("../src/candidates/img-guard-lookup");

function parseArgs(argv) {
  const flag = (name, fallback) => {
    const i = argv.indexOf(name);
    return i === -1 ? fallback : argv[i + 1];
  };
  return {
    storeSizes: flag("--store-sizes", "0,100,1000,10000")
      .split(",")
      .map(Number),
    runs: Number(flag("--runs", "20")),
    threshold: Number(flag("--threshold", "10")),
  };
}

function formatRow(label, { mean, min, max }) {
  const pad = (n) => n.toFixed(3).padStart(9);
  return `  ${label.padEnd(34)} mean${pad(mean)}ms   min${pad(min)}ms   max${pad(max)}ms`;
}

function run(argv) {
  const { storeSizes, runs, threshold } = parseArgs(argv);

  // One candidate for now (issue #17 scaffolds the harness + img-guard's
  // own baseline only); a future ticket appends bktree-fast here once its
  // adapter lands.
  const candidates = [createImgGuardCandidate];

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
      formatRow(`store size ${row.storeSize} (matched=${row.matched})`, row),
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
