"use strict";

const fs = require("node:fs");
const path = require("node:path");

/**
 * Shared skeleton behind `writeResultsFile`/`writeLookupResultsFile`:
 * ensures `dir` exists, sanitises `timestamp` into a filename-safe form,
 * joins it with `filePrefix` into a checked-in, timestamped Markdown path,
 * writes `content`, and returns the path. Durable and diffable, so results
 * from different runs/days/machines can be compared later and handed to
 * Radu without re-running anything (issue #12) — the two axes' table
 * shapes aren't compatible, so each axis keeps its own row-formatting
 * function, but the write-a-timestamped-file mechanics are identical and
 * only need writing once.
 *
 * @param {string} filePrefix - e.g. "compute-axis" or "lookup-axis".
 * @param {string} content
 * @param {object} options
 * @param {string} options.dir - directory to write into (created if missing).
 * @param {string} [options.timestamp] - ISO-ish timestamp; defaults to now.
 * @returns {string} the written file's path.
 */
function writeTimestampedFile(
  filePrefix,
  content,
  { dir, timestamp = new Date().toISOString() },
) {
  fs.mkdirSync(dir, { recursive: true });

  const safeTimestamp = timestamp.replace(/[:.]/g, "-");
  const filePath = path.join(dir, `${filePrefix}-${safeTimestamp}.md`);

  fs.writeFileSync(filePath, content);
  return filePath;
}

/**
 * Writes a compute-axis results table to a checked-in, timestamped Markdown
 * file (issue #13's acceptance criteria) rather than only printing it.
 *
 * @param {Array<{candidate: string, label: string, bits: number, coldStartMs: number, mean: number, min: number, max: number}>} rows
 * @param {object} options
 * @param {string} options.dir - directory to write into (created if missing).
 * @param {string} [options.timestamp] - ISO-ish timestamp; defaults to now.
 * @returns {string} the written file's path.
 */
function writeResultsFile(rows, options) {
  const timestamp = options.timestamp ?? new Date().toISOString();

  // "image" rather than "image size" (issue #21): rows now include real
  // photos alongside synthetic squares, and a real photo's label carries a
  // filename/dimensions, not just a size.
  const header = [
    "| candidate | image | bits | cold start (ms) | mean (ms) | min (ms) | max (ms) |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];
  const dataRows = rows.map(
    (r) =>
      `| ${r.candidate} | ${r.label} | ${r.bits} | ${r.coldStartMs.toFixed(3)} | ${r.mean.toFixed(3)} | ${r.min.toFixed(3)} | ${r.max.toFixed(3)} |`,
  );

  const content = [
    "# Compute-axis benchmark results",
    "",
    `Generated ${timestamp}. See issue #12 for methodology and #13 for this harness.`,
    "",
    ...header,
    ...dataRows,
    "",
  ].join("\n");

  return writeTimestampedFile("compute-axis", content, {
    ...options,
    timestamp,
  });
}

/**
 * Writes a lookup-axis results table to a checked-in, timestamped Markdown
 * file (issue #17's acceptance criteria), in the same `benchmarks/results/`
 * directory and same durable/diffable convention as `writeResultsFile`'s
 * compute-axis output.
 *
 * @param {Array<{candidate: string, storeSize: number, coldStartMs: number, buildMs: number, distance: number|null, matched: boolean, mean: number, min: number, max: number}>} rows
 * @param {object} options
 * @param {string} options.dir - directory to write into (created if missing).
 * @param {string} [options.timestamp] - ISO-ish timestamp; defaults to now.
 * @returns {string} the written file's path.
 */
function writeLookupResultsFile(rows, options) {
  const timestamp = options.timestamp ?? new Date().toISOString();

  const header = [
    "| candidate | store size | matched | distance | cold start (ms) | build (ms) | mean (ms) | min (ms) | max (ms) |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  const dataRows = rows.map(
    (r) =>
      `| ${r.candidate} | ${r.storeSize} | ${r.matched} | ${r.distance ?? "—"} | ${r.coldStartMs.toFixed(3)} | ${r.buildMs.toFixed(3)} | ${r.mean.toFixed(3)} | ${r.min.toFixed(3)} | ${r.max.toFixed(3)} |`,
  );

  const content = [
    "# Lookup-axis benchmark results",
    "",
    `Generated ${timestamp}. See issue #12 for methodology and #17 for this harness.`,
    "",
    ...header,
    ...dataRows,
    "",
  ].join("\n");

  return writeTimestampedFile("lookup-axis", content, {
    ...options,
    timestamp,
  });
}

module.exports = { writeResultsFile, writeLookupResultsFile };
