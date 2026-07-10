import { NextRequest, NextResponse } from "next/server";

// CRITICAL: must run on Node.js, not Edge. Edge runtime buffers bodies,
// caps response size, and breaks long-lived HLS streams.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Optional allowlist of upstream hostnames. Comma-separated env var.
// When set, only these hosts may be proxied (defense in depth).
// Leave empty (default) to allow any host.
const ALLOWED_HOSTS = (process.env.PROXY_ALLOWED_HOSTS ?? "")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "0.0.0.0",
  "169.254.169.254" // AWS metadata
]);

// Hop-by-hop and headers that MUST NOT be forwarded verbatim.
// - content-encoding: fetch() already decompresses; re-sending the header
//   makes the browser try to decode already-decoded bytes → ERR_CONTENT_DECODING_FAILED.
// - content-length / transfer-encoding: wrong after we rewrite / stream.
// - connection / keep-alive / upgrade / te / trailer: hop-by-hop per RFC 7230.
// - content-security-policy / x-frame-options: would block playback in iframes
//   and could break hls.js worker loading.
// - set-cookie: stripped to avoid leaking upstream session cookies to the client.
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

const REQUEST_HEADER_ALLOWLIST = [
  "accept",
  "accept-language",
  "accept-encoding",
  "user-agent",
  "referer",
  "origin",
  "range",
  "if-range",
  "if-none-match",
  "if-modified-since"
];

// Default upstream timeout: 30s for headers, no timeout for body (streaming).
const UPSTREAM_HEADER_TIMEOUT_MS = 30_000;

export async function GET(request: NextRequest) {
  return handleProxy(request);
}

export async function POST(request: NextRequest) {
  return handleProxy(request);
}

export async function HEAD(request: NextRequest) {
  return handleProxy(request);
}

async function handleProxy(request: NextRequest) {
  const input = new URL(request.url);
  const raw = input.searchParams.get("url");
  if (!raw) return jsonError("Missing url", 400);

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return jsonError("Invalid url", 400);
  }

  if (!["http:", "https:"].includes(target.protocol)) {
    return jsonError("Blocked proxy protocol", 400);
  }
  if (BLOCKED_HOSTS.has(target.hostname.toLowerCase())) {
    return jsonError("Blocked proxy target", 400);
  }
  if (ALLOWED_HOSTS.length > 0 && !ALLOWED_HOSTS.includes(target.hostname.toLowerCase())) {
    return jsonError("Host not in proxy allowlist", 403);
  }

  const extraHeaders = decodeHeaders(input.searchParams.get("headers")) ?? {};

  // Build forwarded headers: client headers (allowlisted) + xtream-style extras.
  const forwarded = new Headers();
  for (const name of REQUEST_HEADER_ALLOWLIST) {
    const value = request.headers.get(name);
    if (value) forwarded.set(name, value);
  }
  for (const [k, v] of Object.entries(extraHeaders)) {
    if (typeof v === "string") forwarded.set(k, v);
  }

  // Build upstream body for POST.
  let upstreamBody: BodyInit | undefined;
  if (request.method === "POST") {
    const ct = request.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      upstreamBody = await request.text();
      if (!forwarded.has("content-type")) forwarded.set("content-type", ct);
    } else {
      // Stream the binary body through verbatim.
      upstreamBody = request.body as unknown as BodyInit;
      if (!forwarded.has("content-type")) forwarded.set("content-type", ct || "application/octet-stream");
    }
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(target, {
      method: request.method,
      headers: forwarded,
      body: upstreamBody,
      redirect: "follow",
      cache: "no-store"
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upstream fetch failed";
    return jsonError(`Upstream error: ${message}`, 502);
  }

  // Compute the URL we actually fetched (post-redirect). Critical for
  // IPTV servers that hand out DNS URLs (e.g. dnstv.top) and 302 to a
  // short-lived numerical-IP URL carrying an auth token (e.g. ?token=ABC).
  // All subsequent segment / key / map URLs in the manifest must be
  // resolved against this FINAL URL, not the original, or the token is
  // lost and segments 404 after the token expires.
  let resolvedUrl = raw;
  try {
    resolvedUrl = new URL(response.url).toString();
    const requestOrigin = getPublicOrigin(request);
    const finalParsed = new URL(resolvedUrl);
    if (finalParsed.origin === requestOrigin && finalParsed.pathname.startsWith("/api/proxy")) {
      return jsonError("Proxy redirect loop detected", 508);
    }
  } catch {
    /* ignore parse errors, keep using raw */
  }

  const upstreamContentType = response.headers.get("content-type") ?? "";
  const isHls =
    upstreamContentType.includes("application/vnd.apple.mpegurl") ||
    upstreamContentType.includes("application/x-mpegurl") ||
    upstreamContentType.includes("audio/mpegurl") ||
    raw.toLowerCase().includes(".m3u8") ||
    raw.toLowerCase().includes(".m3u");

  // Build the response headers, stripping hop-by-hop + dangerous ones.
  const outHeaders = new Headers();
  for (const [k, v] of response.headers.entries()) {
    if (HOP_BY_HOP.has(k.toLowerCase())) continue;
    outHeaders.append(k, v);
  }
  outHeaders.set("access-control-allow-origin", "*");
  outHeaders.set("access-control-allow-headers", "*");
  outHeaders.set("access-control-expose-headers", "Content-Range, Accept-Ranges, Content-Length");
  // Discourage caching of live streams; safe to leave for short TTLs otherwise.
  if (!outHeaders.has("cache-control")) {
    outHeaders.set("cache-control", isHls ? "no-store" : "public, max-age=60");
  }

  // If it's an HLS manifest, rewrite ALL URLs (segments, keys, maps, media)
  // so they pass through this proxy. We resolve relative URLs against
  // `resolvedUrl` (post-redirect, with token) instead of the original `raw`.
  // The rewritten URLs are emitted as absolute paths so the browser resolves
  // them against the page origin — works regardless of how the request hit us.
  if (isHls && response.body) {
    const text = await response.text();
    const rewritten = rewriteHlsManifest(text, resolvedUrl);
    outHeaders.set("content-type", upstreamContentType || "application/vnd.apple.mpegurl");
    return new NextResponse(rewritten, {
      status: response.status,
      headers: outHeaders
    });
  }

  // Binary stream (segments, .ts, .mp4, .aac, .key): pipe body directly.
  if (!outHeaders.has("content-type")) {
    outHeaders.set("content-type", upstreamContentType || "application/octet-stream");
  }
  return new NextResponse(response.body, {
    status: response.status,
    headers: outHeaders
  });
}

