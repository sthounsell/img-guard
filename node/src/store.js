"use strict";

const Database = require("better-sqlite3");

/**
 * Opens the Store (CONTEXT.md's "Store" concept) backed by a SQLite
 * database file at `filePath` (ADR 0003 — superseding v1's JSON file).
 * Callers only ever deal in Entries — the schema and the u64<->i64 bit
 * reinterpretation phash needs to fit SQLite's signed INTEGER column are an
 * implementation detail, kept off this interface (ADR 0001).
 *
 * @param {string} filePath
 */
function openStore(filePath) {
  const db = new Database(filePath);
  // Plain `number` loses precision above 2^53; phash values routinely
  // exceed that, so every integer column round-trips as a bigint instead.
  db.defaultSafeIntegers(true);

  db.exec(`
    CREATE TABLE IF NOT EXISTS entries (
      path TEXT NOT NULL,
      md5 TEXT NOT NULL UNIQUE,
      phash INTEGER NOT NULL,
      recorded_at TEXT NOT NULL
    )
  `);

  const findExactStmt = db.prepare("SELECT * FROM entries WHERE md5 = ?");
  const allStmt = db.prepare("SELECT * FROM entries ORDER BY rowid");
  const insertStmt = db.prepare(
    "INSERT INTO entries (path, md5, phash, recorded_at) VALUES (?, ?, ?, ?)",
  );

  /**
   * A u64 phash doesn't fit SQLite's signed 64-bit INTEGER column as-is —
   * `asIntN`/`asUintN` reinterpret the same 64 bits across the signed
   * boundary instead of truncating, so the round trip is lossless.
   */
  function rowToEntry(row) {
    return {
      path: row.path,
      md5: row.md5,
      phash: BigInt.asUintN(64, row.phash),
      recordedAt: row.recorded_at,
    };
  }

  return {
    /** @returns {Array<{path: string, md5: string, phash: bigint, recordedAt: string}>} */
    getEntries() {
      return allStmt.all().map(rowToEntry);
    },

    /**
     * O(1) via the `md5` column's unique index — unlike `getEntries()`,
     * doesn't materialise the rest of the Store to answer an Exact check.
     * @returns {{path: string, md5: string, phash: bigint, recordedAt: string} | null}
     */
    findExactMatch(md5) {
      const row = findExactStmt.get(md5);
      return row ? rowToEntry(row) : null;
    },

    /**
     * Appends a new Entry as a single `INSERT` — unlike the v1 JSON Store,
     * doesn't need to read and rewrite every existing Entry to persist one
     * more. Stamps `recordedAt` itself when the caller doesn't supply one.
     */
    addEntry({ path, md5, phash, recordedAt = new Date().toISOString() }) {
      insertStmt.run(path, md5, BigInt.asIntN(64, phash), recordedAt);
    },
  };
}

module.exports = { openStore };
