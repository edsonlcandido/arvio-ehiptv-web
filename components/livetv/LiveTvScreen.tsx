"use client";

import { Search, Star, Tv, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import type { IptvChannel, IptvSnapshot } from "@/lib/types";

const ALL = "__all__";
const FAVORITES = "__favorites__";

function fmtTime(ms: number): string {
  try {
    return new Intl.DateTimeFormat([], { hour: "2-digit", minute: "2-digit" }).format(new Date(ms));
  } catch {
    return "";
  }
}

export function LiveTvScreen() {
  const { iptvSnapshot, settings, setSettings, playChannel } = useApp();
  const channels = iptvSnapshot.channels;
  const grouped = iptvSnapshot.grouped;
  const favorites = settings.favoriteChannelIds;

  // Live TV is sourced from the same Xtream Codes service the user
  // configures under "Conta Eh!IPTV". If none is configured, the panel
  // prompts for it — there is no M3U/playlist form on this screen.
  const service = (settings.streamServices ?? []).find(
    (candidate) => candidate.enabled && candidate.username && candidate.password && candidate.baseUrl
  );
  const hasService = Boolean(service);
  const hasChannels = channels.length > 0;

  const favoriteChannels = useMemo(
    () => channels.filter((channel) => favorites.includes(channel.id)),
    [channels, favorites]
  );
  const hasFavorites = favoriteChannels.length > 0;

  const [selected, setSelected] = useState<string>(ALL);
  const [query, setQuery] = useState("");

  const trimmedQuery = query.trim().toLowerCase();
  const filterActive = trimmedQuery.length > 0;
  const filterMatches = useMemo(() => {
    if (!filterActive) return [] as IptvChannel[];
    return channels.filter((channel) => channel.name.toLowerCase().includes(trimmedQuery));
  }, [channels, filterActive, trimmedQuery]);

  // If the active selection vanishes (e.g. categories refetched), fall back
  // to "Todas" so the user is never staring at an empty browser pane.
  useEffect(() => {
    if (selected === ALL || selected === FAVORITES) return;
    if (!grouped[selected]) setSelected(ALL);
  }, [grouped, selected]);

  // Categories follow the insertion order of `grouped`, which mirrors the
  // order the Xtream `get_live_streams` payload delivered the channels —
  // intentionally unsorted, since the operator-curated order is what the
  // reseller wants surfaced on the rail.
  const categoryList = useMemo(() => Object.keys(grouped), [grouped]);

  const visibleChannels = useMemo(() => {
    if (selected === FAVORITES) return favoriteChannels;
    if (selected === ALL) return channels;
    return grouped[selected] ?? [];
  }, [selected, channels, grouped, favoriteChannels]);

  const toggleFavorite = (channelId: string) =>
    setSettings({
      ...settings,
      favoriteChannelIds: favorites.includes(channelId)
        ? favorites.filter((id) => id !== channelId)
        : [channelId, ...favorites]
    });

  const selectCategory = (category: string) => {
    // Picking a category dismisses the search filter so the user lands
    // on the curated list immediately.
    if (query) setQuery("");
    setSelected(category);
  };

  // ---- empty states ----
  if (!hasService) {
    return (
      <div className="screen live-layout">
        <section className="live-panel">
          <p className="eyebrow">Live TV</p>
          <h2>Configure sua conta Eh!IPTV</h2>
          <p className="empty">
            Adicione usuário e senha em <strong>Configurações → Conta Eh!IPTV</strong> para carregar os canais ao vivo.
          </p>
        </section>
      </div>
    );
  }
  if (!hasChannels) {
    return (
      <div className="screen live-layout">
        <section className="live-panel">
          <p className="eyebrow">Live TV</p>
          <h2>Carregando canais…</h2>
          <p className="empty">Aguarde, buscando lista de canais e categorias do servidor.</p>
        </section>
      </div>
    );
  }

  const headerTitle =
    selected === FAVORITES ? "Favoritos" :
    selected === ALL ? "Todos os canais" :
    selected;

  // Whether to show the "Favoritos" rail pinned at the top of the right
  // column. We hide it when the user is already filtered to the Favorites
  // category (would be a duplicate) or while a search is active (the
  // filter group already represents the user's narrowing intent).
  const showFavoritesOnTop = hasFavorites && selected !== FAVORITES && !filterActive;

  return (
    <div className="screen live-layout">
      <section className="live-panel">
        <p className="eyebrow">Live TV</p>
        <h2>{channels.length} canais</h2>
        <div className="category-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar canal…"
            aria-label="Buscar canal"
          />
          {query && (
            <button
              type="button"
              className="category-search-clear"
              onClick={() => setQuery("")}
              aria-label="Limpar busca"
            >
              <X size={16} />
            </button>
          )}
        </div>
        <div className="category-list">
          {hasFavorites && (
            <button
              type="button"
              className={selected === FAVORITES ? "pill active" : "pill"}
              onClick={() => selectCategory(FAVORITES)}
            >
              <Star size={15} fill="currentColor" /> Favoritos <em>({favoriteChannels.length})</em>
            </button>
          )}
          <button
            type="button"
            className={selected === ALL ? "pill active" : "pill"}
            onClick={() => selectCategory(ALL)}
          >
            Todas <em>({channels.length})</em>
          </button>
          {categoryList.map((category) => {
            const count = (grouped[category] ?? []).length;
            return (
              <button
                type="button"
                key={category}
                className={selected === category ? "pill active" : "pill"}
                onClick={() => selectCategory(category)}
              >
                <span>{category}</span> <em>({count})</em>
              </button>
            );
          })}
        </div>
      </section>
      <section className="channel-browser">
        {filterActive ? (
          <ChannelGroup
            title={`Filtro: “${query.trim()}”`}
            channels={filterMatches}
            nowNext={iptvSnapshot.nowNext}
            favorites={favorites}
            onPlay={playChannel}
            onToggleFavorite={toggleFavorite}
            emptyMessage="Nenhum canal encontrado pra essa busca."
          />
        ) : (
          <>
            {showFavoritesOnTop && (
              <ChannelGroup
                title="Favoritos"
                channels={favoriteChannels}
                nowNext={iptvSnapshot.nowNext}
                favorites={favorites}
                onPlay={playChannel}
                onToggleFavorite={toggleFavorite}
              />
            )}
            <ChannelGroup
              title={headerTitle}
              channels={visibleChannels}
              nowNext={iptvSnapshot.nowNext}
              favorites={favorites}
              onPlay={playChannel}
              onToggleFavorite={toggleFavorite}
            />
          </>
        )}
      </section>
    </div>
  );
}

function ChannelGroup({
  title,
  channels,
  nowNext,
  favorites,
  onPlay,
  onToggleFavorite,
  emptyMessage = "Nenhum canal nesta categoria."
}: {
  title: string;
  channels: IptvChannel[];
  nowNext: Record<string, IptvSnapshot["nowNext"][string]>;
  favorites: string[];
  onPlay: (channel: IptvChannel) => void;
  onToggleFavorite: (channelId: string) => void;
  emptyMessage?: string;
}) {
  return (
    <section className="channel-group">
      <div className="channel-group-head">
        <h3>{title}</h3>
      </div>
      <div className="channel-list">
        {channels.slice(0, 120).map((channel) => {
          const epg = nowNext[channel.id];
          const now = epg?.now;
          const next = epg?.next ?? epg?.later ?? epg?.upcoming?.[0];
          const progress = now
            ? Math.min(100, Math.max(0, ((Date.now() - now.startUtcMillis) / (now.endUtcMillis - now.startUtcMillis)) * 100))
            : 0;
          return (
            <div className="channel-row" key={channel.id}>
              <button type="button" onClick={() => onPlay(channel)}>
                {channel.logo ? <img src={channel.logo} alt="" /> : <Tv size={22} />}
                <span className="channel-meta">
                  <span className="channel-name">{channel.name}</span>
                  {now?.title && <em className="epg-now">{fmtTime(now.startUtcMillis)} {now.title}</em>}
                  {now && <span className="epg-progress"><span style={{ width: `${progress}%` }} /></span>}
                  {next?.title && <em className="epg-next">Next · {fmtTime(next.startUtcMillis)} {next.title}</em>}
                </span>
              </button>
              <button
                type="button"
                className={favorites.includes(channel.id) ? "star active" : "star"}
                onClick={() => onToggleFavorite(channel.id)}
                aria-label={favorites.includes(channel.id) ? "Remover dos favoritos" : "Adicionar aos favoritos"}
              >
                <Star size={18} fill="currentColor" />
              </button>
            </div>
          );
        })}
        {channels.length === 0 && <p className="empty">{emptyMessage}</p>}
      </div>
    </section>
  );
}
