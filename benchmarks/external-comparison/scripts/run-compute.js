#!/usr/bin/env node
"use strict";

// Compute-axis comparison harness (issue #13): img-guard's own WASM phash,
// plus the external Node candidates (#14 `phash`, excluded — see
// benchmarks/results/notes.md; #15 `@stabilityprotocol.com/phash`; #16
// `sharp-phash`), all timed across the same synthetic image sizes
// `phash_bench.rs` and `node/scripts/benchmark.js` already use, plus any
// real image files handed in via `--images` (issue #21 — real photos are
// benchmarked from wherever they live on disk, never committed to the
// repo). Mirrors `benchmark.js`'s CLI-flag pattern and reuses its
// `bmpBytes` helper directly (rather than re-implementing it) so the two
// fixture generators can't drift apart. Timing goes through this package's
// own `timeIt` (`src/timeIt.js`), not `benchmark.js`'s — #16's
// `sharp-phash` is unavoidably async (see its candidate file's doc
// comment), which `benchmark.js`'s synchronous-only `timeIt` can't
// correctly measure.
//
// Usage: node scripts/run-compute.js [--sizes 64,512,2048,4096]
//                                     [--images path1.jpg,path2.jpg] [--runs N]

const fs = require("node:fs");
const path = require("node:path");

const { bmpBytes } = require("../../../node/scripts/benchmark.js");
const { timeIt } = require("../src/timeIt");
const { runComputeBenchmark } = require("../src/runner");
const { writeResultsFile } = require("../src/resultsFile");
const { flag, formatRow } = require("../src/cli");
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
  const imagesFlag = flag(argv, "--images", "");
  return {
    sizes: flag(argv, "--sizes", "64,512,2048,4096").split(",").map(Number),
    imagePaths: imagesFlag ? imagesFlag.split(",") : [],
    runs: Number(flag(argv, "--runs", "20")),
  };
}

/**
 * Builds the caller-owned `images` list `runComputeBenchmark` (issue #21)
 * now takes directly: the synthetic sweep, labelled the same way the
 * results table always has, followed by any real files from `--images`,
 * labelled with their filename and pixel dimensions (read via `sharp`,
 * already in the dependency tree) so a real photo's row is identifiable
 * without re-opening the file. Read failures surface immediately and
 * loudly — a typo'd `--images` path shouldn't silently produce a shorter
 * results table.
 *
 * @param {number[]} sizes
 * @param {string[]} imagePaths
 * @returns {Promise<Array<{label: string, bytes: Buffer}>>}
 */
async function buildImages(sizes, imagePaths) {
  const sharp = require("sharp");

  const synthetic = sizes.map((size) => ({
    label: `${size}x${size} (synthetic)`,
    bytes: bmpBytes(size),
  }));

  const real = [];
  for (const imagePath of imagePaths) {
    const bytes = fs.readFileSync(imagePath);
    const { width, height } = await sharp(bytes).metadata();
    real.push({
      label: `${path.basename(imagePath)} (${width}x${height})`,
      bytes,
    });
  }

  return [...synthetic, ...real];
}

async function run(argv) {
  const { sizes, imagePaths, runs } = parseArgs(argv);
  const images = await buildImages(sizes, imagePaths);

  // #14's `phash` was excluded (unbuildable on current Node — see
  // benchmarks/results/notes.md).
  const candidates = [
    createImgGuardCandidate,
    createStabilityProtocolPhashCandidate,
    createSharpPhashCandidate,
  ];

  const rows = await runComputeBenchmark({
    candidates,
    images,
    runs,
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
    console.log(formatRow(`${row.label} (${row.bits}-bit)`, row));
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

module.exports = { run, parseArgs, buildImages };
