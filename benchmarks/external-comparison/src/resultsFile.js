"use strict";

const fs = require("node:fs");
const path = require("node:path");

/**
 * Writes a compute-axis results table to a checked-in, timestamped Markdown
 * file (issue #13's acceptance criteria) rather than only printing it —
 * durable and diffable, so results from different runs/days/machines can be
 * compared later and handed to Radu without re-running anything (issue #12).
 *
 * @param {Array<{candidate: string, size: number, bits: number, coldStartMs: number, mean: number, min: number, max: number}>} rows
 * @param {object} options
 * @param {string} options.dir - directory to write into (created if missing).
 * @param {string} [options.timestamp] - ISO-ish timestamp; defaults to now.
 * @returns {string} the written file's path.
 */
function writeResultsFile(rows, { dir, timestamp = new Date().toISOString() }) {
  fs.mkdirSync(dir, { recursive: true });

  const safeTimestamp = timestamp.replace(/[:.]/g, "-");
  const filePath = path.join(dir, `compute-axis-${safeTimestamp}.md`);

  const header = [
    "| candidate | image size | bits | cold start (ms) | mean (ms) | min (ms) | max (ms) |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];
  const dataRows = rows.map(
    (r) =>
      `| ${r.candidate} | ${r.size}x${r.size} | ${r.bits} | ${r.coldStartMs.toFixed(3)} | ${r.mean.toFixed(3)} | ${r.min.toFixed(3)} | ${r.max.toFixed(3)} |`,
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

  fs.writeFileSync(filePath, content);
  return filePath;
}

module.exports = { writeResultsFile };
