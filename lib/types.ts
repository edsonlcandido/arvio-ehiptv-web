export type MediaType = "movie" | "tv";

export type NavSection = "home" | "tv" | "search" | "watchlist" | "addons" | "settings";

export interface MediaItem {
  id: number;
  title: string;
  subtitle?: string;
  overview?: string;
  year?: string;
  releaseDate?: string | null;
  rating?: string;
  duration?: string;
  mediaType: MediaType;
  image?: string;
  backdrop?: string | null;
  progress?: number;
  isWatched?: boolean;
  badge?: string | null;
  genreIds?: number[];
  nextEpisode?: NextEpisode | null;
  timeRemainingLabel?: string | null;
  trailerUrl?: string | null;
  cast?: PersonCredit[];
  seasons?: SeasonSummary[];
  related?: MediaItem[];
  // Home server (Plex/Jellyfin/Emby) direct playback
  isHomeServer?: boolean;
  homeServerUrl?: string | null;
}

export interface NextEpisode {
  id: number;
  seasonNumber: number;
  episodeNumber: number;
  name: string;
  overview?: string;
}

export interface PersonCredit {
  id: number;
  name: string;
  character?: string;
  image?: string;
}

export interface SeasonSummary {
  id: number;
  seasonNumber: number;
  name: string;
  episodeCount?: number;
  poster?: string;
}

export interface EpisodeInfo {
  id: number;
  episodeNumber: number;
  seasonNumber: number;
  name: string;
  overview?: string;
  still?: string;
  voteAverage?: number;
  airDate?: string;
  runtime?: number;
}

export interface ReviewInfo {
  id: string;
  author: string;
  content: string;
  rating?: number | null;
  createdAt?: string;
  avatar?: string | null;
}

export interface Category {
  id: string;
  title: string;
  items: MediaItem[];
  sourceLabel?: string;
  layout?: "landscape" | "poster";
  sourceUrl?: string;
}

export type CatalogSourceType =
  | "preinstalled"
  | "tmdb"
  | "mdblist"
  | "addon"
  | "home-server"
  | "template";

export interface CatalogConfig {
  id: string;
  name: string;
  sourceType: CatalogSourceType;
  mediaType?: MediaType | "all";
  sourceUrl?: string;
  sourceRef?: string;
  endpoint?: string;
  params?: Record<string, string | number | boolean>;
  enabled: boolean;
  isPreinstalled?: boolean;
  layout?: "landscape" | "poster";
}

export interface StreamBehaviorHints {
  notWebReady?: boolean;
  cached?: boolean | null;
  bingeGroup?: string | null;
  proxyHeaders?: {
    request?: Record<string, string>;
    response?: Record<string, string>;
  } | null;
  filename?: string | null;
}

export interface SubtitleTrack {
  id: string;
  url: string;
  lang: string;
  label: string;
  provider?: string;
  isEmbedded?: boolean;
  isForced?: boolean;
}

export interface StreamSource {
  source: string;
  addonName: string;
  addonId?: string;
  quality?: string;
  size?: string;
  sizeBytes?: number | null;
  url?: string | null;
  infoHash?: string | null;
  fileIdx?: number | null;
  behaviorHints?: StreamBehaviorHints | null;
  subtitles?: SubtitleTrack[];
  sources?: string[];
  description?: string | null;
}

export interface InstalledAddon {
  id: string;
  name: string;
  version: string;
  manifestUrl: string;
  description?: string | null;
  catalogs: AddonCatalog[];
  resources: string[];
  logo?: string | null;
  background?: string | null;
  enabled?: boolean;
}

export interface AddonCatalog {
  type: string;
  id: string;
  name: string;
  extra?: Array<{ name: string; isRequired?: boolean; options?: string[] }>;
}

export interface IptvChannel {
  id: string;
  name: string;
  group: string;
  logo?: string;
  streamUrl: string;
  tvgId?: string;
  number?: string;
  catchupDays?: number;
  catchupType?: string;
  catchupSource?: string;
  language?: string;
  country?: string;
  qualityLabel?: string;
}

export interface IptvProgram {
  title: string;
  description?: string;
  startUtcMillis: number;
  endUtcMillis: number;
  catchupAvailable?: boolean;
}

