import type { BoundingBox, RideMeta } from "./types";

// src/dataLoader.ts (updated)
export async function loadRides(filters = {}): Promise<RideMeta[]> {
  const qs = new URLSearchParams(filters as any).toString();
  const url = `http://localhost:4000/api/rides${qs ? "?" + qs : ""}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to load rides (${resp.status})`);
  const rides = await resp.json(); // already in the shape we need
  return rides;
}

/**
 * Pick the appropriate resolution for the current zoom level.
 * Feel free to tweak the thresholds to match your data density.
 */
export function chooseResolution(ride: RideMeta, zoom: number): string {
//  if (!ride.urls) {
//    console.warn(`no urls for ride ${ride.id}`)
//    return ""
//  }
  if (zoom >= 15) return ride.urls.full;
  if (zoom >= 12) return ride.urls.medium;
  return ride.urls.coarse;
}

/**
 * Simple rectangle‑intersection test – used to decide whether a ride
 * belongs in the current viewport.
 */
export function bboxIntersects(
  a: BoundingBox,
  b: BoundingBox
): boolean {
  return (
    a.minLon <= b.maxLon &&
    a.maxLon >= b.minLon &&
    a.minLat <= b.maxLat &&
    a.maxLat >= b.minLat
  );
}