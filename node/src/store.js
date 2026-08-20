"use strict";

const fs = require("node:fs");

/**
 * Opens the Store (CONTEXT.md's "Store" concept) backed by a JSON file at
 * `filePath`. Callers only ever deal in Entries — the JSON file and its
 * bigint<->string phash serialization (JSON has no bigint type) are an
 * implementation detail, kept off this interface so a later swap (e.g. to
 * SQLite) never touches callers (ADR 0001).
 *
 * @param {string} filePath
 */
function openStore(filePath) {
  function readAll() {
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const records = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return records.map((record) => ({
      ...record,
      phash: BigInt(record.phash),
    }));
  }

  function writeAll(entries) {
    const records = entries.map((entry) => ({
      ...entry,
      phash: entry.phash.toString(),
    }));
    fs.writeFileSync(filePath, JSON.stringify(records, null, 2));
  }

  return {
    /** @returns {Array<{path: string, md5: string, phash: bigint, recordedAt: string}>} */
    getEntries() {
      return readAll();
    },

    /**
     * Appends a new Entry and persists it. Stamps `recordedAt` itself when
     * the caller doesn't supply one.
     */
    addEntry({ path, md5, phash, recordedAt = new Date().toISOString() }) {
      const entries = readAll();
      entries.push({ path, md5, phash, recordedAt });
      writeAll(entries);
    },
  };
}

module.exports = { openStore };
