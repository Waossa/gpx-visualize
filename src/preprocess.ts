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

/* --------------------------------------------------------------
 *  Geometry helpers – Douglas‑Peucker simplification
 * -------------------------------------------------------------- */
import simplify from "simplify-js";

/**
 * Convert the `track_points` array (which contains objects like
 * `{ x: lon, y: lat }`) into a simple `[lon, lat][]` coordinate list.
 *
 * If the ride does not contain `track_points` we return `null`
 * – the caller can decide to skip that ride or fetch the GPX later.
 */
function extractCoordinates(trip: any): [number, number][] | null {
  if (!Array.isArray(trip.track_points) || trip.track_points.length === 0) {
    return null;
  }
  // The API already gives us lon/lat in the `x`/`y` fields.
  return trip.track_points.map((pt: any) => [pt.x, pt.y] as [number, number]);
}

/**
 * Write a single GeoJSON `FeatureCollection` that contains **one**
 * `LineString` feature. Returns the absolute path of the written file.
 */
async function writeGeoJSON(
  rideId: string,
  coords: [number, number][],
  suffix: "full" | "medium" | "coarse",
  outDir: string
): Promise<string> {
  const feature = {
    type: "Feature",
    properties: {}, // you could add name/date here if you like
    geometry: {
      type: "LineString",
      coordinates: coords,
    },
  };

  const fc = {
    type: "FeatureCollection",
    features: [feature],
  };

  const fileName = `${rideId}_${suffix}.geojson`;
  const filePath = path.join(outDir, fileName);
  await fs.writeFile(filePath, JSON.stringify(fc, null, 2), "utf8");
  return filePath;
}

function cleanCoordinates(raw: any[]): [number, number][] {
  const cleaned: [number, number][] = [];

  for (const pt of raw) {
    let lon: number | undefined;
    let lat: number | undefined;

    // -------------------------------------------------
    // Detect the shape we received
    // -------------------------------------------------
    if (Array.isArray(pt) && pt.length >= 2) {
      // Pair form: [lon, lat]
      lon = Number(pt[0]);
      lat = Number(pt[1]);
    } else if (pt && typeof pt === "object") {
      // Object form: {x:…, y:…}
      lon = Number(pt.x);
      lat = Number(pt.y);
    } else {
      // Anything else – skip
      continue;
    }

    // -------------------------------------------------
    // Throw away NaN / null / undefined values
    // -------------------------------------------------
    if (Number.isNaN(lon) || Number.isNaN(lat)) continue;

    // -------------------------------------------------
    // Skip exact duplicates of the previous point
    // -------------------------------------------------
    const last = cleaned[cleaned.length - 1];
    if (last && last[0] === lon && last[1] === lat) continue;

    cleaned.push([lon, lat]);
  }

  return cleaned;
}
/**
 * Compute a *dynamic* tolerance (in degrees) that scales with the
 * geographic spread of the track. This prevents the “two‑point” collapse
 * for short tracks.
 *
 *   - `targetMeters` is the desired simplification resolution.
 *   - We approximate 1° ≈ 111 km at the equator → 0.001° ≈ 111 m.
 *   - For higher latitudes we shrink the tolerance proportionally.
 */
function toleranceForResolution(
  coords: [number, number][],
  targetMeters: number
): number {
  if (coords.length === 0) return 0;

  // Compute the bounding box of the track
  let minLon = Infinity,
    maxLon = -Infinity,
    minLat = Infinity,
    maxLat = -Infinity;
  for (const [lon, lat] of coords) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  // Approximate degree‑to‑meter conversion at the track’s centroid latitude
  const centerLat = (minLat + maxLat) / 2;
  const metersPerDegreeLat = 111_132; // fairly constant
  const metersPerDegreeLon = 111_320 * Math.cos((centerLat * Math.PI) / 180);

  // Choose the smaller conversion factor (worst‑case) to stay safe
  const metersPerDegree = Math.min(metersPerDegreeLat, metersPerDegreeLon);

  // Convert target meters → degrees
  const toleranceDeg = targetMeters / metersPerDegree;

  // Clamp to a reasonable upper bound (we never want > 0.01° ≈ 1 km)
  return Math.min(toleranceDeg, 0.01);
}

