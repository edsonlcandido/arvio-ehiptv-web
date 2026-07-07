"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getStreams, installAddon as installAddonManifest, loadLocalAddons, saveLocalAddons } from "./addons";
import { defaultCatalogs, mergeCatalogs } from "./catalogs";
import { buildPlaybackUrl, fetchStreamOptions, type PlaybackService, type StreamOption } from "./ehiptv";
import { loadHomeServerRows } from "./homeserver";
import { loadIptvSnapshot } from "./iptv";
import { enterFullscreen, exitFullscreen } from "./player";
import { loadStored, saveStored } from "./storage";
import { getDetails, loadCatalog, searchMedia } from "./tmdb";
import type {
  AppSettings,
  Category,
  InstalledAddon,
  IptvChannel,
  CatalogConfig,
  IptvSnapshot,
  MediaItem,
  NavSection,
  StreamSource
} from "./types";
import { proxiedUrl } from "./http";

const settingsKey = "arvio.web.settings";
const SETTINGS_VERSION_KEY = "arvio.web.settings.version";
const CURRENT_SETTINGS_VERSION = 3;

export const defaultSettings: AppSettings = {
  autoPlayNext: true,
  autoPlaySingleSource: false,
  autoPlayMinQuality: "any",
  trailerAutoPlay: true,
  trailerSound: false,
  trailerDelaySeconds: 2,
  language: "pt-BR",
  defaultSubtitle: "pt",
  secondarySubtitle: "",
  audioLanguage: "pt-BR",
  subtitleSize: 100,
  subtitleColor: "#ffffff",
  subtitleOffsetMs: 0,
  subtitleStyle: "outline",
  subtitleStylized: false,
  filterSubtitlesByLanguage: false,
  removeHearingImpaired: true,
  aiSubtitlesEnabled: false,
  aiSubtitleModel: "off",
  aiAutoSelect: false,
  aiApiKey: "",
  cardLayoutMode: "landscape",
  deviceModeOverride: "auto",
  oledBlack: false,
  clockFormat: "24h",
  showBudget: true,
  smoothScrolling: true,
  spoilerBlur: false,
  accentColor: "arctic",
  dnsProvider: "system",
  showLoadingStats: false,
  customUserAgent: "",
  cardDensity: "comfortable",
  catalogs: defaultCatalogs,
  hiddenCatalogIds: [],
  disabledAddonIds: [],
  homeServers: [],
  streamServices: [],
  favoriteChannelIds: [],
  favoriteGroupIds: [],
  hiddenGroupIds: [],
  groupOrder: []
};

const emptyIptv: IptvSnapshot = {
  channels: [],
  grouped: {},
  nowNext: {},
  favoriteGroups: [],
  favoriteChannels: [],
  hiddenGroups: [],
  groupOrder: [],
  loadedAt: 0
};

export interface AppStore {
  section: NavSection;
  setSection: (section: NavSection) => void;
  categories: Category[];
  catalogConfigs: CatalogConfig[];
  loadCatalogRow: (catalog: CatalogConfig) => Promise<Category | null>;
  homeServerRows: Category[];
  continueWatching: MediaItem[];
  watchlist: MediaItem[];
  hero: MediaItem | null;
  setHeroPreview: (item: MediaItem | null) => void;
  selected: MediaItem | null;
  streams: StreamSource[];
  selectedEpisode: { season: number; episode: number } | null;
  loadEpisodeStreams: (item: MediaItem, season: number, episode: number) => Promise<void>;
  advanceEpisode: () => Promise<boolean>;
  activeStream: StreamSource | null;
  activeChannel: IptvChannel | null;
  addons: InstalledAddon[];
  iptvSnapshot: IptvSnapshot;
  query: string;
  setQuery: (value: string) => void;
  results: MediaItem[];
  settings: AppSettings;
  setSettings: (next: AppSettings) => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
  busy: string;
  toast: string | null;
  setToast: (value: string | null) => void;

