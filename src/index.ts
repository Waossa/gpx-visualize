import { createMap } from "./mapInit";
import { loadManifest, bboxIntersects } from "./dataLoader";
import { addRide, removeRide, refreshRideResolution } from "./trackLayer";
import type { RideMeta } from "./types";

/**
 * Global state – tiny for this demo.
 * In a larger app you might move this into a store (Redux, Zustand, etc.).
 */
interface AppState {
  map: maplibregl.Map;
  rides: RideMeta[];
  /** IDs of rides currently rendered on the map */
  visible: Set<string>;
}
let state: AppState;

/**
 * Determine which rides intersect the current viewport.
 */
function computeVisibleRides(): Set<string> {
  const bounds = state.map.getBounds(); // returns LngLatBounds
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

/**
 * Synchronise the map layers with the set of rides that should be visible.
 */
function syncLayers(): void {
  const nowVisible = computeVisibleRides();
  const zoom = state.map.getZoom();

  // Add newly‑visible rides
  for (const id of nowVisible) {
    if (!state.visible.has(id)) {
      const ride = state.rides.find((r) => r.id === id)!;
      addRide(state.map, ride, zoom);
    }
  }

  // Remove rides that have left the viewport
  for (const id of state.visible) {
    if (!nowVisible.has(id)) {
      removeRide(state.map, id);
    }
  }

  // Update resolution for rides that stay visible (zoom change)
  for (const id of nowVisible) {
    const ride = state.rides.find((r) => r.id === id)!;
    refreshRideResolution(state.map, ride, zoom);
  }

  state.visible = nowVisible;
}

/**
 * Entry point – called once the DOM is ready.
 */
async function main(): Promise<void> {
  // 1️⃣ Initialise the map
  const map = createMap("map");

  // 2️⃣ Load the manifest (list of rides)
  const rides = await loadManifest();

  // 3️⃣ Populate global state
  state = {
    map,
    rides,
    visible: new Set(),
  };

  // 4️⃣ When the map finishes loading, draw the initial set of rides
  map.on("load", () => {
    syncLayers();
  });

  // 5️⃣ Re‑evaluate on every move/zoom – debounce a little to avoid thrashing
  let timeout: number | undefined;
  const scheduleSync = () => {
    if (timeout) clearTimeout(timeout);
    timeout = window.setTimeout(syncLayers, 150); // 150 ms debounce
  };
  map.on("moveend", scheduleSync);
  map.on("zoomend", scheduleSync);
}

// Kick things off
main().catch((e) => console.error("App initialization failed:", e));