import type maplibregl from "maplibre-gl";
import type { RideMeta } from "./types";
import { chooseResolution } from "./dataLoader";

/**
 * Add a single ride to the map.
 * The function is deliberately tiny – you can expand it with hover tooltips,
 * pop‑ups, colour coding, etc.
 */
export function addRide(
  map: maplibregl.Map,
  ride: RideMeta,
  zoom: number
): void {
  const sourceId = `ride-${ride.id}`;
  const layerId = `layer-${ride.id}`;

  // Guard against double‑adding (e.g. when zoom changes)
  if (map.getSource(sourceId)) return;

  const url = chooseResolution(ride, zoom);

  map.addSource(sourceId, {
    type: "geojson",
    data: url,
  });

  map.addLayer({
    id: layerId,
    type: "line",
    source: sourceId,
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      // Simple orange line – change as you wish
      "line-color": "#ff6600",
      // Width grows a little with zoom for readability
      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        10,
        2,
        14,
        4,
        18,
        6,
      ],
    },
  });
}

/**
 * Remove a ride (useful when it leaves the viewport).
 */
export function removeRide(map: maplibregl.Map, rideId: string): void {
  const sourceId = `ride-${rideId}`;
  const layerId = `layer-${rideId}`;

  if (map.getLayer(layerId)) map.removeLayer(layerId);
  if (map.getSource(sourceId)) map.removeSource(sourceId);
}

/**
 * Called whenever the map zoom changes – updates the source data
 * to the appropriate resolution without recreating the whole layer.
 */
export function refreshRideResolution(
  map: maplibregl.Map,
  ride: RideMeta,
  zoom: number
): void {
  const sourceId = `ride-${ride.id}`;
  const src = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
  if (!src) return; // not currently displayed

  const newUrl = chooseResolution(ride, zoom);
  // If the URL is already the one we have, do nothing.
  // `src._data` is internal, so we just compare strings.
  // The simplest approach is to always call setData – MapLibre will
  // short‑circuit if the payload hasn't changed.
  src.setData(newUrl);
}