  refreshData: () => Promise<void>;
  openDetails: (item: MediaItem) => Promise<void>;
  closeDetails: () => void;
  playStream: (stream: StreamSource) => void;
  playTrailer: (item: MediaItem) => Promise<void>;
  playChannel: (channel: IptvChannel) => void;
  playEhIptv: (
    item: MediaItem,
    episode: { season: number; episode: number } | undefined,
    option: StreamOption
  ) => Promise<void>;
  loadStreamOptions: (item: MediaItem) => Promise<StreamOption[]>;
  closePlayer: () => void;
  installAddon: (url: string) => Promise<void>;
  removeAddon: (addon: InstalledAddon) => Promise<void>;
  setAddonsState: (next: InstalledAddon[]) => Promise<void>;
}

const AppContext = createContext<AppStore | null>(null);

export function useApp(): AppStore {
  const store = useContext(AppContext);
  if (!store) throw new Error("useApp must be used within <AppProvider>");
  return store;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [section, setSection] = useState<NavSection>("home");
  const [categories, setCategories] = useState<Category[]>([]);
  const [catalogConfigs, setCatalogConfigs] = useState<CatalogConfig[]>([]);
  const [homeServerRows, setHomeServerRows] = useState<Category[]>([]);
  const [continueWatching, setContinueWatching] = useState<MediaItem[]>([]);
  const [watchlist, setWatchlist] = useState<MediaItem[]>([]);
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [streams, setStreams] = useState<StreamSource[]>([]);
  const [selectedEpisode, setSelectedEpisode] = useState<{ season: number; episode: number } | null>(null);
  const [activeStream, setActiveStream] = useState<StreamSource | null>(null);
  const [activeChannel, setActiveChannel] = useState<IptvChannel | null>(null);
  const [addons, setAddons] = useState<InstalledAddon[]>([]);
  const [iptvSnapshot, setIptvSnapshot] = useState<IptvSnapshot>(emptyIptv);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MediaItem[]>([]);
  const [settings, setSettings] = useState<AppSettings>(() => {
    const stored = loadStored<AppSettings>(settingsKey, defaultSettings);
    // v2 → v3: drop the obsolete `iptvPlaylists` array — Live TV is now
    // sourced from streamServices[0] (Xtream Codes) directly, with no
    // user-editable playlist. Strip it from `stored` so it doesn't leak
    // into the merged settings object (the field is no longer in
    // AppSettings, so leaving it in would just rot in localStorage).
    if (stored && typeof stored === "object" && "iptvPlaylists" in stored) {
      delete (stored as Record<string, unknown>).iptvPlaylists;
    }
    const merged: AppSettings = {
      ...defaultSettings,
      ...stored,
      catalogs: mergeCatalogs(stored.catalogs, stored.hiddenCatalogIds)
    };
    const versionRaw = loadStored<string>(SETTINGS_VERSION_KEY, "0");
    const version = parseInt(versionRaw, 10) || 0;
    if (version < CURRENT_SETTINGS_VERSION) {
      // v1 → v2: re-apply pt-BR defaults. Older stored settings had
      // language="en-US" and friends; this lifts them once so the new
      // defaults actually take effect. After this, user choices in
      // Settings remain the source of truth.
      merged.language = "pt-BR";
      merged.defaultSubtitle = "pt";
      merged.audioLanguage = "pt-BR";
      saveStored(SETTINGS_VERSION_KEY, String(CURRENT_SETTINGS_VERSION));
    }
    return merged;
  });
  const [busy, setBusy] = useState("Carregando ARVIO");
  const [toast, setToast] = useState<string | null>(null);

  const [heroPreview, setHeroPreview] = useState<MediaItem | null>(null);
  const hero = heroPreview ?? continueWatching[0] ?? categories[0]?.items[0] ?? null;

  // Refs so stable callbacks always read the latest values without re-creating.
  const addonsRef = useRef(addons);
  useEffect(() => {
    addonsRef.current = addons;
  }, [addons]);

  const persistAddons = useCallback(async (next: InstalledAddon[]) => {
    setAddons(next);
    saveLocalAddons(next);
  }, []);

  const refreshData = useCallback(async () => {
    setBusy("Sincronizando catálogos");
    try {
      const localAddons = loadLocalAddons();
      const addonState = localAddons.map((addon) => ({
        ...addon,
        enabled: !settings.disabledAddonIds.includes(addon.id) && addon.enabled !== false
      }));
      setAddons(addonState);
      saveLocalAddons(localAddons);

      const effectiveCatalogs = mergeCatalogs(settings.catalogs, settings.hiddenCatalogIds);
      setCatalogConfigs(effectiveCatalogs.filter((catalog) => catalog.enabled));

      void loadHomeServerRows(settings.homeServers).then(setHomeServerRows).catch(() => setHomeServerRows([]));

      // Live TV is sourced from the same Xtream Codes service the user
      // configures under "Conta Eh!IPTV". No separate playlist anymore.
      const liveService: PlaybackService | null = (settings.streamServices ?? []).find(
        (candidate) => candidate.enabled && candidate.username && candidate.password && candidate.baseUrl
      ) ?? null;
      const loadedIptv = await loadIptvSnapshot(liveService);

      setContinueWatching([]);
      setWatchlist([]);
      setCategories([]);
      setIptvSnapshot(loadedIptv);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Falha ao carregar ARVIO");
    } finally {
      setBusy("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    settings.language,
    settings.streamServices,
    settings.catalogs,
    settings.hiddenCatalogIds,
    settings.disabledAddonIds,
    settings.favoriteChannelIds,
    settings.favoriteGroupIds,
    settings.hiddenGroupIds,
    settings.groupOrder,
    settings.homeServers
  ]);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  useEffect(() => {
    saveStored(settingsKey, settings);
    saveStored(SETTINGS_VERSION_KEY, String(CURRENT_SETTINGS_VERSION));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  useEffect(() => {
    const handle = setTimeout(async () => {
      if (!query.trim()) {
        setResults([]);
        return;
      }
      setResults(await searchMedia(query, settings.language).catch(() => []));
    }, 260);
    return () => clearTimeout(handle);
  }, [query, settings.language]);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const openDetails = useCallback(async (item: MediaItem) => {
    setSelectedEpisode(null);
    // Home-server items carry their own metadata + a direct stream URL — no TMDB.
    if (item.isHomeServer) {
      setSelected(item);
      setStreams(item.homeServerUrl
        ? [{ source: item.title, addonName: "Home Server", quality: "Direct", size: "", url: item.homeServerUrl }]
        : []);
      setBusy("");
      return;
    }
    setBusy("Opening details");
    setStreams([]);
    const detailed = await getDetails(item, settings.language).catch(() => item);
    setSelected(detailed);
    // Movies fetch sources immediately; TV waits for an episode selection.
    if (item.mediaType === "movie") {
      setBusy("Finding sources");
      const found = await getStreams(addonsRef.current, detailed).catch(() => []);
      setStreams(found);
    }
    setBusy("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadEpisodeStreams = useCallback(async (item: MediaItem, season: number, episode: number) => {
    setSelectedEpisode({ season, episode });
    setStreams([]);
    setBusy("Finding sources");
    const found = await getStreams(addonsRef.current, item, season, episode).catch(() => []);
    setStreams(found);
    setBusy("");
  }, []);

  const advanceEpisode = useCallback(async (): Promise<boolean> => {
    if (!selected || selected.mediaType !== "tv" || !selectedEpisode) return false;
    const nextEpisode = selectedEpisode.episode + 1;
    setSelectedEpisode({ season: selectedEpisode.season, episode: nextEpisode });
    const found = await getStreams(addonsRef.current, selected, selectedEpisode.season, nextEpisode).catch(() => []);
    setStreams(found);
    const best = found.find((stream) => stream.url);
    setActiveStream(best ?? null);
    return Boolean(best);
  }, [selected, selectedEpisode]);

  const closeDetails = useCallback(() => {
    setSelected(null);
    setSelectedEpisode(null);
    setStreams([]);
  }, []);

  const playStream = useCallback((stream: StreamSource) => {
    if (!stream.url) {
      setToast("This source is not web-playable yet. Browser playback needs a direct HTTP/HLS URL.");
      return;
    }
    setActiveStream(stream);
    enterFullscreen();
  }, []);

  const playTrailer = useCallback(async (item: MediaItem) => {
    let url = item.trailerUrl ?? null;
    if (!url) {
      const detailed = await getDetails(item, settings.language).catch(() => item);
      url = detailed.trailerUrl ?? null;
      setSelected((current) => current ?? detailed);
    }
    if (!url) {
      setToast("No trailer available for this title.");
      return;
    }
    setActiveStream({ source: "Trailer", addonName: "YouTube", quality: "Trailer", size: "", url });
  }, []);

  const playChannel = useCallback((channel: IptvChannel) => {
    setActiveChannel(channel);
    setActiveStream({
      source: channel.name,
      addonName: "Live TV",
      quality: "Live",
      size: "",
      url: proxiedUrl(channel.streamUrl),
      description: channel.group
    });
    enterFullscreen();
  }, []);

  const playEhIptv = useCallback(async (
    item: MediaItem,
    episode: { season: number; episode: number } | undefined,
    option: StreamOption
  ) => {
    const service = (settings.streamServices ?? []).find(
      (candidate) => candidate.enabled && candidate.username && candidate.password && candidate.baseUrl
    );
    if (!service) {
      setToast("Adicione suas credenciais em Configurações → Conta Eh!IPTV");
      return;
    }

    const kind: "movie" | "tv" = item.mediaType === "tv" ? "tv" : "movie";
    if (kind === "tv" && !episode) {
      setToast("Selecione um episódio para reproduzir");
      return;
    }

    setBusy("Preparando");
    let url: string;
    try {
      url = await buildPlaybackUrl(service, option, kind, episode);
    } catch (error) {
      setBusy("");
      setToast(error instanceof Error ? error.message : "Não foi possível preparar a reprodução");
      return;
    }

    setActiveChannel(null);
    setActiveStream({
      source: item.title,
      addonName: "Eh!IPTV",
      quality: "Direct",
      size: "",
      url: proxiedUrl(url),
      description: kind === "movie"
        ? (option.title || "Filme")
        : `${option.title || "S"} · T${episode!.season}/E${episode!.episode}`
    });
    enterFullscreen();
    setBusy("");
  }, [settings.streamServices]);

  /** Prefetch the PocketBase options for an item — exposed so the Drawer can
   * render one Play button per edition when the operator catalogues the same
   * TMDB title in multiple rows (e.g. "Michael" vs "Michael [L]"). */
  const loadStreamOptions = useCallback(async (item: MediaItem): Promise<StreamOption[]> => {
    return fetchStreamOptions(item).catch(() => []);
  }, []);

  const closePlayer = useCallback(() => {
    setActiveStream(null);
    setActiveChannel(null);
    exitFullscreen();
  }, []);

  const loadCatalogRow = useCallback((catalog: CatalogConfig) => loadCatalog(catalog, settings.language), [settings.language]);

  const installAddon = useCallback(async (url: string) => {
    const addon = await installAddonManifest(url);
    const next = [addon, ...addonsRef.current.filter((candidate) => candidate.id !== addon.id)];
    await persistAddons(next);
  }, [persistAddons]);

  const removeAddon = useCallback(async (addon: InstalledAddon) => {
    const next = addonsRef.current.filter((candidate) => candidate.id !== addon.id);
    await persistAddons(next);
  }, [persistAddons]);

  const setAddonsState = useCallback(async (next: InstalledAddon[]) => {
    await persistAddons(next);
    setSettings((prev) => ({
      ...prev,
      disabledAddonIds: next.filter((addon) => addon.enabled === false).map((addon) => addon.id)
    }));
  }, [persistAddons]);

  const value = useMemo<AppStore>(() => ({
    section,
    setSection,
    categories,
    catalogConfigs,
    loadCatalogRow,
    homeServerRows,
    continueWatching,
    watchlist,
    hero,
    setHeroPreview,
    selected,
    streams,
    selectedEpisode,
    loadEpisodeStreams,
    advanceEpisode,
    activeStream,
    activeChannel,
    addons,
    iptvSnapshot,
    query,
    setQuery,
    results,
    settings,
    setSettings,
    updateSettings,
    busy,
    toast,
    setToast,
    refreshData,
    openDetails,
    closeDetails,
    playStream,
    playTrailer,
    playChannel,
    playEhIptv,
    loadStreamOptions,
    closePlayer,
    installAddon,
    removeAddon,
    setAddonsState
  }), [
    section, categories, catalogConfigs, loadCatalogRow, homeServerRows, continueWatching, watchlist, hero, heroPreview, selected, streams, selectedEpisode, loadEpisodeStreams, advanceEpisode, activeStream, activeChannel,
    addons, iptvSnapshot, query, results, settings, busy, toast,
    updateSettings, refreshData, openDetails, closeDetails, playStream, playTrailer, playChannel, playEhIptv, loadStreamOptions, closePlayer,
    installAddon, removeAddon, setAddonsState
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
