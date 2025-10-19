// src/db.ts
import Database from "better-sqlite3";
import * as path from "path";

/**
 * Wrapper around the SQLite DB that already holds the ride manifest.
 * Adjust `DB_PATH` if your DB lives somewhere else (e.g. public/metadata.db).
 */
const DB_PATH = path.resolve(process.cwd(), "metadata.db"); // <-- change if needed
const db = new Database(DB_PATH);

/* --------------------------------------------------------------
 * 1️⃣ Ensure the tables we need exist.
 * -------------------------------------------------------------- */
db.exec(`
  CREATE TABLE IF NOT EXISTS rides (
    id TEXT PRIMARY KEY,
    bbox TEXT,
    path_full TEXT,
    path_medium TEXT,
    path_coarse TEXT
  );

  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

/* --------------------------------------------------------------
 * 2️⃣ Public helpers
 * -------------------------------------------------------------- */

/** Return a Set of all ride IDs that already exist in the DB */
export function getExistingRideIds(): Set<string> {
  const rows = db.prepare("SELECT id FROM rides").all() as { id: string }[];
  return new Set(rows.map(r => r.id));
}

/** Insert a new ride row (you’ll call this after you have processed the GPX). */
export function insertRideRow(
  id: string,
  bbox: string,
  fullPath: string,
  mediumPath: string,
  coarsePath: string
): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO rides (id, bbox, path_full, path_medium, path_coarse)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(id, bbox, fullPath, mediumPath, coarsePath);
}

/** Get a stored meta value (e.g. last_run_ts). Returns undefined if missing. */
export function getMeta(key: string): string | undefined {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

/** Set a meta value (overwrites if it already exists). */
export function setMeta(key: string, value: string): void {
  const stmt = db.prepare(`
    INSERT INTO meta (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);
  stmt.run(key, value);
}