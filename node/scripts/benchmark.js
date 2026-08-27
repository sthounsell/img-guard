#!/usr/bin/env node
"use strict";

// Breaks a `validate`-shaped run into timed stages (issue #10), so a
// head-to-head benchmark against an external solution (e.g. the Node one
// Radu mentioned) can compare like-for-like compute time instead of being
// skewed by this process's own cold start — Node bootstrap + WASM module
// instantiation happen once per CLI invocation and aren't part of the
// actual duplicate-detection work.
//
// Two sweeps, since neither a single small image nor an empty Store is
// representative:
//   - image size, since phash cost grows with it (cargo bench covers the
//     decode-vs-hash split within that; this covers the WASM-call-and-up cost)
//   - existing Store size, since classify()'s Similar/New path scans every
//     Entry — this is the "how does looking up existing images perform"
//     question a small demo run doesn't answer.
//
// Usage: node scripts/benchmark.js [--image path] [--sizes 64,512,2048,4096]
//                                  [--store-sizes 0,100,1000,10000] [--runs N]

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

// Best-effort: elapsed time since the Node process itself started, i.e.
// includes Node's own bootstrap before this script's first line ran.
const processStartMs = process.uptime() * 1000;

function parseArgs(argv) {
  const flag = (name, fallback) => {
    const i = argv.indexOf(name);
    return i === -1 ? fallback : argv[i + 1];
  };
  const intList = (s) => s.split(",").map(Number);

  return {
    imagePath: flag("--image", null),
    sizes: intList(flag("--sizes", "64,512,2048,4096")),
    storeSizes: intList(flag("--store-sizes", "0,100,1000,10000")),
    runs: Number(flag("--runs", "20")),
  };
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
  return `  ${label.padEnd(34)} mean${pad(mean)}ms   min${pad(min)}ms   max${pad(max)}ms`;
}

/**
 * A `size`x`size` 24-bit BMP of a diagonal gradient — uncompressed, so it's
 * cheap to generate by hand in plain JS with no image-encoding dependency
 * (unlike PNG, which would need zlib deflate + CRC32 framing). `image`
 * (img-guard's Rust dependency) decodes BMP out of the box. Mirrors the
 * fixture shape the Criterion bench (`benches/phash_bench.rs`) uses, so
 * the two sweeps are measuring comparable inputs.
 */
function bmpBytes(size) {
  const rowSize = Math.ceil((size * 3) / 4) * 4; // rows pad to a 4-byte boundary
  const pixelDataSize = rowSize * size;
  const buf = Buffer.alloc(14 + 40 + pixelDataSize);

  buf.write("BM", 0, "ascii");
  buf.writeUInt32LE(buf.length, 2);
  buf.writeUInt32LE(14 + 40, 10); // pixel data offset

  buf.writeUInt32LE(40, 14); // DIB header size (BITMAPINFOHEADER)
  buf.writeInt32LE(size, 18); // width
  buf.writeInt32LE(size, 22); // height (positive = bottom-up)
  buf.writeUInt16LE(1, 26); // colour planes
  buf.writeUInt16LE(24, 28); // bits per pixel
  buf.writeUInt32LE(pixelDataSize, 34);

  let offset = 54;
  for (let y = size - 1; y >= 0; y -= 1) {
    for (let x = 0; x < size; x += 1) {
      const v = Math.floor(((x + y) * 255) / (size * 2));
      buf[offset] = v; // BMP pixel order is BGR
      buf[offset + 1] = v;
      buf[offset + 2] = v;
      offset += 3;
    }
    offset += rowSize - size * 3; // row padding
  }

  return buf;
}

/** A random hex string the same shape as an md5 digest, for seed Entries. */
function randomMd5() {
  return crypto.randomBytes(16).toString("hex");
}

function randomPhash() {
  return crypto.randomBytes(8).readBigUInt64BE();
}

function benchmarkImageSizes({ sizes, imagePath, runs, md5, phash }) {
  console.log(`\nSteady-state compute by image size (${runs} runs each):`);
  const images = sizes.map((size) => ({
    label: `${size}x${size} (synthetic)`,
    bytes: bmpBytes(size),
  }));
  if (imagePath) {
    images.push({
      label: path.basename(imagePath),
      bytes: fs.readFileSync(imagePath),
    });
  }

  for (const { label, bytes } of images) {
    console.log(`  ${label} — ${bytes.length} bytes`);
    console.log(
      formatRow(
        "md5",
        timeIt(() => md5(bytes), runs),
      ),
    );
    console.log(
      formatRow(
        "phash (decode + hash)",
        timeIt(() => phash(bytes), runs),
      ),
    );
  }
}

/**
 * The gap a small demo run can't show: how findExactMatch, getEntries, and
 * a full classify() scan perform once the Store already holds a realistic
 * number of previously-seen images, not just the handful a quick sanity
 * check adds during the run itself.
 */
function benchmarkStoreSizes({
  storeSizes,
  runs,
  openStore,
  classify,
  phash,
  hammingDistance,
}) {
  console.log(
    `\nStore lookup cost by existing Store size (${runs} runs each):`,
  );

  const candidatePhash = phash(bmpBytes(64));

  for (const size of storeSizes) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "img-guard-benchmark-"));
    const store = openStore(path.join(dir, "store.db"));

    let lastMd5 = null;
    for (let i = 0; i < size; i += 1) {
      lastMd5 = randomMd5();
      store.addEntry({
        path: `seed-${i}.png`,
        md5: lastMd5,
        phash: randomPhash(),
      });
    }

    console.log(`  Store size: ${size}`);
    console.log(
      formatRow(
        "findExactMatch (hit)",
        timeIt(() => store.findExactMatch(lastMd5 ?? randomMd5()), runs),
      ),
    );
    console.log(
      formatRow(
        "findExactMatch (miss)",
        timeIt(() => store.findExactMatch(randomMd5()), runs),
      ),
    );
    console.log(
      formatRow(
        "getEntries (full fetch)",
        timeIt(() => store.getEntries(), runs),
      ),
    );
    console.log(
      formatRow(
        "classify() as New (full scan)",
        timeIt(
          () =>
            classify(
              { md5: randomMd5(), getPhash: () => candidatePhash },
              store,
              10,
              hammingDistance,
            ),
          runs,
        ),
      ),
    );

    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function run(argv) {
  const { imagePath, sizes, storeSizes, runs } = parseArgs(argv);

  // WASM module instantiation happens on this require — timed separately
  // from process bootstrap since it's the part that varies with the
  // wasm-vs-napi-rs question (ADR 0002's open question), not just Node's
  // own startup cost.
  const wasmLoadStart = performance.now();
  const { md5, phash, hammingDistance } = require("../pkg");
  const wasmLoadMs = performance.now() - wasmLoadStart;

  const { openStore } = require("../src/store");
  const { classify } = require("../src/classify");

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

  benchmarkImageSizes({ sizes, imagePath, runs, md5, phash });
  benchmarkStoreSizes({
    storeSizes,
    runs,
    openStore,
    classify,
    phash,
    hammingDistance,
  });
}

if (require.main === module) {
  run(process.argv.slice(2));
}

module.exports = { run, parseArgs, timeIt, bmpBytes, randomMd5, randomPhash };
