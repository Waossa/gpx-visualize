/*********************************************************************
 * src/preprocess.ts
 *
 * Reads every RideWithGPS JSON file from ./original_rides/,
 * extracts the fields needed for UI filtering, computes a tight
 * bounding‑box, and upserts a row into the SQLite DB (metadata.db).
 *
 * Run with:
 *   npx ts-node src/preprocess.ts
 *
 * Prerequisite: the `original_rides/` folder must contain the JSON
 * files you obtained with `fetchRideByID`.  No GPX parsing is needed
 * here – the API already supplies the bounding‑box coordinates.
 *********************************************************************/

import { promises as fs } from "fs";
import * as path from "path";
import { Db, type RideRecord } from "./db.ts";

/* -----------------------------------------------------------------
 *  Configuration
 * ----------------------------------------------------------------- */
const ORIGINAL_RIDES_DIR = path.resolve("original_rides"); // where JSON files live
const db = new Db();                                      // creates/opens metadata.db

/* -----------------------------------------------------------------
 *  Helper: compute a bbox string from the SW/NE fields that the API
 *          already provides.  Falls back to a manual min/max scan if
 *          those fields are missing (very unlikely).
 * ----------------------------------------------------------------- */
function computeBboxFromTrip(trip: any): string {
  // Preferred: explicit SW/NE corners
  if (
    typeof trip.sw_lng === "number" &&
    typeof trip.sw_lat === "number" &&
    typeof trip.ne_lng === "number" &&
    typeof trip.ne_lat === "number"
  ) {
    return `${trip.sw_lng},${trip.sw_lat},${trip.ne_lng},${trip.ne_lat}`;
  }

  // Fallback – iterate over raw track points (if present)
  if (Array.isArray(trip.track_points) && trip.track_points.length > 0) {
    let minLng = Infinity,
      minLat = Infinity,
      maxLng = -Infinity,
      maxLat = -Infinity;

    for (const pt of trip.track_points) {
      const lng = pt.x;
      const lat = pt.y;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    return `${minLng},${minLat},${maxLng},${maxLat}`;
  }

  // If nothing works, return an empty string (the DB column is NOT NULL,
  // so callers should avoid this situation – but we keep it defensive.
  return "";
}

/* -----------------------------------------------------------------
 *  Main processing loop
 * ----------------------------------------------------------------- */
async function main(): Promise<void> {
  // -------------------------------------------------------------
  // 1️⃣ Gather all *.json files in the source folder
  // -------------------------------------------------------------
  const dirEntries = await fs.readdir(ORIGINAL_RIDES_DIR, {
    withFileTypes: true,
  });
  const jsonFiles = dirEntries
    .filter((e) => e.isFile() && e.name.endsWith(".json"))
    .map((e) => path.join(ORIGINAL_RIDES_DIR, e.name));

  console.log(`🔎 Found ${jsonFiles.length} ride JSON file(s) to process.`);

  // -------------------------------------------------------------
  // 2️⃣ Process each file
  // -------------------------------------------------------------
  for (const filePath of jsonFiles) {
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const parsed = JSON.parse(raw) as { type: string; trip: any };

      if (!parsed.trip) {
        console.warn(`⚠️  ${path.basename(filePath)} missing "trip" object – skipping`);
        continue;
      }

      const trip = parsed.trip;

      // -----------------------------------------------------------------
      // Assemble the RideRecord that matches our DB schema
      // -----------------------------------------------------------------
      const record: RideRecord = {
        id: String(trip.id),

        // Bounding box (always stored)
        bbox: computeBboxFromTrip(trip),

        // Paths to the three resolution GeoJSON files – leave empty for now.
        // You can later fill them after the geometry‑simplification step.
        path_full: "",
        path_medium: "",
        path_coarse: "",

        // ---------- Filter‑able fields ----------
        departed_at: trip.departed_at,                     // ISO‑8601 string
        distance_km: Number((trip.distance / 1000).toFixed(2)), // meters → km
        duration_min: Math.round(trip.metrics.duration / 60),      // seconds → minutes
        elevation_gain_m: Number(trip.metrics.ele_gain.toFixed(2)),
        tags: JSON.stringify(trip.tag_names ?? []),        // store as JSON string
      };

      // -----------------------------------------------------------------
      // Upsert into SQLite
      // -----------------------------------------------------------------
      db.insertRideRow(record);
      console.log(`✅ Processed ride ${record.id}`);
    } catch (err) {
      console.error(`❌ Error processing ${path.basename(filePath)}:`, err);
    }
  }

  // -------------------------------------------------------------
  // 3️⃣ Persist a "last run" timestamp (optional, useful for later runs)
  // -------------------------------------------------------------
  db.setMeta("last_run_ts", new Date().toISOString());

  // -------------------------------------------------------------
  // 4️⃣ Clean up
  // -------------------------------------------------------------
  db.close();
  console.log("🎉 All rides have been upserted into metadata.db");
}

/* -----------------------------------------------------------------
 *  Execute
 * ----------------------------------------------------------------- */
main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});