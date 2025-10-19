/*********************************************************************
 * src/db.ts
 *
 * Centralised SQLite wrapper for the RideWithGPS preprocessing pipeline.
 *
 * Table `rides` now stores the fields required for UI filtering:
 *   - departed_at      : TEXT   (ISO‑8601 timestamp)
 *   - distance_km     : REAL   (kilometres, 2‑decimals)
 *   - duration_min    : INTEGER (rounded minutes)
 *   - elevation_gain_m: REAL   (metres)
 *   - tags            : TEXT   (JSON‑encoded string array)
 *
 * The helper also manages a tiny `meta` key/value table for things like
 * the last‑run timestamp.
 *
 * Usage:
 *   import { Db } from "./db";
 *   const db = new Db();               // automatically creates tables
 *   await db.insertRideRow({...});      // upsert a ride
 *   const existing = db.getExistingRideIds();
 *   const lastRun = db.getMeta("last_run_ts");
 *********************************************************************/

import Database from "better-sqlite3";
import * as path from "path";

export interface RideRecord {
  id: string;                       // numeric ID as string
  bbox: string;                     // "minLng,minLat,maxLng,maxLat"
  path_full: string;                // path to *_full.geojson (may be empty)
  path_medium: string;              // path to *_medium.geojson (may be empty)
  path_coarse: string;              // path to *_coarse.geojson (may be empty)

  departed_at: string;              // ISO‑8601
  distance_km: number;              // km, 2‑decimals
  duration_min: number;             // rounded minutes
  elevation_gain_m: number;         // metres
  tags: string;                     // JSON‑encoded array (e.g. '["training"]')
}

/**
 * Small wrapper class – keeps the DB connection private and offers a
 * typed API for the rest of the codebase.
 */
export class Db {
  private readonly db: Database.Database;

  constructor(dbPath: string = path.resolve("metadata.db")) {
    this.db = new Database(dbPath);
    this.ensureSchema();
  }

  /** -----------------------------------------------------------------
   *  Create tables if they do not exist.
   * ----------------------------------------------------------------- */
  private ensureSchema(): void {
    // Main rides table – includes all filterable columns
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS rides (
        id               TEXT PRIMARY KEY,
        bbox             TEXT NOT NULL,
        path_full        TEXT,
        path_medium      TEXT,
        path_coarse      TEXT,

        departed_at      TEXT NOT NULL,
        distance_km      REAL NOT NULL,
        duration_min     INTEGER NOT NULL,
        elevation_gain_m REAL NOT NULL,
        tags             TEXT   -- JSON‑encoded array, may be NULL
      );
    `);

    // Tiny key/value store for misc meta information (e.g. last run)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  /** -----------------------------------------------------------------
   *  Return a Set of all ride IDs already stored in the DB.
   * ----------------------------------------------------------------- */
  public getExistingRideIds(): Set<string> {
    const rows = this.db.prepare("SELECT id FROM rides").all() as { id: string }[];
    return new Set(rows.map((r) => r.id));
  }

  /** -----------------------------------------------------------------
   *  Insert (or replace) a ride row.
   * ----------------------------------------------------------------- */
  public insertRideRow(record: RideRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO rides (
        id, bbox, path_full, path_medium, path_coarse,
        departed_at, distance_km, duration_min, elevation_gain_m, tags
      )
      VALUES (
        @id, @bbox, @path_full, @path_medium, @path_coarse,
        @departed_at, @distance_km, @duration_min, @elevation_gain_m, @tags
      )
      ON CONFLICT(id) DO UPDATE SET
        bbox             = excluded.bbox,
        path_full        = excluded.path_full,
        path_medium      = excluded.path_medium,
        path_coarse      = excluded.path_coarse,
        departed_at      = excluded.departed_at,
        distance_km      = excluded.distance_km,
        duration_min     = excluded.duration_min,
        elevation_gain_m = excluded.elevation_gain_m,
        tags             = excluded.tags;
    `);

    stmt.run(record);
  }

  /** -----------------------------------------------------------------
   *  Meta‑table helpers (generic key/value store)
   * ----------------------------------------------------------------- */
  public getMeta(key: string): string | undefined {
    const row = this.db
      .prepare("SELECT value FROM meta WHERE key = ?")
      .get(key) as { value: string } | undefined;
    return row?.value;
  }

  public setMeta(key: string, value: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO meta (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;
    `);
    stmt.run(key, value);
  }

  /** -----------------------------------------------------------------
   *  Close the DB connection – call when you are done.
   * ----------------------------------------------------------------- */
  public close(): void {
    this.db.close();
  }
}