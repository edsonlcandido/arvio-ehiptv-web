import { jsonRequest, proxiedUrl } from "./http";

// Xtream Codes client that ALWAYS routes through /api/xtream so mixed
// content and CORS are solved at the edge.

export type XtreamCredentials = {
  server: string; // e.g. http://server.example.com:8080
  username: string;
  password: string;
};

export type XtreamCategory = {
  category_id: string;
  category_name: string;
  parent_id?: number | string;
};

export type XtreamLiveStream = {
  num: number;
  stream_id: number;
  name: string;
  stream_type: "live" | "movie" | "series" | string;
  stream_icon?: string;
  epg_channel_id?: string;
  category_id?: string;
  tv_archive?: number;
  tv_archive_duration?: number;
};

export type XtreamVodStream = XtreamLiveStream & {
  rating?: string;
  container_extension?: string;
  release_year?: string;
};

export type XtreamSeriesStream = XtreamLiveStream & {
  cover?: string;
  plot?: string;
  cast?: string;
  director?: string;
  genre?: string;
  release_date?: string;
  last_modified?: string;
  rating?: string;
  youtube_trailer?: string;
};

export type XtreamSeriesInfo = {
  seasons: Array<{ season_number: number; cover?: string; name?: string }>;
  info: Record<string, unknown>;
  episodes: Record<string, Array<XtreamEpisode>>;
};

export type XtreamEpisode = {
  id: string;
  episode_num: number;
  title: string;
  container_extension?: string;
  info?: Record<string, unknown>;
  custom_sid?: string;
  added?: string;
  season?: number;
  direct_source?: string;
};

const BROWSER_ORIGIN = typeof window !== "undefined" ? window.location.origin : "";

export function xtreamApiUrl(params: {
  credentials?: XtreamCredentials;
  action?: string;
  extra?: Record<string, string | number | undefined>;
  /** When provided, bypasses build mode and forwards the URL verbatim. */
  direct?: string;
}): string {
  if (params.direct) {
    return proxiedUrl(params.direct);
  }
  const url = new URL("/api/xtream", BROWSER_ORIGIN);
  if (params.credentials) {
    url.searchParams.set("server", params.credentials.server);
    url.searchParams.set("user", params.credentials.username);
    url.searchParams.set("pass", params.credentials.password);
  }
  if (params.action) url.searchParams.set("action", params.action);
  if (params.extra) {
    for (const [k, v] of Object.entries(params.extra)) {
      if (v !== undefined && v !== null && v !== "") {
        url.searchParams.set(`xtream_${k}`, String(v));
      }
    }
  }
  return url.toString();
}

/**
 * Builds the canonical Xtream stream URL for a given stream id and type.
 * Use this to derive the playable URL that should go through the proxy.
 *
 * Examples:
 *   live:  http://server/live/user/pass/12345.ts
 *   vod:   http://server/movie/user/pass/12345.mp4
 *   vod:   http://server/movie/user/pass/12345/ (m3u8 variant if available)
 *   series: http://server/series/user/pass/12345.mp4
 */
export function xtreamStreamUrl(creds: XtreamCredentials, type: "live" | "movie" | "series", streamId: string | number, extension?: string): string {
  const base = creds.server.replace(/\/+$/, "");
  const ext = extension ?? (type === "live" ? "ts" : "mp4");
  return `${base}/${type}/${encodeURIComponent(creds.username)}/${encodeURIComponent(creds.password)}/${streamId}.${ext}`;
}

// ----- Listings -----

export async function xtreamLiveCategories(creds: XtreamCredentials) {
  return jsonRequest<XtreamCategory[]>(xtreamApiUrl({ credentials: creds, action: "get_live_categories" }));
}

export async function xtreamVodCategories(creds: XtreamCredentials) {
  return jsonRequest<XtreamCategory[]>(xtreamApiUrl({ credentials: creds, action: "get_vod_categories" }));
}

