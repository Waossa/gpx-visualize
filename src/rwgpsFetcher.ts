// src/rwgpsFetcher.ts
import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";
import {
  Db
} from "./db.ts";

dotenv.config(); // loads .env → process.env
let database = new Db;

// -------------------------------------------------------------------
// 1️⃣ Configuration & constants
// -------------------------------------------------------------------
const TOKEN = process.env.RWGPS_TOKEN;
const USER_ID = process.env.RWGPS_USER_ID;
const PAGE_LIMIT = 100;

if (!TOKEN) {
  console.error("❌ RWGPS_TOKEN missing – add it to .env");
  process.exit(1);
}

if (!USER_ID) {
  console.error("❌ RWGPS_USER_ID missing – add it to .env");
  process.exit(1);
}

const API_ROOT = "https://ridewithgps.com";
const TRIPS_ENDPOINT = `${API_ROOT}/users/${USER_ID}/trips.json`;

// Folder where we keep the raw RideWithGPS JSON payloads
const ORIGINAL_RIDES_DIR = path.resolve(process.cwd(), "original_rides");

// Ensure the folder exists once (no‑op if it already does)
if (!fs.existsSync(ORIGINAL_RIDES_DIR)) {
  fs.mkdirSync(ORIGINAL_RIDES_DIR, { recursive: true });
}

const MAX_RETRIES = 2;          // number of *additional* attempts after the first try
const RETRY_DELAY_MS = 500;     // pause between retries (half‑second)

function delay(ms: number): Promise<void> {
  return new Promise(res => setTimeout(res, ms));
}
// -------------------------------------------------------------------
// 2️⃣ Helper: authorized fetch
// -------------------------------------------------------------------
async function authFetch(url: string, attempt = 0): Promise<Response> {
  const token = process.env.RWGPS_TOKEN;
  if (!token) {
    throw new Error("RWGPS_TOKEN missing – add it to your .env file");
  }

  const urlObj = new URL(url);
  urlObj.searchParams.append("auth_token", token);
  urlObj.searchParams.append("api_key", "testkey1");
  urlObj.searchParams.append("version", "2");

  const resp = await fetch(urlObj.toString(), {
    method: "GET",
    headers: { 
        Accept: "application/json",
        Cookie: "_rwgps_3_session=z9MTONzQFldQRA41NVNvWuAO4GPogOirKpkbl3ZblaIV1FFf9plhaa0Tr%2B40BxP7v1OqOT%2B5dMFOx9JeG%2F0z5OYlbrrJXqtjuVv84NqZzp6jfJb5xZfMoEA20GvP8kmIXiRrTjUDjH8kATeDHx99aDOCxuWY1JjbsasdAPqS0llm1TxJrv%2FJeAvK%2BMWPY2wYxg7A8AFb59kJy0W3sNCLgh663m107O%2BhRlyEAH%2FZVEhsPyM4PWUJNsXRVJPVoB2jdvz%2FMqwjuD0hYrVKysu57nrjxkb%2BTcPu8FdRKMi4nGSxRBiA0vZbi0VaTVJYS1q2hjIAzEIPZPXX2H7FpVcah2mHm4cvfvOeBVOTt4JQKvqr14cjXd3DVNvlWaGvIjvFR6%2BKrPCKdLYsqw%3D%3D--NWlYTlH5QIABXLYi--0Ezda1QMvaSSlkROA9%2FFbA%3D%3D"
     },
  });

  // -----------------------------------------------------------------
  // 1️⃣ Success – any 2xx status is fine, return the response.
  // -----------------------------------------------------------------
  if (resp.ok) {
    return resp;
  }

  // -----------------------------------------------------------------
  // 2️⃣ Do NOT retry on auth‑related failures (401/403).  These mean
  //    the token is bad/expired and the script must stop.
  // -----------------------------------------------------------------
  if (resp.status === 401 || resp.status === 403) {
    const txt = await resp.text();
    throw new Error(
      `Authorization error (${resp.status}) – ${txt || resp.statusText}`
    );
  }

  // -----------------------------------------------------------------
  // 3️⃣ For any other status (e.g. 429, 500, 502, 503, 504, etc.)
  //    we may retry a couple of times.
  // -----------------------------------------------------------------
  if (attempt < MAX_RETRIES) {
    const nextAttempt = attempt + 1;
    console.warn(
      `⚠️ Request to ${url} failed (status ${resp.status}). ` +
        `Retry ${nextAttempt}/${MAX_RETRIES} after ${RETRY_DELAY_MS} ms…`
    );
    await delay(RETRY_DELAY_MS);
    return authFetch(url, nextAttempt); // recursive retry
  }

  // -----------------------------------------------------------------
  // 4️⃣ Exhausted retries – surface the error to the caller.
  // -----------------------------------------------------------------
  const body = await resp.text();
  throw new Error(
    `Request to ${url} failed after ${MAX_RETRIES + 1} attempts ` +
      `(status ${resp.status} – ${body || resp.statusText})`
  );
}

/**
 * Fetches **all** trips for the configured USER_ID, paginating with
 * `offset`/`limit`.  Returns only those rides whose IDs are **not**
 * already present in the SQLite `rides` table.
 *
 * The function is deliberately async‑generator‑friendly – it builds a
 * flat array, but you could easily turn it into an async iterator if you
 * prefer streaming.
 */
