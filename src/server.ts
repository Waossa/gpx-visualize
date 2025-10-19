/*******************************************************************
 * src/server.ts – Minimal Express API that reads rides from metadata.db
 *
 * Endpoints
 * ----------
 * GET /api/rides
 *   Query parameters (all optional):
 *     - bbox=minLng,minLat,maxLng,maxLat   (viewport filter)
 *     - departedAfter=ISO‑date
 *     - departedBefore=ISO‑date
 *     - minDistance=km
 *     - maxDistance=km
 *     - minDuration=minutes
 *     - maxDuration=minutes
 *     - minElevation=meters
 *     - maxElevation=meters
 *     - tags=tag1,tag2,…                 (ride must contain ALL tags)
 *
 *   Returns: JSON array of rides (id, name, departed_at, distance_km,
 *            duration_min, elevation_gain_m, tags, bbox, and URLs to the
 *            three GeoJSON resolutions).
 *
 * GET /api/ride/:id/:resolution
 *   resolution = full | medium | coarse
 *   Returns: redirect (302) to the static file in ./processed/
 *
 * Static folder
 * --------------
 *   ./processed/  <-- contains <id>_full.geojson, <id>_medium.geojson,
 *                     <id>_coarse.geojson
 *
 ******************************************************************/

import express, { type Request, type Response } from "express";
import cors from "cors";
import path from "path";
import { Db, type RideRecord } from "./db.ts";

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

// Allow the front‑end (which may be served from another port) to call us
app.use(cors());

// -----------------------------------------------------------------
// Helper: build a WHERE clause from the incoming query parameters
// -----------------------------------------------------------------
function buildWhereClause(q: any): { sql: string; params: any[] } {
  const clauses: string[] = [];
  const params: any[] = [];

  // 1️⃣ BBOX (viewport) – rides whose bbox intersects the view
  if (q.bbox) {
    const [minLng, minLat, maxLng, maxLat] = q.bbox
      .split(",")
      .map(Number);
    // Simple intersection test: ride.bbox overlaps view bbox
    clauses.push(`NOT (bbox_max_lng < ? OR bbox_min_lng > ? OR bbox_max_lat < ? OR bbox_min_lat > ?)`);
    params.push(minLng, maxLng, minLat, maxLat);
  }

  // 2️⃣ Date range
  if (q.departedAfter) {
    clauses.push(`departed_at >= ?`);
    params.push(q.departedAfter);
  }
  if (q.departedBefore) {
    clauses.push(`departed_at <= ?`);
    params.push(q.departedBefore);
  }

  // 3️⃣ Numeric ranges
  if (q.minDistance) {
    clauses.push(`distance_km >= ?`);
    params.push(Number(q.minDistance));
  }
  if (q.maxDistance) {
    clauses.push(`distance_km <= ?`);
    params.push(Number(q.maxDistance));
  }
  if (q.minDuration) {
    clauses.push(`duration_min >= ?`);
    params.push(Number(q.minDuration));
  }
  if (q.maxDuration) {
    clauses.push(`duration_min <= ?`);
    params.push(Number(q.maxDuration));
  }
  if (q.minElevation) {
    clauses.push(`elevation_gain_m >= ?`);
    params.push(Number(q.minElevation));
  }
  if (q.maxElevation) {
    clauses.push(`elevation_gain_m <= ?`);
    params.push(Number(q.maxElevation));
  }

  // 4️⃣ Tags – stored as JSON string array; we use LIKE for simplicity
  if (q.tags) {
    const required = q.tags.split(",").map((t: string) => t.trim()).filter(Boolean);
    for (const tag of required) {
      // The JSON string will contain `"tag"`; we look for that substring.
      clauses.push(`tags LIKE ?`);
      params.push(`%"${tag}"%`);
    }
  }

  const sql = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return { sql, params };
}

// -----------------------------------------------------------------
// GET /api/rides – list (optionally filtered)
// -----------------------------------------------------------------
app.get("/api/rides", async (req: Request, res: Response) => {
  const db = new Db(); // opens metadata.db
  const { sql, params } = buildWhereClause(req.query);

  // We also need the min/max components of the bbox for the intersection test.
  // Store them as virtual columns in the SELECT.
  const query = `
    SELECT
      id,
      departed_at,
      distance_km,
      duration_min,
      elevation_gain_m,
      tags,
      bbox,
      path_full,
      path_medium,
      path_coarse
    FROM rides
    ${sql}
    ORDER BY departed_at DESC
    LIMIT 455;   -- protect against runaway results, TODO: remove this limit
  `;

  const rows = db["db"].prepare(query).all(...params) as any[];

  // Transform each row into the shape the front‑end expects
  const rides = rows.map((r) => ({
    id: r.id,
    departed_at: r.departed_at,
    distance_km: r.distance_km,
    duration_min: r.duration_min,
    elevation_gain_m: r.elevation_gain_m,
    tags: JSON.parse(r.tags || "[]"),
    bbox: r.bbox,
    // URLs for the three resolutions – the front‑end can pick whichever it wants
    urls: {
      full:   `/processed/${r.id}_full.geojson`,
      medium: `/processed/${r.id}_medium.geojson`,
      coarse: `/processed/${r.id}_coarse.geojson`,
    },
  }));

  db.close();
  res.json(rides);
});

// -----------------------------------------------------------------
// GET /api/ride/:id/:resolution – redirect to the static file
// -----------------------------------------------------------------
app.get("/api/ride/:id/:resolution", (req: Request, res: Response) => {
  const { id, resolution } = req.params;
  const allowed = new Set(["full", "medium", "coarse"]);
  if (!allowed.has(resolution)) {
    return res.status(400).json({ error: "Invalid resolution" });
  }
  const fileName = `${id}_${resolution}.geojson`;
  const filePath = path.join(path.dirname(""), "..", "processed", fileName);
  // If the file does not exist we return 404
  if (!require("fs").existsSync(filePath)) {
    return res.status(404).json({ error: "GeoJSON not found" });
  }
  // 302 redirect – the browser will then request the static file
  res.redirect(`/processed/${fileName}`);
});

// -----------------------------------------------------------------
// Serve the static processed GeoJSON folder
// -----------------------------------------------------------------
app.use(
  "/processed",
  express.static(path.join(path.dirname(""), "..", "processed"))
);

// -----------------------------------------------------------------
// Health check (optional)
// -----------------------------------------------------------------
app.get("/health", (_req, res) => res.send("OK"));

// -----------------------------------------------------------------
// Start the server
// -----------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`🚀 Ride API listening on http://localhost:${PORT}`);
});