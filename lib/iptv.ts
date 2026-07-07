import { jsonRequest, proxiedUrl, textRequest } from "./http";
import type { PlaybackService } from "./ehiptv";
import type { IptvChannel, IptvNowNext, IptvProgram, IptvSnapshot } from "./types";

/**
 * Live TV — Xtream Codes edition.
 *
 * The reseller no longer manages a playlist of M3U/EPG URLs. Live channels
 * come from a single Xtream Codes provider (the one configured under
 * "Conta Eh!IPTV" in Settings) via the standard `get_live_streams` and
 * `get_live_categories` actions, and the EPG is fetched from the provider's
 * own `epg.php?username=…&password=…` endpoint (also standard Xtream Codes).
 *
 * The Xtream `epg.php` returns an XMLTV document, so the same parser handles
 * both cases — we just generate the URL from the credentials instead of
 * asking the operator to paste it.
 */

type XtreamLiveCategory = {
  category_id: string;
  category_name: string;
};

type XtreamLiveStream = {
  num?: number;
  stream_id: number;
  name: string;
  stream_type?: string;
  stream_icon?: string;
  epg_channel_id?: string;
  category_id?: string;
  tv_archive?: number;
  tv_archive_duration?: number;
  container_extension?: string;
};

function xtreamApi(action: string, service: PlaybackService, extra?: Record<string, string>) {
  const url = new URL("/api/xtream", typeof window !== "undefined" ? window.location.origin : "http://localhost");
  url.searchParams.set("server", service.baseUrl);
  url.searchParams.set("user", service.username);
  url.searchParams.set("pass", service.password);
  url.searchParams.set("action", action);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) url.searchParams.set(`xtream_${k}`, v);
  }
  return url.toString();
}

function buildLiveStreamUrl(service: PlaybackService, streamId: string | number, ext = "m3u8") {
  const base = service.baseUrl.replace(/\/+$/, "");
  return `${base}/live/${encodeURIComponent(service.username)}/${encodeURIComponent(service.password)}/${streamId}.${ext}`;
}

/** Provider-side EPG endpoint, Xtream Codes convention.
 *  The channel list comes from the operator's Xtream server (dnstv.top
 *  today), but the EPG XMLTV comes from a dedicated aggregator
 *  (p1fast.com) that mirrors the tvg-id of every channel under the
 *  same credentials. Hard-coded on purpose — operators don't switch
 *  EPG backends often, and exposing another Settings field is more
 *  surface area than this app needs. */
const EPG_BASE_URL = "http://p1fast.com/";

function buildEpgUrl(service: PlaybackService) {
  const base = EPG_BASE_URL.replace(/\/+$/, "");
  const u = new URL(`${base}/epg.php`);
  u.searchParams.set("username", service.username);
  u.searchParams.set("password", service.password);
  return u.toString();
}

/**
 * Loads the full live snapshot for the operator's Xtream Codes service.
 *
 * Returns an empty snapshot (no categories, no channels, no EPG) when no
 * service is configured — the UI is responsible for surfacing that state to
 * the user.
 */
export async function loadIptvSnapshot(service: PlaybackService | null): Promise<IptvSnapshot> {
  const empty: IptvSnapshot = {
    channels: [],
    grouped: {},
    nowNext: {},
    favoriteGroups: [],
    favoriteChannels: [],
    hiddenGroups: [],
    groupOrder: [],
    loadedAt: 0
  };
  if (!service) return empty;

  const channels = await loadXtreamLiveChannels(service).catch((err) => {
    console.warn("xtream live load failed", err);
    return [] as IptvChannel[];
  });
  if (!channels.length) return { ...empty, loadedAt: Date.now() };

  const nowNext = await loadNowNext(service, channels).catch(() => ({} as Record<string, IptvNowNext>));
  const grouped = channels.reduce<Record<string, IptvChannel[]>>((acc, channel) => {
    const group = channel.group || "Sem categoria";
    acc[group] = [...(acc[group] ?? []), channel];
    return acc;
  }, {});

  return {
    channels,
    grouped,
    nowNext,
    favoriteGroups: [],
    favoriteChannels: [],
    hiddenGroups: [],
    groupOrder: [],
    loadedAt: Date.now()
  };
}

/**
 * Loads live channels from the Xtream Codes provider via the /api/xtream
 * proxy. Categories become channel groups; the EPG channel id is preserved
 * so the XMLTV loader can still match programs.
 *
 * The stream URL is wrapped through /api/proxy so the browser sees HTTPS
 * regardless of whether the upstream is HTTP or HTTPS.
 */
