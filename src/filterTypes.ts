/**
 * The object the UI will build and pass to the map‑layer.
 * Every property is optional – the filter matches a ride only if
 * all supplied constraints evaluate to true.
 */
export interface RideFilter {
  /** Show rides that start on or after this ISO‑8601 date (inclusive) */
  startDateFrom?: string;
  /** Show rides that start on or before this ISO‑8601 date (inclusive) */
  startDateTo?: string;

  /** Minimum distance in kilometres (inclusive) */
  minDistanceKm?: number;
  /** Maximum distance in kilometres (inclusive) */
  maxDistanceKm?: number;

  /** Minimum duration in seconds (inclusive) */
  minDurationSec?: number;
  /** Maximum duration in seconds (inclusive) */
  maxDurationSec?: number;

  /** Minimum elevation gain in metres (inclusive) */
  minElevationGainM?: number;

  /** Ride must contain *all* of these tags (case‑sensitive) */
  requiredTags?: string[];
}