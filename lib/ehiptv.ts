import { jsonRequest, proxiedUrl } from "./http";
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

/**
 * Playback URL builders follow the standard Xtream Codes URL scheme:
 *   http(s)://<base>/movie/<user>/<pass>/<stream_id>.<ext>
 *   http(s)://<base>/series/<user>/<pass>/<series_id>/<season>/<episode>.<ext>
 *
 * The `stream_id` / `series_id` are stored in each PocketBase row next to
 * `tmdb_id`. The names below match the Xtream convention — if the admin
 * picked different field names in PocketBase, edit the constants.
 *
 * A single TMDB title can map to multiple catalogue rows in PocketBase
 * (e.g. "Michael" vs "Michael [L]"); the operator-supplied labels live in
 * `vod_title` / `serie_title` and are surfaced as separate Play buttons.
 */
const MOVIE_ID_FIELD = "stream_id";
const SERIES_ID_FIELD = "series_id";
const VOD_TITLE_FIELD = "vod_title";
const SERIES_TITLE_FIELD = "serie_title";
const FILE_EXTENSION = "mp4";

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

/* ============================================================
   Playback URL assembly
   ============================================================ */

export type StreamKind = Kind;

export interface StreamOption {
  /** Internal id used in the playback URL (PocketBase `stream_id` / `series_id`). */
  id: string | number;
  /** Operator-defined label for this catalogue edition (`vod_title` / `serie_title`). */
  title: string;
}

export interface PlaybackService {
  baseUrl: string;
  username: string;
  password: string;
}

/**
 * Look up all PocketBase rows that own this TMDB id and return the Eh!IPTV
 * options the customer can pick between. A single film can show up multiple
 * times in the operator's catalogue (e.g. "Michael" vs "Michael [L]"); the
 * drawer turns each option into its own Play button.
 *
 * Returns an empty array when the collection is unreachable or no row
 * matches — callers are expected to fail-open or toast appropriately.
 */
export async function fetchStreamOptions(item: { id: number; mediaType: MediaType }): Promise<StreamOption[]> {
  const kind: Kind = item.mediaType === "tv" ? "tv" : "movie";
  const collection = collectionFor(kind);
  const idField = kind === "movie" ? MOVIE_ID_FIELD : SERIES_ID_FIELD;
  const titleField = kind === "movie" ? VOD_TITLE_FIELD : SERIES_TITLE_FIELD;

  const url = new URL(`/api/collections/${collection}/records`, EH_IPTV_BASE_URL);
  url.searchParams.set("filter", `(${TMDB_FIELD}=${item.id})`);
  url.searchParams.set("fields", `${idField},${titleField}`);
  url.searchParams.set("perPage", "200");

  try {
    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { Accept: "application/json" }
    });
    if (!response.ok) return [];
    const payload = await response.json();
    const rows = Array.isArray(payload?.items) ? payload.items : [];
    return rows
      .map((row: Record<string, unknown>) => {
        const id = row[idField];
        const title = String(row[titleField] ?? "").trim();
        return { id, title };
      })
      .filter((option: StreamOption) => option.id !== null && option.id !== "" && option.id !== undefined);
  } catch {
    return [];
  }
}

/**
 * Resolve the Xtream Codes episode id (`episodes[season][i].id`) for a given
 * (seriesId, season, episode) tuple.
 *
 * The Xtream playback URL for a series episode is built from the EPISODE
 * id returned by `get_series_info`, NOT from `(series_id, season, episode)`.
 * The misleading `/series/{user}/{pass}/{series_id}/{season}/{episode}.mp4`
 * form relies on a backend shortcut most providers don't implement; the
 * safe path is to look up the real episode id first.
 *
 * Calls go through `/api/xtream` so HTTPS pages can reach HTTP Xtream
 * servers (the dnstv.top use-case) without mixed-content errors.
 *
 * Results are cached in-memory for 5 minutes to avoid re-fetching when the
 * user opens the same episode twice in a row.
 */