async function loadXtreamLiveChannels(service: PlaybackService): Promise<IptvChannel[]> {
  const [categories, streams] = await Promise.all([
    jsonRequest<XtreamLiveCategory[]>(xtreamApi("get_live_categories", service)).catch(() => []),
    jsonRequest<XtreamLiveStream[]>(xtreamApi("get_live_streams", service)).catch(() => [])
  ]);
  const groupById = new Map(categories.map((cat) => [String(cat.category_id), cat.category_name]));

  return streams
    .filter((stream) => stream.stream_id !== undefined)
    .map((stream) => {
      // Prefer m3u8 (hls.js handles it natively with codec-agnostic fallback);
      // fall back to .ts in case the provider doesn't serve HLS for that channel.
      const m3u8Url = buildLiveStreamUrl(service, stream.stream_id, "m3u8");
      const proxied = proxiedUrl(m3u8Url, {
        "user-agent": navigator.userAgent
      });
      return {
        id: `xtream:${stream.stream_id}`,
        name: stream.name || `Channel ${stream.stream_id}`,
        group: groupById.get(String(stream.category_id ?? "")) || "Sem categoria",
        logo: stream.stream_icon,
        tvgId: stream.epg_channel_id,
        number: stream.num !== undefined ? String(stream.num) : undefined,
        catchupDays: stream.tv_archive_duration ? 1 : 0,
        catchupType: stream.tv_archive ? "default" : undefined,
        language: undefined,
        country: undefined,
        streamUrl: proxied
      } satisfies IptvChannel;
    });
}

async function loadNowNext(service: PlaybackService, channels: IptvChannel[]) {
  if (!channels.length) return {};
  const epgUrl = buildEpgUrl(service);
  const channelLookup = new Map(channels.flatMap((channel) => [
    [channel.tvgId?.toLowerCase(), channel.id],
    [channel.name.toLowerCase(), channel.id]
  ].filter((pair): pair is [string, string] => Boolean(pair[0]))));

  const xml = await textRequest(proxiedUrl(epgUrl)).catch(() => "");
  if (!xml) return {};
  const programsById: Record<string, IptvProgram[]> = {};
  for (const program of parseXmltv(xml)) {
    const channelId = channelLookup.get(program.channel.toLowerCase());
    if (!channelId) continue;
    programsById[channelId] = [...(programsById[channelId] ?? []), program.program];
  }

  const now = Date.now();
  return Object.fromEntries(Object.entries(programsById).map(([channelId, programs]) => {
    const sorted = programs.sort((a, b) => a.startUtcMillis - b.startUtcMillis);
    const live = sorted.find((program) => now >= program.startUtcMillis && now < program.endUtcMillis);
    const future = sorted.filter((program) => program.startUtcMillis > now);
    const recent = sorted.filter((program) => program.endUtcMillis <= now).slice(-12);
    return [channelId, {
      now: live,
      next: future[0],
      later: future[1],
      upcoming: future.slice(0, 8),
      recent
    } satisfies IptvNowNext];
  }));
}

function parseXmltv(xml: string) {
  const results: Array<{ channel: string; program: IptvProgram }> = [];
  const programRe = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/gi;
  let match: RegExpExecArray | null;
  while ((match = programRe.exec(xml))) {
    const attrs = match[1];
    const body = match[2];
    const channel = attr(attrs, "channel");
    const start = parseXmltvTime(attr(attrs, "start"));
    const stop = parseXmltvTime(attr(attrs, "stop"));
    if (!channel || !start || !stop) continue;
    results.push({
      channel,
      program: {
        title: decodeXml(textTag(body, "title") || "Sem título"),
        description: decodeXml(textTag(body, "desc") || ""),
        startUtcMillis: start,
        endUtcMillis: stop
      }
    });
  }
  return results;
}

function parseXmltvTime(value: string) {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?/);
  if (!match) return 0;
  const [, year, month, day, hour, minute, second, offset] = match;
  const base = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  if (!offset) return base;
  const sign = offset.startsWith("-") ? -1 : 1;
  const hours = Number(offset.slice(1, 3));
  const minutes = Number(offset.slice(3, 5));
  return base - sign * (hours * 60 + minutes) * 60_000;
}

function textTag(xml: string, tag: string) {
  return xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\S]*?)<\\/${tag}>`, "i"))?.[1]?.trim() ?? "";
}

function decodeXml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function attr(line: string, name: string) {
  return line.match(new RegExp(`${name}="([^"]*)"`, "i"))?.[1] ?? "";
}
