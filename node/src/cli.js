#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { md5, phash, hammingDistance } = require("../pkg");
const { openStore } = require("./store");
const { classify } = require("./classify");
const { toValidationResult } = require("./validationResult");

const DEFAULT_THRESHOLD = 10;

/** Runs `fn` at most once, caching its result for subsequent calls. */
function memoizeOnce(fn) {
  let cached;
  let hasRun = false;
  return () => {
    if (!hasRun) {
      cached = fn();
      hasRun = true;
    }
    return cached;
  };
}

function parseArgs(argv) {
  const [imagePath, ...rest] = argv;
  if (!imagePath) {
    throw new Error("Usage: validate <image-path> [--threshold N]");
  }

  let threshold = DEFAULT_THRESHOLD;
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i] === "--threshold") {
      threshold = Number(rest[i + 1]);
      i += 1;
    }
  }

  return { imagePath, threshold };
}

function formatClassification(classification) {
  const lines = [
    `Classification: ${classification.type}`,
    `Distance: ${classification.distance === null ? "n/a" : classification.distance}`,
  ];
  if (classification.matchedEntry) {
    lines.push(
      `Matched entry: ${classification.matchedEntry.path} (recorded ${classification.matchedEntry.recordedAt})`,
    );
  }
  return lines.join("\n");
}

function run(argv) {
  const { imagePath, threshold } = parseArgs(argv);
  const bytes = fs.readFileSync(imagePath);

  // getPhash is a thunk, not a value: on an Exact match classify() never
  // calls it, so the WASM phash computation is skipped entirely rather
  // than run and then ignored (CONTEXT.md's Exact: "without actually
  // computing phash"). Memoized so persisting a New candidate below reuses
  // the same value instead of hashing the image twice.
  const getPhash = memoizeOnce(() => phash(bytes));
  const candidate = { md5: md5(bytes), getPhash };

  // v1 Store: a single JSON file in the current directory, so it's easy to
  // find and inspect by hand during development (CONTEXT.md's "Store").
  const store = openStore(path.join(process.cwd(), "store.json"));
  const classification = classify(
    candidate,
    store.getEntries(),
    threshold,
    hammingDistance,
  );

  // ValidationResult is a consumer-facing convenience view, not a
  // first-class output — it's printed alongside the full Classification
  // detail, not in place of it (CONTEXT.md's "ValidationResult").
  console.log(formatClassification(classification));
  console.log(`ValidationResult: ${toValidationResult(classification)}`);

  // Only a New candidate gets persisted — Exact/Similar are already
  // represented by the Entry that matched them.
  if (classification.type === "New") {
    store.addEntry({ path: imagePath, md5: candidate.md5, phash: getPhash() });
  }
}

if (require.main === module) {
  run(process.argv.slice(2));
}

module.exports = { run, parseArgs, formatClassification };