export interface IptvNowNext {
  now?: IptvProgram;
  next?: IptvProgram;
  later?: IptvProgram;
  upcoming: IptvProgram[];
  recent: IptvProgram[];
}

export interface IptvSnapshot {
  channels: IptvChannel[];
  grouped: Record<string, IptvChannel[]>;
  nowNext: Record<string, IptvNowNext>;
  favoriteGroups: string[];
  favoriteChannels: string[];
  hiddenGroups: string[];
  groupOrder: string[];
  epgWarning?: string;
  loadedAt: number;
}

export interface HomeServerConfig {
  id: string;
  type: "plex" | "jellyfin" | "emby";
  name: string;
  url: string;
  token?: string;
  username?: string;
  password?: string;
  enabled: boolean;
}

/**
 * Configuration for an on-demand IPTV / VOD stream service. Movies and series
 * resolve to direct-stream URLs that follow a `base/type/user/pass/id.ext`
 * pattern (e.g. `http://dnstv.top/movie/john/abc123/408996.mp4`). The exact
 * ID is typically provided by a per-title catalog endpoint (e.g. a
 * PocketBase-style records collection filtered by tmdb_id / imdb_id).
 */
export interface StreamServiceConfig {
  id: string;
  name: string;
  /** Base URL of the stream tree, e.g. `http://dnstv.top/movie`. Trailing slashes are stripped. */
  baseUrl: string;
  username: string;
  password: string;
  /**
   * Path segment(s) the provider expects between the base URL and the
   * username. `movie` resolves to `<base>/<user>/<pass>/<id>.mp4`,
   * `series` resolves to `<base>/<user>/<pass>/<id>.<ext>`, `both` keeps
   * the layout flexible (the catalog caller decides the path).
   */
  contentType: "movie" | "series" | "both";
  /** File extension used by the provider for movie / series streams (defaults to "mp4"). */
  extension?: string;
  /**
   * Optional lookup endpoint that maps an external id (tmdb/imdb) to the
   * provider's internal stream id. PocketBase-style filters are supported
   * in the form `?filter=(tmdb_id=254474)`.
   */
  lookupUrl?: string;
  enabled: boolean;
}

export interface AppSettings {
  // Playback
  autoPlayNext: boolean;
  autoPlaySingleSource: boolean;
  autoPlayMinQuality: "any" | "hd" | "fhd" | "4k";
  trailerAutoPlay: boolean;
  trailerSound: boolean;
  trailerDelaySeconds: number;
  // Language & audio
  language: string;
  defaultSubtitle: string;
  secondarySubtitle: string;
  audioLanguage: string;
  // Subtitles
  subtitleSize: number;
  subtitleColor: string;
  subtitleOffsetMs: number;
  subtitleStyle: "outline" | "shadow" | "background" | "raised";
  subtitleStylized: boolean;
  filterSubtitlesByLanguage: boolean;
  removeHearingImpaired: boolean;
  // AI subtitles
  aiSubtitlesEnabled: boolean;
  aiSubtitleModel: "off" | "groq" | "gemini";
  aiAutoSelect: boolean;
  aiApiKey: string;
  // Appearance
  cardLayoutMode: "landscape" | "poster";
  deviceModeOverride: "auto" | "tv" | "desktop";
  oledBlack: boolean;
  clockFormat: "12h" | "24h";
  showBudget: boolean;
  smoothScrolling: boolean;
  spoilerBlur: boolean;
  accentColor: string;
  // Network
  dnsProvider: "system" | "cloudflare" | "google" | "quad9";
  showLoadingStats: boolean;
  customUserAgent: string;
  cardDensity: "comfortable" | "compact";
  // Catalogs / addons
  catalogs: CatalogConfig[];
  hiddenCatalogIds: string[];
  disabledAddonIds: string[];
  // Home servers
  homeServers: HomeServerConfig[];
  // VOD / on-demand IPTV stream services (movies + series)
  streamServices: StreamServiceConfig[];
  // IPTV — single Xtream Codes provider, sourced from streamServices[0].
  favoriteChannelIds: string[];
  favoriteGroupIds: string[];
  hiddenGroupIds: string[];
  groupOrder: string[];
}