const seriesEpisodeCache = new Map<string, { episodeId: string; extension: string; expiresAt: number }>();
const seriesInfoCache = new Map<string, { expiresAt: number; data: SeriesInfo }>();
const SERIES_EPISODE_CACHE_MS = 5 * 60 * 1000;

type EpisodeRow = {
  id: string;
  season?: number;
  episode_num?: number;
  container_extension?: string;
  title?: string;
};
type SeriesInfo = {
  episodes?: Record<string, EpisodeRow[]>;
  info?: Record<string, unknown>;
};

/**
 * Fetch (and cache) the full `get_series_info` payload for a given series.
 * Use this when you need to enumerate which episodes exist on the provider
 * (for filtering the UI list). For a single playback lookup use
 * `resolveSeriesEpisodeId`, which reuses this cache.
 */
async function fetchSeriesInfo(
  service: PlaybackService,
  seriesId: string | number
): Promise<SeriesInfo> {
  const cacheKey = `${service.baseUrl}|${service.username}|${seriesId}`;
  const cached = seriesInfoCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.data;

  const xtreamUrl = new URL("/api/xtream", window.location.origin);
  xtreamUrl.searchParams.set("server", service.baseUrl);
  xtreamUrl.searchParams.set("user", service.username);
  xtreamUrl.searchParams.set("pass", service.password);
  xtreamUrl.searchParams.set("action", "get_series_info");
  xtreamUrl.searchParams.set("xtream_series_id", String(seriesId));

  const data = await jsonRequest<SeriesInfo>(xtreamUrl.toString());
  seriesInfoCache.set(cacheKey, { data, expiresAt: now + SERIES_EPISODE_CACHE_MS });

  // Pre-populate the per-episode cache from the same response so that the
  // eventual `resolveSeriesEpisodeId` call is a cache hit.
  if (data?.episodes) {
    for (const [seasonKey, rows] of Object.entries(data.episodes)) {
      if (!Array.isArray(rows)) continue;
      const seasonNum = Number(seasonKey);
      for (const row of rows) {
        if (!row?.id) continue;
        const epNum = row.episode_num ?? (typeof row.season === "number" ? row.season : undefined);
        // Skip if we can't derive an episode number to index the cache by.
        if (epNum == null) continue;
        const episodeCacheKey = `${cacheKey}|${seasonNum}|${epNum}`;
        seriesEpisodeCache.set(episodeCacheKey, {
          episodeId: String(row.id),
          extension: row.container_extension || FILE_EXTENSION,
          expiresAt: now + SERIES_EPISODE_CACHE_MS
        });
      }
    }
  }
  return data;
}

/**
 * Returns the set of episode numbers that the operator actually has for
 * a given (series, season). Used by the UI to filter the TMDB-derived
 * episode list down to the ones that will actually play.
 *
 * Returns `null` on lookup failure (fail-open — treats the season as fully
 * available) to match `fetchAvailableIds` semantics.
 */