export async function fetchActivities(): Promise<
  { id: number; name: string; departed_at: string }[]
> {
  // 1️⃣ Load the set of IDs we already have locally.
  const alreadyHave = database.getExistingRideIds(); // Set<string>

  // 2️⃣ Prepare to collect the *new* rides.
  const newRides: { id: number; name: string; departed_at: string }[] = [];

  // 3️⃣ Pagination loop – keep requesting pages until we get fewer
  //    results than the page size (that means we reached the end).
  let offset = 0;
  let morePages = true;

  while (morePages) {
    const url = `${TRIPS_ENDPOINT}?offset=${offset}&limit=${PAGE_LIMIT}`;
    console.log(`⏳ Requesting ${url}`);

    const resp = await authFetch(url);
    if (!resp.ok) {
      throw new Error(
        `Failed to fetch trips (status ${resp.status}) – aborting`
      );
    }
    const payload = (await resp.json()) as {
      results: Array<{
        id: number;
        name: string;
        departed_at: string; // ISO‑8601 timestamp (when the ride started)
        // …all the other fields are present but we ignore them here…
      }>;
      results_count: number;
    };

    const pageRides = payload.results ?? [];

    // 4️⃣ Filter out rides we already have.
    for (const trip of pageRides) {
      if (!alreadyHave.has(String(trip.id))) {
        newRides.push(trip);
      }
    }

    // 5️⃣ Decide whether we need another request.
    // If the API returned fewer rows than the limit, we are on the last page.
    if (pageRides.length < PAGE_LIMIT) {
      morePages = false;
    } else {
      // Otherwise bump the offset and continue.
      offset += PAGE_LIMIT;
    }
  }

  console.log(`✅ Finished pagination – ${newRides.length} new ride(s) found.`);
  return newRides;
}

// ---------------------------------------------------------------
// 3️⃣ fetchRideByID – the function you asked for
// ---------------------------------------------------------------
/**
 * Retrieves the full JSON description of a single RideWithGPS trip.
 *
 *   • If a cached file `<id>.json` already exists in `original_rides/`,
 *     the function reads that file and returns the parsed object.
 *
 *   • Otherwise it performs a GET request to
 *     `https://ridewithgps.com/trips/<id>.json`,
 *     strips the `photos` property (if present),
 *     writes the cleaned payload to `<id>.json`,
 *     and finally returns the parsed object.
 *
 * @param rideId  Numeric RideWithGPS trip ID (e.g. 94)
 * @returns       The full trip object (minus `photos`)
 */
export async function fetchRideByID(rideId: number): Promise<any> {
  const cachePath = path.join(ORIGINAL_RIDES_DIR, `${rideId}.json`);

  // Return cached version if we already have it
  if (fs.existsSync(cachePath)) {
    const raw = await fs.promises.readFile(cachePath, "utf8");
    return JSON.parse(raw);
  }

  const url = `${API_ROOT}/trips/${rideId}.json`;
  const resp = await authFetch(url);

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(
      `Failed to fetch ride ${rideId} (status ${resp.status}) – ${body}`
    );
  }

  const payload = (await resp.json()) as any;

  if (Array.isArray(payload.trip?.photos)) {
    delete payload.trip.photos;
  }

  await fs.promises.writeFile(
    cachePath,
    JSON.stringify(payload, null, 2),
    "utf8"
  );

  return payload;
}

// -------------------------------------------------------------------
// 6️⃣ Main orchestration
// -------------------------------------------------------------------
(async () => {
  try {
    console.log("🔎 Fetching activity list from RideWithGPS…");
    const activities = await fetchActivities();

    // Build a Set of IDs we already have locally (from the SQLite manifest)
    const existingIds = database.getExistingRideIds();

    // Filter out anything we already possess
    const newActivities = activities.filter(act => !existingIds.has(String(act.id)));

    if (newActivities.length === 0) {
      console.log("✅ No new rides to download – everything is up‑to‑date.");
    } else {
      console.log(`📥 Found ${newActivities.length} new ride(s). Downloading…`);

      for (const act of newActivities) {
        const filename = `${act.id}.gpx`;

        console.log(`   ↳ Downloading #${act.id} → ${filename}`);
        await fetchRideByID(act.id);

        // ----------------------------------------------------------------
        // OPTIONAL: Insert a placeholder row into the manifest DB.
        // You can later run your preprocessing script which will replace
        // the placeholder values with the real bbox / simplified files.
        // ----------------------------------------------------------------
// TODO: convert to RideMeta or something. Or maybe remove all DB stuff from this class, as the original ride files are handled as individual files on disk, not db.
//        const placeholderBBox = "0,0,0,0"; // dummy – will be overwritten later
//        database.insertRideRow(
//          String(act.id),
//          placeholderBBox,
//          `processed/${act.id}_full.geojson`,
//          `processed/${act.id}_medium.geojson`,
//          `processed/${act.id}_coarse.geojson`
//        );
      }
    }

    // --------------------------------------------------------------------
    // 7️⃣ Persist the “last run” timestamp (now) for the next execution.
    // --------------------------------------------------------------------
    const nowIso = new Date().toISOString();
    database.setMeta("last_run_ts", nowIso);
    console.log(`🕒 Saved last‑run timestamp: ${nowIso}`);

    console.log("🎉 Done!");
  } catch (err) {
    console.error("❌ Fatal error:", (err as Error).message);
    process.exit(1);
  }
})();