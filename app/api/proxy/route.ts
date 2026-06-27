import { NextRequest, NextResponse } from "next/server";

const BLOCKED_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

export async function GET(request: NextRequest) {
  const input = new URL(request.url);
  const raw = input.searchParams.get("url");
  if (!raw) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  if (!["http:", "https:"].includes(target.protocol) || BLOCKED_HOSTS.has(target.hostname)) {
    return NextResponse.json({ error: "Blocked proxy target" }, { status: 400 });
  }

  const forwardedHeaders = decodeHeaders(input.searchParams.get("headers"));
  const response = await fetch(target, {
    headers: forwardedHeaders,
    cache: "no-store",
    redirect: "follow"
  });

  const contentType = response.headers.get("content-type") ?? "application/octet-stream";
  const finalUrl = response.url;

  const headers = new Headers();
  headers.set("access-control-allow-origin", "*");
  headers.set("cache-control", "no-store");

  // Rewrite segment URLs inside .m3u8 manifests so every subsequent request
  // (segments .ts, sub-playlists .m3u8) also flows through this proxy.
  if (isHlsManifest(contentType, raw)) {
    const text = await response.text();
    // Use the ORIGINAL url as base (not response.url after redirects) to avoid
    // loops when the streaming server redirects back to our proxy origin.
    const base = raw;
    const proxyOrigin = new URL(request.url).origin;
    const rewritten = rewriteHlsManifest(text, base, proxyOrigin);
    headers.set("content-type", contentType);
    return new NextResponse(rewritten, { status: response.status, headers });
  }

  headers.set("content-type", contentType);
  return new NextResponse(response.body, { status: response.status, headers });
}

/**
 * Returns true when the response is an M3U8 playlist (text, not binary / fMP4).
 */
function isHlsManifest(contentType: string, originalUrl: string): boolean {
  const ct = contentType.toLowerCase();
  return (
    ct.includes("application/vnd.apple.mpegurl") ||
    ct.includes("application/x-mpegurl") ||
    ct.includes("audio/mpegurl") ||
    ct.includes("text/plain") ||
    originalUrl.includes(".m3u8") ||
    originalUrl.includes(".m3u")
  );
}

/**
 * Rewrites every segment / sub-manifest URL so it passes through the proxy.
 * Handles absolute URLs (http://...), absolute paths (/path/file.ts), and
 * preserves query strings and tokens.
 *
 * IMPORTANT: Resolves the URL against the base BEFORE checking if it already
 * points to the proxy. A relative URL like `?url=...` or `../api/proxy?...`
 * would resolve to the proxy origin and must be skipped to avoid infinite
 * recursion (proxy wrapping itself).
 */
function rewriteHlsManifest(body: string, baseUrl: string, proxyOrigin: string): string {
  const base = new URL(baseUrl);
  const proxyOriginUrl = new URL(proxyOrigin);

  return body
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return line;

      let segmentUrl: string;
      try {
        if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
          segmentUrl = trimmed;
        } else {
          segmentUrl = new URL(trimmed, base).toString();
        }
      } catch {
        return line;
      }

      // Skip if the resolved URL already points back to this proxy.
      // This catches both absolute proxy URLs and relative ones that resolve
      // to the proxy origin (e.g. `?url=...` against a proxy base).
      try {
        const resolved = new URL(segmentUrl);
        if (
          resolved.origin === proxyOriginUrl.origin &&
          resolved.pathname.startsWith("/api/proxy")
        ) {
          return line;
        }
      } catch {
        // ignore parse errors and fall through to wrapping
      }

      const proxyTarget = new URL("/api/proxy", proxyOrigin);
      proxyTarget.searchParams.set("url", segmentUrl);
      return proxyTarget.toString();
    })
    .join("\n");
}

export async function POST(request: NextRequest) {
  const input = new URL(request.url);
  const raw = input.searchParams.get("url");
  if (!raw) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }
  if (!["http:", "https:"].includes(target.protocol) || BLOCKED_HOSTS.has(target.hostname)) {
    return NextResponse.json({ error: "Blocked proxy target" }, { status: 400 });
  }

  const forwardedHeaders = decodeHeaders(input.searchParams.get("headers")) ?? {};
  const body = await request.text();
  const response = await fetch(target, {
    method: "POST",
    headers: { "content-type": "application/json", ...forwardedHeaders },
    body,
    cache: "no-store",
    redirect: "follow"
  });

  const headers = new Headers();
  headers.set("content-type", response.headers.get("content-type") ?? "application/json");
  headers.set("cache-control", "no-store");
  headers.set("access-control-allow-origin", "*");
  return new NextResponse(response.body, { status: response.status, headers });
}

function decodeHeaders(raw: string | null) {
  if (!raw) return undefined;
  try {
    return JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as Record<string, string>;
  } catch {
    return undefined;
  }
}
