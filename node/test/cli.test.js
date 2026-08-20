"use strict";

// End-to-end test of the validate CLI (issue #7), wiring the real compiled
// WASM module, classify(), and a real JSON Store together — the same three
// pieces issue #7 names, run for real rather than mocked. Deliberately
// narrow: only the acceptance criteria the CLI-level "out of scope" note
// in CONTEXT.md doesn't cover (argument parsing / output formatting) —
// specifically, the New -> Exact -> persistence round trip.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { run } = require("../src/cli");
const { gradient, noise } = require("./fixtures");

let dir;
let originalCwd;
let logSpy;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "img-guard-cli-test-"));
  fs.writeFileSync(path.join(dir, "photo.png"), gradient);
  fs.writeFileSync(path.join(dir, "different.png"), noise);
  originalCwd = process.cwd();
  process.chdir(dir);
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(dir, { recursive: true, force: true });
  logSpy.mockRestore();
});

function loggedOutput() {
  return logSpy.mock.calls.map((call) => call[0]).join("\n");
}

describe("validate CLI", () => {
  it("reports New and persists an Entry the first time an image is seen", () => {
    run(["photo.png"]);

    expect(loggedOutput()).toContain("Classification: New");
    const store = JSON.parse(
      fs.readFileSync(path.join(dir, "store.json"), "utf8"),
    );
    expect(store).toHaveLength(1);
    expect(store[0].path).toBe("photo.png");
  });

  it("reports Exact on a second run of the same image, without persisting a duplicate Entry", () => {
    run(["photo.png"]);
    logSpy.mockClear();

    run(["photo.png"]);

    expect(loggedOutput()).toContain("Classification: Exact");
    const store = JSON.parse(
      fs.readFileSync(path.join(dir, "store.json"), "utf8"),
    );
    expect(store).toHaveLength(1);
  });

  it("respects --threshold: a distinct image is New by default but Similar at a high threshold", () => {
    run(["photo.png"]);
    logSpy.mockClear();

    run(["different.png"]);
    expect(loggedOutput()).toContain("Classification: New");

    fs.rmSync(path.join(dir, "store.json"));
    run(["photo.png"]);
    logSpy.mockClear();

    run(["different.png", "--threshold", "64"]);
    expect(loggedOutput()).toContain("Classification: Similar");
  });
});
