// src/ui.ts
import { setRideFilter } from "./index";   // <-- import the function we exported earlier

/* --------------------------------------------------------------- */
/* Grab the DOM elements – we annotate the variables directly      */
/* --------------------------------------------------------------- */
const el = {
  fromDate:   document.getElementById("filter-start-from") as HTMLInputElement,
  toDate:     document.getElementById("filter-start-to")   as HTMLInputElement,
  minDist:    document.getElementById("filter-min-dist")   as HTMLInputElement,
  maxDist:    document.getElementById("filter-max-dist")   as HTMLInputElement,
  minDur:     document.getElementById("filter-min-dur")    as HTMLInputElement,
  maxDur:     document.getElementById("filter-max-dur")    as HTMLInputElement,
  minElev:    document.getElementById("filter-min-elev")   as HTMLInputElement,
  tags:       document.getElementById("filter-tags")      as HTMLInputElement,
  applyBtn:   document.getElementById("apply-filters")    as HTMLButtonElement,
  clearBtn:   document.getElementById("clear-filters")    as HTMLButtonElement,
};

/* --------------------------------------------------------------- */
/* Helper – turn the UI values into a RideFilter object            */
/* --------------------------------------------------------------- */
function buildFilter() {
  const filter: Record<string, unknown> = {};

  if (el.fromDate.value) filter.startDateFrom = el.fromDate.value;
  if (el.toDate.value)   filter.startDateTo   = el.toDate.value;

  if (el.minDist.value)  filter.minDistanceKm = parseFloat(el.minDist.value);
  if (el.maxDist.value)  filter.maxDistanceKm = parseFloat(el.maxDist.value);

  if (el.minDur.value)   filter.minDurationSec = parseInt(el.minDur.value, 10) * 60; // minutes → seconds
  if (el.maxDur.value)   filter.maxDurationSec = parseInt(el.maxDur.value, 10) * 60;

  if (el.minElev.value)  filter.minElevationGainM = parseInt(el.minElev.value, 10);

  if (el.tags.value.trim()) {
    filter.requiredTags = el.tags.value
      .split(",")
      .map(t => t.trim())
      .filter(t => t.length > 0);
  }

  // Remove any empty / NaN entries – the filter util expects `undefined` for “not set”
  Object.keys(filter).forEach(k => {
    const v = (filter as any)[k];
    if (v === "" || Number.isNaN(v)) delete (filter as any)[k];
  });

  return filter;
}

/* --------------------------------------------------------------- */
/* Wire the buttons                                                   */
/* --------------------------------------------------------------- */
el.applyBtn.addEventListener("click", () => {
  const filter = buildFilter();
  // `setRideFilter` expects the exact RideFilter shape; the `as any` cast is safe
  // because we built the object ourselves.
  setRideFilter(filter as any);
});

el.clearBtn.addEventListener("click", () => {
  // Reset UI fields
  el.fromDate.value = "";
  el.toDate.value   = "";
  el.minDist.value  = "";
  el.maxDist.value  = "";
  el.minDur.value   = "";
  el.maxDur.value   = "";
  el.minElev.value  = "";
  el.tags.value     = "";

  // Empty filter → show everything
  setRideFilter({});
});

/* --------------------------------------------------------------- */
/* Optional: expose a tiny debug helper on `window` (helps while dev)*/
/* --------------------------------------------------------------- */
declare global {
  interface Window { __uiDebug?: typeof el; }
}
window.__uiDebug = el;