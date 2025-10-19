// src/index.ts
import { createMap } from "./mapInit";
import { loadManifest, bboxIntersects } from "./dataLoader";
import { addRide, removeRide, refreshRideResolution } from "./trackLayer";
import type { RideMeta } from "./types";
import type { RideFilter } from "./filterTypes";
import { rideMatchesFilter } from "./filterUtil";

/* ------------------------------------------------------------------ */
/* Global state – keep it simple for this demo                           */
interface AppState {
  map: maplibregl.Map;
  rides: RideMeta[];          // full manifest
  visible: Set<string>;       // IDs of rides currently drawn
}
let state: AppState;

/* ------------------------------------------------------------------ */
/* UI‑driven filter – start with “no filter” (everything passes)      */
let currentFilter: RideFilter = {};   // you will update this from the UI

/* ------------------------------------------------------------------ */
/* Helper – compute which rides intersect the current viewport          */
function computeVisibleRides(): Set<string> {
  const bounds = state.map.getBounds();
  const viewport = {
    minLon: bounds.getWest(),
    minLat: bounds.getSouth(),
    maxLon: bounds.getEast(),
    maxLat: bounds.getNorth(),
  };

  const visible = new Set<string>();
  for (const ride of state.rides) {
    if (bboxIntersects(ride.bbox, viewport)) {
      visible.add(ride.id);
    }
  }
  return visible;
}

/* ------------------------------------------------------------------ */
/* Main sync routine – now also respects the filter                    */
function syncLayers(): void {
  const viewportVisible = computeVisibleRides(); // based on bbox only
  const zoom = state.map.getZoom();

  // Iterate over every ride in the manifest
  for (const ride of state.rides) {
    const passesFilter = rideMatchesFilter(ride, currentFilter);
    const shouldBeVisible = viewportVisible.has(ride.id) && passesFilter;
    const alreadyVisible = state.visible.has(ride.id);

    if (shouldBeVisible && !alreadyVisible) {
      // Ride just entered the view (or filter) → add it
      addRide(state.map, ride, zoom);
    } else if (!shouldBeVisible && alreadyVisible) {
      // Ride left the view or no longer matches filter → remove it
      removeRide(state.map, ride.id);
    } else if (shouldBeVisible && alreadyVisible) {
      // Still visible → maybe swap resolution if zoom changed
      refreshRideResolution(state.map, ride, zoom);
    }
    // If !shouldBeVisible && !alreadyVisible → do nothing
  }

  // Update the Set that tracks what is currently drawn
  state.visible = new Set(
    state.rides
      .filter(r => viewportVisible.has(r.id) && rideMatchesFilter(r, currentFilter))
      .map(r => r.id)
  );
}

/* ------------------------------------------------------------------ */
/* Entry point – same as before, just calls syncLayers() after load    */
async function main(): Promise<void> {
  const map = createMap("map");          // <- map container id
  const rides = await loadManifest();    // reads public/manifest.json

  state = {
    map,
    rides,
    visible: new Set(),
  };

  // Initial draw once the map is ready
  map.on("load", () => {
    syncLayers();
  });

  // Re‑evaluate on pan/zoom (debounced a bit for performance)
  let debounceTimer: number | undefined;
  const schedule = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(syncLayers, 150);
  };
  map.on("moveend", schedule);
  map.on("zoomend", schedule);
}

/* ------------------------------------------------------------------ */
/* Expose a tiny helper so UI code can update the filter              */
export function setRideFilter(newFilter: RideFilter): void {
  currentFilter = newFilter;
  syncLayers();   // re‑apply immediately
}

/* ------------------------------------------------------------------ */
main().catch(err => console.error("❌ App init failed:", err));