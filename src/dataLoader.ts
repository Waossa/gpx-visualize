import type { BoundingBox, RideMeta } from "./types";

/**
 * The manifest is a tiny JSON file that mirrors the SQLite table.
 * You can generate it with a one‑off script:
 *
 *   sqlite3 metadata.db "SELECT * FROM rides;" > public/manifest.json
 *
 * Keeping it in `public/` means the browser can fetch it with a normal GET.
 */
export async function loadManifest(): Promise<RideMeta[]> {
  const resp = await fetch("/manifest.json");
  if (!resp.ok) throw new Error(`Unable to fetch manifest (${resp.status})`);
  return (await resp.json()) as RideMeta[];
}

/**
 * Pick the appropriate resolution for the current zoom level.
 * Feel free to tweak the thresholds to match your data density.
 */
export function chooseResolution(ride: RideMeta, zoom: number): string {
  if (zoom >= 15) return ride.paths.full;
  if (zoom >= 12) return ride.paths.medium;
  return ride.paths.coarse;
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