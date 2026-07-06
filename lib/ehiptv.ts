import type { MediaItem, MediaType } from "./types";

/**
 * Eh!IPTV availability check.
 *
 * Hits the operator's private PocketBase (`iptv.ehtudo.app`) with two
 * collections that catalogue every movie/series the reseller has playback
 * rights for:
 *   - imdb_stream_vod    — movies with a `tmdb_id` field
 *   - imdb_stream_series — TV shows with a `tmdb_id` field
 *
 * The web app keeps two invariants:
 *   1. The home rails only surface titles that exist in these collections —
 *      so the "Play" button never lands on a dead stream.
 *   2. If PocketBase is unreachable, slow, or returns nothing usable, the
 *      filter falls open and the rails stay populated (fail-open). Operators
 *      need the home to look alive even when the catalog backend hiccups.
 *
 * Configuration is intentionally hardcoded — the reseller-facing app no
 * longer exposes a Settings toggle for these endpoints.
 */

const EH_IPTV_BASE_URL = "https://iptv.ehtudo.app/";
const VOD_COLLECTION = "imdb_stream_vod";
const SERIES_COLLECTION = "imdb_stream_series";
const TMDB_FIELD = "tmdb_id";
const REQUEST_TIMEOUT_MS = 3000;
const BATCH_SIZE = 60;
const PER_PAGE = 200;

type Kind = Exclude<MediaType, "all">;

const availabilityCache = new Map<string, Set<number>>();

function collectionFor(kind: Kind): string {
  return kind === "tv" ? SERIES_COLLECTION : VOD_COLLECTION;
}

function uniqueIds(ids: number[]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const value of ids) {
    if (!Number.isFinite(value) || value <= 0) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function cacheKey(kind: Kind, ids: number[]): string {
  return `${kind}:${ids.slice().sort((a, b) => a - b).join(",")}`;
}

function buildFilter(ids: number[]): string {
  // PocketBase filter syntax: `(field=value || field=value || ...)`.
  return `(${TMDB_FIELD}=${ids.join(` || ${TMDB_FIELD}=`)})`;
}

async function fetchChunk(kind: Kind, ids: number[]): Promise<Set<number>> {
  const url = new URL(`/api/collections/${collectionFor(kind)}/records`, EH_IPTV_BASE_URL);
  url.searchParams.set("filter", buildFilter(ids));
  url.searchParams.set("fields", TMDB_FIELD);
  url.searchParams.set("perPage", String(PER_PAGE));

  const response = await fetch(url.toString(), {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { Accept: "application/json" }
  });
  if (!response.ok) throw new Error(`pocketbase ${response.status}`);
  const payload = await response.json();
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const out = new Set<number>();
  for (const item of items) {
    const value = Number(item?.[TMDB_FIELD]);
    if (Number.isFinite(value) && value > 0) out.add(value);
  }
  return out;
}

/**
 * Returns a Set of TMDB ids available for the given kind, or `null` on
 * failure. `null` is the fail-open signal — callers should treat the input
 * as fully available when this is returned.
 */
export async function fetchAvailableIds(kind: Kind, tmdbIds: number[]): Promise<Set<number> | null> {
  const ids = uniqueIds(tmdbIds);
  if (!ids.length) return new Set<number>();

  const key = cacheKey(kind, ids);
  if (availabilityCache.has(key)) return availabilityCache.get(key)!;

  try {
    const hits = new Set<number>();
    for (let offset = 0; offset < ids.length; offset += BATCH_SIZE) {
      const slice = ids.slice(offset, offset + BATCH_SIZE);
      const chunkHits = await fetchChunk(kind, slice);
      chunkHits.forEach((id) => hits.add(id));
    }
    availabilityCache.set(key, hits);
    return hits;
  } catch {
    return null;
  }
}

/**
 * Filters media items down to those whose TMDB id is present in the
 * Eh!IPTV catalog. On lookup failure the original list is returned
 * unchanged (fail-open).
 */
export async function filterByEhIptv<T extends { id: number; mediaType: MediaType }>(items: T[]): Promise<T[]> {
  if (!items.length) return items;

  const movieIds = items.filter((item) => item.mediaType === "movie").map((item) => item.id);
  const seriesIds = items.filter((item) => item.mediaType === "tv").map((item) => item.id);

  const [movieHit, seriesHit] = await Promise.all([
    movieIds.length ? fetchAvailableIds("movie", movieIds) : Promise.resolve(new Set<number>(movieIds)),
    seriesIds.length ? fetchAvailableIds("tv", seriesIds) : Promise.resolve(new Set<number>(seriesIds))
  ]);

  // Fail-open semantics: a null lookup degrades to "everything passes".
  const movieFilter = movieHit ?? new Set<number>(movieIds);
  const seriesFilter = seriesHit ?? new Set<number>(seriesIds);

  return items.filter((item) =>
    item.mediaType === "movie" ? movieFilter.has(item.id) : seriesFilter.has(item.id)
  );
}

/** Clears the in-memory cache (used when a login/refresh invalidates the catalog). */
export function clearEhIptvCache() {
  availabilityCache.clear();
}

// Re-export for diagnostics — used by settings/tests/dev tooling only.
export const __ehiptvConfig = {
  baseUrl: EH_IPTV_BASE_URL,
  vodCollection: VOD_COLLECTION,
  seriesCollection: SERIES_COLLECTION,
  tmdbField: TMDB_FIELD
} as const;

// Convenience type guard for non-mutating callers that import MediaItem directly.
export function applyEhIptvFilter(items: MediaItem[]): Promise<MediaItem[]> {
  return filterByEhIptv(items);
}
