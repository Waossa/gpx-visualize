// src/filterUtil.ts
// src/filterUtil.ts
import type { RideMeta } from "./types";
import type { RideFilter } from "./filterTypes";

/**
 * Returns true iff `ride` satisfies *all* constraints present in `filter`.
 * Pure function – it does not touch the map or any global state.
 */
export function rideMatchesFilter(ride: RideMeta, filter: RideFilter): boolean {
  // ---------- Start date ----------
  if (filter.startDateFrom) {
    const from = new Date(filter.startDateFrom);
    const rideDate = ride.startDate ? new Date(ride.startDate) : null;
    if (!rideDate || rideDate < from) return false;
  }
  if (filter.startDateTo) {
    const to = new Date(filter.startDateTo);
    const rideDate = ride.startDate ? new Date(ride.startDate) : null;
    if (!rideDate || rideDate > to) return false;
  }

  // ---------- Distance ----------
  if (filter.minDistanceKm !== undefined && (ride.distanceKm ?? Infinity) < filter.minDistanceKm) {
    return false;
  }
  if (filter.maxDistanceKm !== undefined && (ride.distanceKm ?? -Infinity) > filter.maxDistanceKm) {
    return false;
  }

  // ---------- Duration ----------
  if (filter.minDurationSec !== undefined && (ride.durationSec ?? Infinity) < filter.minDurationSec) {
    return false;
  }
  if (filter.maxDurationSec !== undefined && (ride.durationSec ?? -Infinity) > filter.maxDurationSec) {
    return false;
  }

  // ---------- Elevation gain ----------
  if (filter.minElevationGainM !== undefined && (ride.elevationGainM ?? Infinity) < filter.minElevationGainM) {
    return false;
  }

  // ---------- Tags ----------
  if (filter.requiredTags && filter.requiredTags.length > 0) {
    if (!ride.tags) return false;
    const hasAll = filter.requiredTags.every(tag => ride.tags!.includes(tag));
    if (!hasAll) return false;
  }

  // Passed every active constraint
  return true;
}