// ---------- helpers ----------

/**
 * Resolve the public origin the BROWSER used to hit this proxy.
 *
 * Why not `new URL(request.url).origin`?
 *   When Next.js runs behind a reverse proxy (nginx, caddy, Cloudflare,
 *   AWS ALB, ...) that does not forward `Host` / `X-Forwarded-Host`,
 *   `request.url` is reconstructed from the server-side socket and ends
 *   up as `http://localhost:3000/...`. If we use that to rewrite segment
 *   URLs inside the HLS manifest, the browser then tries to fetch
 *   `http://localhost:3000/api/proxy?url=...ts` from ITS OWN localhost
 *   and the stream breaks.
 *
 * Resolution order:
 *   1. `PUBLIC_BASE_URL` env var (manual override — escape hatch when the
 *      reverse proxy can't be reconfigured to forward headers).
 *   2. `X-Forwarded-Host` + `X-Forwarded-Proto` (set by most reverse proxies).
 *   3. `Host` header + protocol inferred from hostname.
 *   4. `request.url` (last resort — only correct when the app is exposed
 *      directly without a proxy, e.g. local dev).
 */
function getPublicOrigin(request: NextRequest): string {
  const override = process.env.PUBLIC_BASE_URL?.replace(/\/+$/, "");
  if (override) return override;

  const xfh = request.headers.get("x-forwarded-host");
  const xfp = request.headers.get("x-forwarded-proto");
  const host = request.headers.get("host");

  const hostname = (xfh || host || "").trim();
  if (hostname) {
    const protocol = (xfp || "").trim()
      || (/^(localhost|127\.|0\.0\.0\.0|\[?::1\]?)(:\d+)?$/i.test(hostname) ? "http" : "https");
    return `${protocol}://${hostname}`;
  }

  // Last resort: server-side URL. Will be wrong behind a misconfigured
  // reverse proxy, but better than crashing the request.
  try {
    return new URL(request.url).origin;
  } catch {
    return "";
  }
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function fetchWithTimeout(input: string | URL, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_HEADER_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function decodeHeaders(raw: string | null): Record<string, string> | null {
  if (!raw) return null;
  try {
    const decoded = JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as Record<string, string>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(decoded)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * Rewrites every URL inside an HLS manifest so subsequent requests
 * (segments .ts, sub-playlists .m3u8, AES keys, init segments, alternate
 * audio renditions) also flow through this proxy.
 *
 * Handles:
 * - plain segment lines: `seg-001.ts`
 * - absolute URLs: `http://cdn/foo.ts`
 * - absolute paths: `/foo/seg.ts`
 * - query-relative URLs: `?token=abc&file=seg.ts`
 * - `#EXT-X-KEY:METHOD=AES-128,URI="https://.../key.bin"`
 * - `#EXT-X-MAP:URI="init.mp4"` (fMP4 init segment)
 * - `#EXT-X-MEDIA:URI="audio.m3u8"` (alternate audio / multilingual)
 * - `#EXT-X-PRELOAD-HINT:URI="..."`
 * - `#EXT-X-START` (no URI, skipped)
 * - `#EXT-X-BYTERANGE` (no URI on the line itself)
 *
 * IMPORTANT: rewritten URLs are emitted as ABSOLUTE PATHS (`/api/proxy?url=...`)
 * rather than absolute URLs with a host. The browser / hls.js resolves them
 * against the manifest's URL (= the page origin the user is on), so they
 * automatically work in dev (`http://localhost:3000`), in production behind a
 * reverse proxy, in Cloudflare tunnels, behind port-forwarding, etc. — without
 * needing the server to guess the public origin from `Host` / `X-Forwarded-*`
 * headers (which can be misconfigured). If the page is loaded from
 * `https://player.ehtudo.app/`, the segments resolve to
 * `https://player.ehtudo.app/api/proxy?url=...ts`. If from
 * `http://localhost:3000/`, they resolve to `http://localhost:3000/api/proxy?url=...ts`.
 */
function rewriteHlsManifest(body: string, baseUrl: string): string {
  const base = new URL(baseUrl);

  return body
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();

      // Comment lines: rewrite URIs inside attribute lists when present.
      if (trimmed.startsWith("#")) {
        return rewriteHlsAttributeLine(trimmed, base);
      }

      if (!trimmed) return line;

      let absolute: string;
      try {
        absolute = resolveUrl(trimmed, base);
      } catch {
        return line;
      }

      // Skip if it already routes through this proxy (avoid proxy?url=proxy?url=…).
      if (isProxyUrl(absolute)) return line;

      return makeProxyUrl(absolute);
    })
    .join("\n");
}

function rewriteHlsAttributeLine(line: string, base: URL): string {
  // Match every URI="..." attribute (case-insensitive, quoted with " or ').
  return line.replace(/URI=(["'])([^"']*)\1/gi, (_match, quote, value) => {
    const trimmed = value.trim();
    if (!trimmed) return `URI=${quote}${value}${quote}`;
    let absolute: string;
    try {
      absolute = resolveUrl(trimmed, base);
    } catch {
      return `URI=${quote}${value}${quote}`;
    }
    if (isProxyUrl(absolute)) return `URI=${quote}${value}${quote}`;
    return `URI=${quote}${makeProxyUrl(absolute)}${quote}`;
  });
}

function resolveUrl(value: string, base: URL): string {
  if (/^https?:\/\//i.test(value)) return value;
  // Use URL constructor for everything — handles absolute paths, query-relative,
  // protocol-relative, and normal relative URLs uniformly.
  return new URL(value, base).toString();
}

function isProxyUrl(url: string): boolean {
  // Upstream URLs never have `/api/proxy` in their path on legitimate
  // IPTV/manifest servers, so this is a safe proxy-detector without needing
  // to know the current origin.
  try {
    const parsed = new URL(url);
    return parsed.pathname === "/api/proxy"
      || parsed.pathname.startsWith("/api/proxy/")
      || parsed.pathname.startsWith("/api/proxy?");
  } catch {
    return false;
  }
}

function makeProxyUrl(target: string): string {
  // Absolute path — the browser resolves it against the manifest URL,
  // which is the page origin the user actually loaded. No origin guessing.
  return `/api/proxy?url=${encodeURIComponent(target)}`;
}