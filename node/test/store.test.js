"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { openStore } = require("../src/store");

let dir;
let storePath;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "img-guard-store-test-"));
  storePath = path.join(dir, "store.json");
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("openStore", () => {
  it("returns no Entries when the JSON file doesn't exist yet", () => {
    const store = openStore(storePath);
    expect(store.getEntries()).toEqual([]);
  });

  it("loads all existing Entries from the JSON file, with phash as a bigint", () => {
    fs.writeFileSync(
      storePath,
      JSON.stringify([
        { path: "a.png", md5: "md5-a", phash: "12345678901234567890", recordedAt: "2026-01-01T00:00:00.000Z" },
      ]),
    );

    const store = openStore(storePath);

    expect(store.getEntries()).toEqual([
      { path: "a.png", md5: "md5-a", phash: 12345678901234567890n, recordedAt: "2026-01-01T00:00:00.000Z" },
    ]);
  });

  it("appends a new Entry and persists it to the JSON file", () => {
    const store = openStore(storePath);

    store.addEntry({ path: "b.png", md5: "md5-b", phash: 42n, recordedAt: "2026-01-02T00:00:00.000Z" });

    expect(store.getEntries()).toEqual([
      { path: "b.png", md5: "md5-b", phash: 42n, recordedAt: "2026-01-02T00:00:00.000Z" },
    ]);
    const onDisk = JSON.parse(fs.readFileSync(storePath, "utf8"));
    expect(onDisk).toEqual([
      { path: "b.png", md5: "md5-b", phash: "42", recordedAt: "2026-01-02T00:00:00.000Z" },
    ]);
  });

  it("appends to existing Entries rather than overwriting them", () => {
    const store = openStore(storePath);
    store.addEntry({ path: "first.png", md5: "md5-1", phash: 1n, recordedAt: "2026-01-01T00:00:00.000Z" });
    store.addEntry({ path: "second.png", md5: "md5-2", phash: 2n, recordedAt: "2026-01-02T00:00:00.000Z" });

    expect(store.getEntries().map((entry) => entry.path)).toEqual(["first.png", "second.png"]);
  });

  it("stamps recordedAt itself when the caller doesn't supply one", () => {
    const store = openStore(storePath);
    store.addEntry({ path: "c.png", md5: "md5-c", phash: 7n });

    const [saved] = store.getEntries();
    expect(saved.recordedAt).toEqual(expect.any(String));
    expect(() => new Date(saved.recordedAt).toISOString()).not.toThrow();
  });
});
