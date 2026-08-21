#!/usr/bin/env node
"use strict";

// Breaks a `validate`-shaped run into timed stages (issue #10), so a
// head-to-head benchmark against an external solution (e.g. the Node one
// Radu mentioned) can compare like-for-like compute time instead of being
// skewed by this process's own cold start — Node bootstrap + WASM module
// instantiation happen once per CLI invocation and aren't part of the
// actual duplicate-detection work.
//
// Usage: node scripts/benchmark.js <image-path> [--runs N]  (default N=20)

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Best-effort: elapsed time since the Node process itself started, i.e.
// includes Node's own bootstrap before this script's first line ran.
const processStartMs = process.uptime() * 1000;

function parseArgs(argv) {
  const [imagePath, ...rest] = argv;
  if (!imagePath) {
    throw new Error("Usage: benchmark.js <image-path> [--runs N]");
  }
  const runsIndex = rest.indexOf("--runs");
  const runs = runsIndex === -1 ? 20 : Number(rest[runsIndex + 1]);
  return { imagePath, runs };
}

/** Runs `fn` `runs` times, returning {mean, min, max} in milliseconds. */
function timeIt(fn, runs) {
  const samples = [];
  for (let i = 0; i < runs; i += 1) {
    const start = performance.now();
    fn();
    samples.push(performance.now() - start);
  }
  const mean = samples.reduce((sum, ms) => sum + ms, 0) / samples.length;
  return { mean, min: Math.min(...samples), max: Math.max(...samples) };
}

function formatRow(label, { mean, min, max }) {
  const pad = (n) => n.toFixed(3).padStart(9);
  return `  ${label.padEnd(32)} mean${pad(mean)}ms   min${pad(min)}ms   max${pad(max)}ms`;
}

function run(argv) {
  const { imagePath, runs } = parseArgs(argv);

  // WASM module instantiation happens on this require — timed separately
  // from process bootstrap since it's the part that varies with the
  // wasm-vs-napi-rs question (ADR 0002's open question), not just Node's
  // own startup cost.
  const wasmLoadStart = performance.now();
  const { md5, phash, hammingDistance } = require("../pkg");
  const wasmLoadMs = performance.now() - wasmLoadStart;

  const { openStore } = require("../src/store");

  const bytes = fs.readFileSync(imagePath);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "img-guard-benchmark-"));
  const store = openStore(path.join(dir, "store.db"));

  console.log(
    `img-guard benchmark — ${imagePath} (${bytes.length} bytes), ${runs} runs\n`,
  );

  console.log("Cold start (this process, once):");
  console.log(
    formatRow("node bootstrap (pre-script)", {
      mean: processStartMs,
      min: processStartMs,
      max: processStartMs,
    }),
  );
  console.log(
    formatRow("wasm module instantiation", {
      mean: wasmLoadMs,
      min: wasmLoadMs,
      max: wasmLoadMs,
    }),
  );

  console.log("\nSteady-state compute (same process, repeated):");
  const md5Timing = timeIt(() => md5(bytes), runs);
  console.log(formatRow("md5", md5Timing));

  const phashTiming = timeIt(() => phash(bytes), runs);
  console.log(formatRow("phash (decode + hash)", phashTiming));

  const hash = phash(bytes);
  const hammingTiming = timeIt(() => hammingDistance(hash, hash), runs);
  console.log(formatRow("hammingDistance", hammingTiming));

  let seq = 0;
  const addEntryTiming = timeIt(() => {
    seq += 1;
    store.addEntry({
      path: `bench-${seq}.png`,
      md5: `bench-md5-${seq}`,
      phash: hash,
    });
  }, runs);
  console.log(formatRow("store.addEntry (SQLite INSERT)", addEntryTiming));

  const findExactTiming = timeIt(
    () => store.findExactMatch("bench-md5-1"),
    runs,
  );
  console.log(formatRow(`store.findExactMatch (n=${runs})`, findExactTiming));

  const getEntriesTiming = timeIt(() => store.getEntries(), runs);
  console.log(formatRow(`store.getEntries (n=${runs})`, getEntriesTiming));

  console.log(
    "\nSingle-shot `validate`-equivalent wall time (cold start + one compute pass):",
  );
  const singleShotMs =
    processStartMs +
    wasmLoadMs +
    md5Timing.mean +
    phashTiming.mean +
    addEntryTiming.mean;
  console.log(`  ${singleShotMs.toFixed(3)}ms\n`);

  fs.rmSync(dir, { recursive: true, force: true });
}

if (require.main === module) {
  run(process.argv.slice(2));
}

module.exports = { run, parseArgs, timeIt };
