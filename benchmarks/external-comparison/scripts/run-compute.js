#!/usr/bin/env node
"use strict";

// Compute-axis comparison harness (issue #13): img-guard's own WASM phash,
// plus the external Node candidates (#14 `phash`, excluded — see
// benchmarks/results/notes.md; #15 `@stabilityprotocol.com/phash`; #16
// `sharp-phash`), all timed across the same synthetic image sizes
// `phash_bench.rs` and `node/scripts/benchmark.js` already use. Mirrors
// `benchmark.js`'s CLI-flag pattern and reuses its `bmpBytes` helper
// directly (rather than re-implementing it) so the two fixture generators
// can't drift apart. Timing goes through this package's own `timeIt`
// (`src/timeIt.js`), not `benchmark.js`'s — #16's `sharp-phash` is
// unavoidably async (see its candidate file's doc comment), which
// `benchmark.js`'s synchronous-only `timeIt` can't correctly measure.
//
// Usage: node scripts/run-compute.js [--sizes 64,512,2048,4096] [--runs N]

const path = require("node:path");

const { bmpBytes } = require("../../../node/scripts/benchmark.js");
const { timeIt } = require("../src/timeIt");
const { runComputeBenchmark } = require("../src/runner");
const { writeResultsFile } = require("../src/resultsFile");
const {
  createCandidate: createImgGuardCandidate,
} = require("../src/candidates/img-guard");
const {
  createCandidate: createStabilityProtocolPhashCandidate,
} = require("../src/candidates/stabilityprotocol-phash");
const {
  createCandidate: createSharpPhashCandidate,
} = require("../src/candidates/sharp-phash");

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

async function run(argv) {
  const { sizes, runs } = parseArgs(argv);

  // #14's `phash` was excluded (unbuildable on current Node — see
  // benchmarks/results/notes.md).
  const candidates = [
    createImgGuardCandidate,
    createStabilityProtocolPhashCandidate,
    createSharpPhashCandidate,
  ];

  const rows = await runComputeBenchmark({
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
  run(process.argv.slice(2)).catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = { run, parseArgs };
