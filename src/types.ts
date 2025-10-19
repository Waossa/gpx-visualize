/* src/types.ts ----------------------------------------------------------- */

export interface BoundingBox {
  /** Westernmost longitude (‑180 → 180) */
  minLon: number;
  /** Southernmost latitude (‑90 → 90) */
  minLat: number;
  /** Easternmost longitude */
  maxLon: number;
  /** Northernmost latitude */
  maxLat: number;
}

/**
 * Core descriptor for a single GPX ride.
 * All fields except `id`, `bbox` and `paths` are optional – you can add them
 * later without breaking existing code.
 */
export interface RideMeta {
  /** Unique identifier – usually the GPX filename without the extension */
  id: string;

  /** Pre‑computed envelope of the whole track – used for fast viewport culling */
  bbox: BoundingBox;

  /** URLs (relative to the web root) of the three resolution files */
  urls: {
    /** Full‑detail GeoJSON – ~meter‑level, used at high zoom (≥ 15) */
    full: string;
    /** Medium‑detail GeoJSON – ~10 m tolerance, used at mid‑zoom (12 – 14) */
    medium: string;
    /** Coarse‑detail GeoJSON – ~100 m tolerance, used at low zoom (< 12) */
    coarse: string;
  };

  /* --------------------------------------------------------------------
   * OPTIONAL METADATA – add whatever you calculate during the preprocessing
   * step (Python/Node script that creates the manifest).  All of these are
   * deliberately typed to make downstream filtering easy and type‑safe.
   * ------------------------------------------------------------------- */

  /** Human‑readable title (e.g. “Morning ride – Tampere”) */
  title?: string;

  /**
   * ISO‑8601 timestamp of the *first* track point.
   * Stored as a string so the JSON manifest stays plain text.
   * When you need a Date object you can do `new Date(meta.startDate)`.
   */
  startDate?: string; // e.g. "2024-09-12T07:45:00Z"

  /** Total distance of the ride in kilometres (rounded to 2 dp) */
  distanceKm?: number; // e.g. 42.37

  /**
   * Duration of the ride in **seconds**.
   * Seconds are the most convenient unit for numeric comparisons
   * (you can format it to HH:mm:ss for display later).
   */
  durationSec?: number; // e.g. 7260 (= 2 h 1 min)

  /** Elevation gain in metres (positive climb only) */
  elevationGainM?: number; // optional but handy for hill‑climbers

  /** Average speed in km/h (derived from distance & duration) */
  avgSpeedKmh?: number; // optional, can be computed on‑the‑fly

  /** Tags that the user (or your script) attached – free‑form strings */
  tags?: string[];
}
