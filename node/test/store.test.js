"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { openStore } = require("../src/store");

let dir;
let storePath;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "img-guard-store-test-"));
  storePath = path.join(dir, "store.db");
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("openStore", () => {
  it("returns no Entries when the database file doesn't exist yet", () => {
    const store = openStore(storePath);
    expect(store.getEntries()).toEqual([]);
  });

  it("appends a new Entry and persists it, with phash as a bigint", () => {
    const store = openStore(storePath);

    store.addEntry({
      path: "b.png",
      md5: "md5-b",
      phash: 42n,
      recordedAt: "2026-01-02T00:00:00.000Z",
    });

    expect(store.getEntries()).toEqual([
      {
        path: "b.png",
        md5: "md5-b",
        phash: 42n,
        recordedAt: "2026-01-02T00:00:00.000Z",
      },
    ]);
  });

  it("round-trips a phash in the top half of the u64 range without precision loss", () => {
    // Exercises the signed/unsigned 64-bit reinterpretation store.js does to
    // fit a u64 phash into SQLite's signed INTEGER column: values at or
    // above 2^63 are exactly the ones that'd silently lose precision (or
    // round-trip wrong) if that reinterpretation were off by a sign.
    const store = openStore(storePath);
    const maxU64 = 18446744073709551615n;

    store.addEntry({ path: "max.png", md5: "md5-max", phash: maxU64 });

    expect(store.getEntries()[0].phash).toBe(maxU64);
  });

  it("appends to existing Entries rather than overwriting them", () => {
    const store = openStore(storePath);
    store.addEntry({
      path: "first.png",
      md5: "md5-1",
      phash: 1n,
      recordedAt: "2026-01-01T00:00:00.000Z",
    });
    store.addEntry({
      path: "second.png",
      md5: "md5-2",
      phash: 2n,
      recordedAt: "2026-01-02T00:00:00.000Z",
    });

    expect(store.getEntries().map((entry) => entry.path)).toEqual([
      "first.png",
      "second.png",
    ]);
  });

  it("stamps recordedAt itself when the caller doesn't supply one", () => {
    const store = openStore(storePath);
    store.addEntry({ path: "c.png", md5: "md5-c", phash: 7n });

    const [saved] = store.getEntries();
    expect(saved.recordedAt).toEqual(expect.any(String));
    expect(() => new Date(saved.recordedAt).toISOString()).not.toThrow();
  });

  describe("addEntries", () => {
    it("appends every given Entry in one transaction", () => {
      const store = openStore(storePath);

      store.addEntries([
        {
          path: "first.png",
          md5: "md5-1",
          phash: 1n,
          recordedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          path: "second.png",
          md5: "md5-2",
          phash: 2n,
          recordedAt: "2026-01-02T00:00:00.000Z",
        },
      ]);

      expect(store.getEntries()).toEqual([
        {
          path: "first.png",
          md5: "md5-1",
          phash: 1n,
          recordedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          path: "second.png",
          md5: "md5-2",
          phash: 2n,
          recordedAt: "2026-01-02T00:00:00.000Z",
        },
      ]);
    });

    it("stamps recordedAt itself when an entry doesn't supply one", () => {
      const store = openStore(storePath);
      store.addEntries([{ path: "c.png", md5: "md5-c", phash: 7n }]);

      const [saved] = store.getEntries();
      expect(saved.recordedAt).toEqual(expect.any(String));
    });

    it("rolls back entirely if one insert in the batch fails", () => {
      const store = openStore(storePath);

      expect(() =>
        store.addEntries([
          { path: "a.png", md5: "dup", phash: 1n },
          { path: "b.png", md5: "dup", phash: 2n }, // violates the md5 UNIQUE constraint
        ]),
      ).toThrow();

      expect(store.getEntries()).toEqual([]);
    });
  });

  describe("close", () => {
    it("closes the underlying connection so further use throws", () => {
      const store = openStore(storePath);
      store.close();

      expect(() => store.getEntries()).toThrow();
    });
  });

  describe("findExactMatch", () => {
    it("returns null when no Entry has the given md5", () => {
      const store = openStore(storePath);
      store.addEntry({ path: "a.png", md5: "md5-a", phash: 1n });

      expect(store.findExactMatch("no-such-md5")).toBeNull();
    });

    it("returns the matching Entry via the md5 index, without a full scan", () => {
      const store = openStore(storePath);
      store.addEntry({
        path: "a.png",
        md5: "md5-a",
        phash: 1n,
        recordedAt: "2026-01-01T00:00:00.000Z",
      });
      store.addEntry({
        path: "b.png",
        md5: "md5-b",
        phash: 2n,
        recordedAt: "2026-01-02T00:00:00.000Z",
      });

      expect(store.findExactMatch("md5-b")).toEqual({
        path: "b.png",
        md5: "md5-b",
        phash: 2n,
        recordedAt: "2026-01-02T00:00:00.000Z",
      });
    });
  });
});