export async function xtreamSeriesCategories(creds: XtreamCredentials) {
  return jsonRequest<XtreamCategory[]>(xtreamApiUrl({ credentials: creds, action: "get_series_categories" }));
}

export async function xtreamLiveStreams(creds: XtreamCredentials, categoryId?: string) {
  const url = xtreamApiUrl({
    credentials: creds,
    action: "get_live_streams",
    extra: categoryId ? { category_id: categoryId } : undefined
  });
  return jsonRequest<XtreamLiveStream[]>(url);
}

export async function xtreamVodStreams(creds: XtreamCredentials, categoryId?: string) {
  const url = xtreamApiUrl({
    credentials: creds,
    action: "get_vod_streams",
    extra: categoryId ? { category_id: categoryId } : undefined
  });
  return jsonRequest<XtreamVodStream[]>(url);
}

export async function xtreamSeries(creds: XtreamCredentials, categoryId?: string) {
  const url = xtreamApiUrl({
    credentials: creds,
    action: "get_series",
    extra: categoryId ? { category_id: categoryId } : undefined
  });
  return jsonRequest<XtreamSeriesStream[]>(url);
}

export async function xtreamSeriesInfo(creds: XtreamCredentials, seriesId: string | number) {
  const url = xtreamApiUrl({
    credentials: creds,
    action: "get_series_info",
    extra: { series_id: seriesId }
  });
  return jsonRequest<XtreamSeriesInfo>(url);
}

export async function xtreamVodInfo(creds: XtreamCredentials, vodId: string | number) {
  const url = xtreamApiUrl({
    credentials: creds,
    action: "get_vod_info",
    extra: { vod_id: vodId }
  });
  return jsonRequest<{ info: Record<string, unknown>; movie_data: XtreamVodStream }>(url);
}

/**
 * Try m3u8 extension first (HLS, what hls.js likes), then fall back to mp4.
 * Returns the URL already wrapped through /api/proxy so the browser sees HTTPS.
 */
export async function resolveXtreamStreamUrl(creds: XtreamCredentials, type: "live" | "movie" | "series", streamId: string | number, preferredExt?: string) {
  const candidates: string[] = [];
  if (type === "live") {
    candidates.push(xtreamStreamUrl(creds, type, streamId, "m3u8"));
    candidates.push(xtreamStreamUrl(creds, type, streamId, "ts"));
  } else {
    if (preferredExt) candidates.push(xtreamStreamUrl(creds, type, streamId, preferredExt));
    candidates.push(xtreamStreamUrl(creds, type, streamId, "m3u8"));
    candidates.push(xtreamStreamUrl(creds, type, streamId, "mp4"));
  }
  // Hand each candidate to the proxy; hls.js / the <video> element will
  // figure out which one the server actually serves.
  return proxiedUrl(candidates[0], {
    // Some providers reject requests without a UA; this one is harmless.
    "user-agent": navigator.userAgent
  });
}

/**
 * Detect if a given M3U URL is actually a Xtream-style playlist (server
 * endpoint that requires username/password). Returns the credentials or null.
 */
export function parseXtreamFromM3u(m3uUrl: string): { credentials: XtreamCredentials; type: "live" | "movie" | "series" } | null {
  // Patterns:
  //   http(s)://host:port/get.php?username=u&password=p&type=m3u_plus&output=m3u8
  //   http(s)://host:port/playlist?username=u&password=p
  //   http(s)://host:port/m3u?u=u&p=p
  try {
    const u = new URL(m3uUrl);
    const username = u.searchParams.get("username") ?? u.searchParams.get("u");
    const password = u.searchParams.get("password") ?? u.searchParams.get("p");
    if (!username || !password) return null;
    const typeParam = (u.searchParams.get("type") ?? "").toLowerCase();
    let type: "live" | "movie" | "series" = "live";
    if (typeParam.includes("vod") || typeParam.includes("movie")) type = "movie";
    else if (typeParam.includes("series")) type = "series";
    return {
      credentials: { server: `${u.protocol}//${u.host}`, username, password },
      type
    };
  } catch {
    return null;
  }
}