/**
 * Run RDP safely. If the result would contain ≤ 2 points we return the
 * original coordinate list (so the map always has a usable line).
 */
function safeSimplify(
  coords: [number, number][],
  toleranceDeg: number
): [number, number][] {
  if (coords.length <= 2) return coords; // nothing to simplify

  // Convert to the shape simplify‑js expects
  const points = coords.map(([lon, lat]) => ({ x: lon, y: lat }));
  const simplified = simplify(points, toleranceDeg, false);
  const result = simplified.map(p => [p.x, p.y] as [number, number]);

  // Guard against pathological two‑point output
  return result.length > 2 ? result : coords;
}

/* --------------------------------------------------------------
 *  Generate the three resolution GeoJSON files
 * -------------------------------------------------------------- */
async function generateResolutionFiles(
  rideId: string,
  trip: any,
  outDir: string
): Promise<{
  fullPath: string;
  mediumPath: string;
  coarsePath: string;
}> {
  // 1️⃣ Extract & clean raw coordinates
  const rawCoords = extractCoordinates(trip); // returns raw `track_points` array
  if (!rawCoords) {
    // No geometry – return empty placeholders (front‑end will get 404)
    return { fullPath: "", mediumPath: "", coarsePath: "" };
  }
  const cleaned = cleanCoordinates(rawCoords);
  if (cleaned.length === 0) {
    return { fullPath: "", mediumPath: "", coarsePath: "" };
  }


  // 2️⃣ Full resolution – no simplification
  const fullPath = await writeGeoJSON(rideId, cleaned, "full", outDir);

  // 3️⃣ Medium resolution (~10 m)
  const tolMedium = toleranceForResolution(cleaned, 10); // 10 m target
  const mediumCoords = safeSimplify(cleaned, tolMedium);
  const mediumPath = await writeGeoJSON(rideId, mediumCoords, "medium", outDir);

  // 4️⃣ Coarse resolution (~100 m)
  const tolCoarse = toleranceForResolution(cleaned, 100); // 100 m target
  const coarseCoords = safeSimplify(cleaned, tolCoarse);
  const coarsePath = await writeGeoJSON(rideId, coarseCoords, "coarse", outDir);

  return {
    fullPath: path.relative(process.cwd(), fullPath),
    mediumPath: path.relative(process.cwd(), mediumPath),
    coarsePath: path.relative(process.cwd(), coarsePath),
  };
}
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

      // Inside your processing loop, after you have `trip` parsed:
      const rideId = String(trip.id);
      
      // -----------------------------------------------------------------
      // 1️⃣ Generate the three GeoJSON files (full / medium / coarse)
      // -----------------------------------------------------------------
      const processedDir = path.resolve("processed"); // <-- make sure this folder exists
      await fs.mkdir(processedDir, { recursive: true });
      
      const { fullPath, mediumPath, coarsePath } = await generateResolutionFiles(
        rideId,
        trip,
        processedDir
      );
      
      // -----------------------------------------------------------------
      // 2️⃣ Build the RideRecord (including the newly‑generated paths)
      // -----------------------------------------------------------------
      const record: RideRecord = {
        id: rideId,
      
        // Bounding box (always stored)
        bbox: computeBboxFromTrip(trip),
      
        // Paths to the three resolution GeoJSON files (now real!)
        path_full: fullPath,      // e.g. "processed/331424522_full.geojson"
        path_medium: mediumPath,
        path_coarse: coarsePath,
      
        // ---------- Filter‑able fields ----------
        departed_at: trip.departed_at,                     // ISO‑8601 string
        distance_km: Number((trip.distance / 1000).toFixed(2)), // meters → km
        duration_min: Math.round(trip.metrics.duration / 60),      // seconds → minutes
        elevation_gain_m: Number(trip.metrics.ele_gain.toFixed(2)),
        tags: JSON.stringify(trip.tag_names ?? []),        // store as JSON string
      };
      
      // -----------------------------------------------------------------
      // 3️⃣ Upsert into SQLite
      // -----------------------------------------------------------------
      db.insertRideRow(record);
      console.log(`✅ Processed ride ${rideId}`);
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