export async function fetchAvailableEpisodeNumbers(
  service: PlaybackService,
  seriesId: string | number,
  seasonNumber: number
): Promise<Set<number> | null> {
  try {
    const data = await fetchSeriesInfo(service, seriesId);
    const block = data?.episodes?.[String(seasonNumber)] ?? data?.episodes?.[seasonNumber] ?? [];
    if (!Array.isArray(block)) return new Set<number>();
    const out = new Set<number>();
    for (const row of block) {
      const num = row?.episode_num ?? row?.season;
      if (typeof num === "number" && Number.isFinite(num)) out.add(num);
      // Some providers use 1-based count; if `title` exists, fall back to
      // the array index + 1 as a last resort for matching against TMDB rows.
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * Returns the extension hint advertised by the provider for a single
 * episode, falling back to `mp4` when unknown. Used by the UI to disable
 * Play buttons on rows that have no playable file.
 */
export async function fetchEpisodeExtension(
  service: PlaybackService,
  seriesId: string | number,
  seasonNumber: number,
  episodeNumber: number
): Promise<string | null> {
  try {
    const data = await fetchSeriesInfo(service, seriesId);
    const block = (data?.episodes?.[String(seasonNumber)] ?? data?.episodes?.[seasonNumber] ?? []) as EpisodeRow[];
    const match = block.find((row) => row?.episode_num === episodeNumber);
    return match?.container_extension || FILE_EXTENSION;
  } catch {
    return null;
  }
}

async function resolveSeriesEpisodeId(
  service: PlaybackService,
  seriesId: string | number,
  season: number,
  episode: number
): Promise<{ episodeId: string; extension: string }> {
  const cacheKey = `${service.baseUrl}|${service.username}|${seriesId}|${season}|${episode}`;
  const cached = seriesEpisodeCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return { episodeId: cached.episodeId, extension: cached.extension };
  }

  // Cache miss — fetch the full series info (and pre-populate the cache).
  const data = await fetchSeriesInfo(service, seriesId);
  const seasonBlock = data?.episodes?.[String(season)] ?? [];
  const match =
    seasonBlock.find((ep) => ep.episode_num === episode) ??
    seasonBlock.find((ep) => Number(ep.season) === season && Number(ep.episode_num) === episode);
  if (!match?.id) {
    throw new Error(`Eh!IPTV: episódio S${season}E${episode} não encontrado para series_id=${seriesId}`);
  }
  const extension = match.container_extension || FILE_EXTENSION;
  return { episodeId: match.id, extension };
}

/** Clears both series caches. Call on logout or when the operator
 *  rotates credentials. */
export function clearSeriesEpisodeCache() {
  seriesEpisodeCache.clear();
  seriesInfoCache.clear();
}

/**
 * Build the Xtream Codes playback URL for a single movie or one episode of a
 * series. Throws when the option is missing its id, the Xtream server cannot
 * be reached, or a series request lands without season/episode context.
 *
 * Movie playback is synchronous (uses `option.id` directly). Series playback
 * is async because we have to look up the real episode id from the Xtream
 * API before we can construct the URL.
 */
export async function buildPlaybackUrl(
  service: PlaybackService,
  option: StreamOption,
  kind: Kind,
  episode?: { season: number; episode: number }
): Promise<string> {
  const base = service.baseUrl.replace(/\/+$/, "");
  if (!base) throw new Error("Eh!IPTV: baseUrl is required");
  if (!service.username) throw new Error("Eh!IPTV: username is required");
  if (!service.password) throw new Error("Eh!IPTV: password is required");

  const user = encodeURIComponent(service.username);
  const pass = encodeURIComponent(service.password);

  if (kind === "movie") {
    if (option.id == null || option.id === "") {
      throw new Error("Eh!IPTV: sem stream_id para este título");
    }
    return `${base}/movie/${user}/${pass}/${option.id}.${FILE_EXTENSION}`;
  }

  if (!episode) throw new Error("Eh!IPTV: episódio obrigatório para séries");
  if (option.id == null || option.id === "") {
    throw new Error("Eh!IPTV: sem series_id para este título");
  }
  const { episodeId, extension } = await resolveSeriesEpisodeId(
    service,
    option.id,
    episode.season,
    episode.episode
  );
  return `${base}/series/${user}/${pass}/${episodeId}.${extension}`;
}

/** Dev / diagnostics handle — re-exports the field/collection names so support tooling can echo them. */
export const __ehiptvPlayConfig = {
  movieIdField: MOVIE_ID_FIELD,
  seriesIdField: SERIES_ID_FIELD,
  vodTitleField: VOD_TITLE_FIELD,
  seriesTitleField: SERIES_TITLE_FIELD,
  fileExtension: FILE_EXTENSION
} as const;
