import { NextRequest, NextResponse } from "next/server";

// CRITICAL: Node runtime so we can stream long responses (xtream XMLTV EPGs
// can be tens of MB) and not hit Edge body caps.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-action cache TTLs (seconds). Listings change often, categories rarely.
const CACHE_TTL: Record<string, number> = {
  get_live_categories: 3600,
  get_vod_categories: 3600,
  get_series_categories: 3600,
  get_live_streams: 120,
  get_vod_streams: 180,
  get_series: 300,
  get_series_info: 600,
  get_vod_info: 600,
  get_live_stream_info: 60,
  get_short_epg: 30,
  get_simple_data_table: 60
};
const DEFAULT_TTL = 60;

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "content-encoding",
  "content-length",
  "content-security-policy",
  "x-frame-options",
  "set-cookie"
]);

const BLOCKED_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}

async function handle(request: NextRequest) {
  const input = new URL(request.url);

  // Two calling styles are supported:
  // 1) pass the full Xtream URL via ?url=... (preserves all original params)
  // 2) build the URL from ?server=, ?user=, ?pass=, ?action=... (+ extras)
  const direct = input.searchParams.get("url");
  let target: URL;
  try {
    target = direct
      ? new URL(direct)
      : buildXtreamUrl(input);
  } catch {
    return NextResponse.json({ error: "Invalid xtream parameters" }, { status: 400 });
  }

  if (!["http:", "https:"].includes(target.protocol) || BLOCKED_HOSTS.has(target.hostname.toLowerCase())) {
    return NextResponse.json({ error: "Blocked xtream target" }, { status: 400 });
  }

  const action = input.searchParams.get("action") ?? target.searchParams.get("action") ?? "default";
  const ttl = CACHE_TTL[action] ?? DEFAULT_TTL;

  let body: BodyInit | undefined;
  if (request.method === "POST") {
    body = await request.text();
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers: {
        "user-agent": request.headers.get("user-agent") ?? "Arvio/1.0",
        accept: "application/json, text/plain, */*"
      },
      body,
      cache: "no-store",
      redirect: "follow"
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Xtream fetch failed";
    return NextResponse.json({ error: `Xtream unreachable: ${message}` }, { status: 502 });
  }

  // Forward upstream body. The Xtream API returns JSON or XMLTV (XML).
  const out = new Headers();
  for (const [k, v] of upstream.headers.entries()) {
    if (HOP_BY_HOP.has(k.toLowerCase())) continue;
    out.append(k, v);
  }
  out.set("access-control-allow-origin", "*");
  out.set("access-control-allow-headers", "*");
  if (!out.has("cache-control")) {
    out.set("cache-control", `public, max-age=${ttl}`);
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: out
  });
}

/**
 * Builds a Xtream Codes player_api.php URL from individual query params.
 * Mirrors the URL shape used by virtually every Xtream provider:
 *   http(s)://server:port/player_api.php?username=...&password=...&action=...
 */
function buildXtreamUrl(input: URL): URL {
  const server = input.searchParams.get("server");
  const user = input.searchParams.get("user");
  const pass = input.searchParams.get("pass");
  const action = input.searchParams.get("action");
  if (!server || !user || !pass) {
    throw new Error("server, user and pass are required when url is omitted");
  }

  const base = server.replace(/\/+$/, "");
  // Allow caller to override the path (e.g. /api.php instead of /player_api.php)
  const path = input.searchParams.get("path") ?? "/player_api.php";
  const target = new URL(`${base}${path.startsWith("/") ? path : `/${path}`}`);

  target.searchParams.set("username", user);
  target.searchParams.set("password", pass);
  if (action) target.searchParams.set("action", action);

  // Copy any other xtream_* params through (category_id, series_id, vod_id, limit, etc).
  for (const [k, v] of input.searchParams.entries()) {
    if (k === "server" || k === "user" || k === "pass" || k === "action" || k === "path") continue;
    if (k.startsWith("xtream_")) target.searchParams.set(k.slice("xtream_".length), v);
  }
  return target;
}