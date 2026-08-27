"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  writeResultsFile,
  writeLookupResultsFile,
} = require("../src/resultsFile");

// Basic smoke check only (issue #13's Testing Decision) — there's no
// correctness property to assert about a results file's exact prose, only
// that running the harness durably produces one.
describe("writeResultsFile", () => {
  it("writes a timestamped file into the given directory and returns its path", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "img-guard-results-"));

    try {
      const filePath = writeResultsFile(
        [
          {
            candidate: "fake",
            size: 64,
            bits: 64,
            coldStartMs: 1.2345,
            mean: 1,
            min: 0.5,
            max: 2,
          },
        ],
        { dir, timestamp: "2026-08-27T00-00-00" },
      );

      expect(fs.existsSync(filePath)).toBe(true);
      expect(path.dirname(filePath)).toBe(dir);
      expect(fs.readFileSync(filePath, "utf8")).toContain("fake");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// Basic smoke check only (issue #17's Testing Decision, mirroring #13's) —
// there's no correctness property to assert about a results file's exact
// prose, only that running the harness durably produces one.
describe("writeLookupResultsFile", () => {
  it("writes a timestamped file into the given directory and returns its path", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "img-guard-results-"));

    try {
      const filePath = writeLookupResultsFile(
        [
          {
            candidate: "fake",
            storeSize: 100,
            coldStartMs: 1.2345,
            buildMs: 0.789,
            distance: 3,
            matched: true,
            mean: 1,
            min: 0.5,
            max: 2,
          },
        ],
        { dir, timestamp: "2026-08-27T00-00-00" },
      );

      expect(fs.existsSync(filePath)).toBe(true);
      expect(path.dirname(filePath)).toBe(dir);
      expect(fs.readFileSync(filePath, "utf8")).toContain("fake");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
