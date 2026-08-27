#!/usr/bin/env node
"use strict";

// Compute-axis comparison harness (issue #13): img-guard's own WASM phash,
// plus the external Node candidates future tickets add (#14-#16), all
// timed across the same synthetic image sizes `phash_bench.rs` and
// `node/scripts/benchmark.js` already use. Mirrors `benchmark.js`'s
// CLI-flag pattern and reuses its `bmpBytes`/`timeIt` helpers directly
// (rather than re-implementing them) so the two fixture generators can't
// drift apart.
//
// Usage: node scripts/run-compute.js [--sizes 64,512,2048,4096] [--runs N]

const path = require("node:path");

const { bmpBytes, timeIt } = require("../../../node/scripts/benchmark.js");
const { runComputeBenchmark } = require("../src/runner");
const { writeResultsFile } = require("../src/resultsFile");
const {
  createCandidate: createImgGuardCandidate,
} = require("../src/candidates/img-guard");

function parseArgs(argv) {
  const flag = (name, fallback) => {
    const i = argv.indexOf(name);
    return i === -1 ? fallback : argv[i + 1];
  };
  return {
    sizes: flag("--sizes", "64,512,2048,4096").split(",").map(Number),
    runs: Number(flag("--runs", "20")),
  };
}

function formatRow(label, { mean, min, max }) {
  const pad = (n) => n.toFixed(3).padStart(9);
  return `  ${label.padEnd(34)} mean${pad(mean)}ms   min${pad(min)}ms   max${pad(max)}ms`;
}

function run(argv) {
  const { sizes, runs } = parseArgs(argv);

  // One candidate for now (issue #13 scaffolds the harness + img-guard's
  // own baseline only); #14-#16 append phash, @stabilityprotocol.com/phash,
  // and sharp-phash here once their adapters land.
  const candidates = [createImgGuardCandidate];

  const rows = runComputeBenchmark({
    candidates,
    sizes,
    runs,
    bmpBytes,
    timeIt,
  });

  console.log(`Compute-axis benchmark (${runs} runs each):`);
  let lastCandidate = null;
  for (const row of rows) {
    if (row.candidate !== lastCandidate) {
      console.log(
        `\n${row.candidate} — cold start ${row.coldStartMs.toFixed(3)}ms`,
      );
      lastCandidate = row.candidate;
    }
    console.log(formatRow(`${row.size}x${row.size} (${row.bits}-bit)`, row));
  }

  const resultsDir = path.join(__dirname, "..", "..", "results");
  const filePath = writeResultsFile(rows, { dir: resultsDir });
  console.log(`\nResults written to ${path.relative(process.cwd(), filePath)}`);
}

if (require.main === module) {
  run(process.argv.slice(2));
}

module.exports = { run, parseArgs };
