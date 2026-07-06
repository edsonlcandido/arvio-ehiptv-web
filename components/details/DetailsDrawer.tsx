"use client";

import { Play, Star, UserCircle, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { getReviews, getSeasonEpisodes } from "@/lib/tmdb";
import { fetchAvailableEpisodeNumbers, type PlaybackService, type StreamOption } from "@/lib/ehiptv";
import { MediaCard } from "@/components/media/MediaCard";
import type { EpisodeInfo, MediaItem, ReviewInfo } from "@/lib/types";

export function DetailsDrawer() {
  const { selected: item } = useApp();
  if (!item) return null;
  return <DetailsDrawerView key={`${item.mediaType}-${item.id}`} item={item} />;
}

function DetailsDrawerView({ item }: { item: MediaItem }) {
  const {
    streams,
    selectedEpisode,
    loadEpisodeStreams,
    loadStreamOptions,
    closeDetails,
    openDetails,
    playEhIptv,
    playStream,
    playTrailer
  } = useApp();
  const [reviews, setReviews] = useState<ReviewInfo[]>([]);
  const [streamOptions, setStreamOptions] = useState<StreamOption[] | null>(null);

  useEffect(() => {
    let active = true;
    void getReviews(item).then((r) => active && setReviews(r)).catch(() => undefined);
    return () => { active = false; };
  }, [item.id, item.mediaType]);

  // Fetch the Eh!IPTV catalogue rows for this title. One row → a single
  // "Tocar" button; multiple rows (e.g. "Michael" and "Michael [L]") →
  // one Play button per option labelled with `vod_title` / `serie_title`.
  useEffect(() => {
    setStreamOptions(null);
    if (item.isHomeServer) return;
    let active = true;
    void loadStreamOptions(item).then((options) => {
      if (active) setStreamOptions(options);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [item.id, item.mediaType, item.isHomeServer, loadStreamOptions]);

  const isTv = item.mediaType === "tv";
  // Home-server items play their pre-resolved stream; everything else goes
  // through the Eh!IPTV URL builder — one Play per catalogue edition.
  const playOption = (option: StreamOption) => {
    void playEhIptv(item, selectedEpisode ?? undefined, option);
  };
  const ready = item.isHomeServer
    ? Boolean(streams[0])
    : isTv
      ? Boolean(selectedEpisode) && (streamOptions?.length ?? 0) > 0
      : (streamOptions?.length ?? 0) > 0;
  const loading = !item.isHomeServer && streamOptions === null && !isTv
    ? true
    : !item.isHomeServer && streamOptions === null && isTv && Boolean(selectedEpisode);

  return (
    <aside className="details-drawer">
      <button className="close" onClick={closeDetails} aria-label="Fechar"><X size={22} /></button>
      <div className="detail-backdrop" style={{ backgroundImage: item.backdrop ? `url(${item.backdrop})` : undefined }} />
      <div className="detail-body">
        <p className="eyebrow">{isTv ? "Série" : "Filme"} {item.rating ? `• ⭐ ${item.rating}` : ""}</p>
        <h2>{item.title}</h2>
        <p>{item.overview || "Sem descrição disponível."}</p>
        <div className="chips">
          {item.year && <span>{item.year}</span>}
          {item.duration && <span>{item.duration}</span>}
          {selectedEpisode && <span>T{selectedEpisode.season} · E{selectedEpisode.episode}</span>}
        </div>

        {item.isHomeServer ? (
          <div className="detail-actions">
            <button className="primary" onClick={() => streams[0] && playStream(streams[0])} disabled={!streams.length}>
              <Play size={18} fill="currentColor" /> Tocar
            </button>
          </div>
        ) : (
          <div className="detail-actions">
            {streamOptions === null && (
              <button className="primary" disabled>
                <Play size={18} fill="currentColor" /> {loading ? "Carregando…" : "Tocar"}
              </button>
            )}
            {streamOptions !== null && streamOptions.length === 0 && (
              <button className="primary" disabled>
                <Play size={18} fill="currentColor" /> Indisponível
              </button>
            )}
            {streamOptions !== null && streamOptions.length === 1 && (
              <button className="primary" disabled={!ready} onClick={() => playOption(streamOptions[0])}>
                <Play size={18} fill="currentColor" /> Tocar
              </button>
            )}
            {streamOptions !== null && streamOptions.length > 1 && (
              <div className="option-buttons">
                {streamOptions.map((option, index) => (
                  <button
                    key={`${option.id}-${index}`}
                    className="primary option-button"
                    disabled={!ready}
                    onClick={() => playOption(option)}
                  >
                    <Play size={18} fill="currentColor" /> Tocar {option.title || `opção ${index + 1}`}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {item.trailerUrl && (
          <button className="trailer-link" onClick={() => void playTrailer(item)}>
            <Play size={18} fill="currentColor" /> Assistir trailer
          </button>
        )}

        {isTv && item.seasons?.length ? (
          <SeasonEpisodes
            item={item}
            selectedEpisode={selectedEpisode}
            onPlayEpisode={(s, e) => loadEpisodeStreams(item, s, e)}
            seriesId={streamOptions?.[0]?.id != null ? String(streamOptions[0].id) : null}
            service={(settings.streamServices ?? []).find(
              (candidate) => candidate.enabled && candidate.username && candidate.password && candidate.baseUrl
            ) ?? null}
          />
        ) : null}

        {item.cast?.length ? (
          <section className="detail-section">
            <h3>Elenco</h3>
            <div className="mini-strip">
              {item.cast.map((person) => (
                <article className="mini-card person" key={person.id}>
                  {person.image ? <img src={person.image} alt="" /> : <UserCircle size={30} />}
                  <strong>{person.name}</strong>
                  <span>{person.character || "Elenco"}</span>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {reviews.length > 0 && (
          <section className="detail-section">
            <h3>Avaliações</h3>
            <div className="review-list">
              {reviews.map((review) => (
                <article className="review-card" key={review.id}>
                  <div className="review-head">
                    {review.avatar ? <img src={review.avatar} alt="" /> : <UserCircle size={26} />}
                    <strong>{review.author}</strong>
                    {review.rating != null && <span className="review-rating"><Star size={13} fill="currentColor" /> {review.rating}</span>}
                  </div>
                  <p>{review.content.length > 600 ? `${review.content.slice(0, 600)}…` : review.content}</p>
                </article>
              ))}
            </div>
          </section>
        )}

        {item.related?.length ? (
          <section className="detail-section related">
            <h3>Veja também</h3>
            <div className="rail-strip compact">
              {item.related.map((related) => <MediaCard key={`related-${related.mediaType}-${related.id}`} item={related} onOpen={openDetails} />)}
            </div>
          </section>
        ) : null}
      </div>
    </aside>
  );
}

function SeasonEpisodes({ item, selectedEpisode, onPlayEpisode, seriesId, service }: {
  item: MediaItem;
  selectedEpisode: { season: number; episode: number } | null;
  onPlayEpisode: (season: number, episode: number) => void;
  seriesId: string | null;
  service: Pick<PlaybackService, "baseUrl" | "username" | "password"> | null;
}) {
  const seasons = item.seasons ?? [];
  const [season, setSeason] = useState(seasons[0]?.seasonNumber ?? 1);
  const [episodes, setEpisodes] = useState<EpisodeInfo[]>([]);
  const [available, setAvailable] = useState<Set<number> | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setAvailable(null);

    void getSeasonEpisodes(item.id, season)
      .then(async (eps) => {
        if (!active) return;
        setEpisodes(eps);
        // Cross-reference against the operator's actual catalogue.
        if (service && seriesId) {
          const fetched = await fetchAvailableEpisodeNumbers(service, seriesId, season).catch(() => null);
          if (active) setAvailable(fetched);
        } else {
          // No operator context yet — treat every TMDB episode as available.
          // When the user clicks Play, the resolve step will fail visibly
          // if the operator has nothing for this series.
          if (active) setAvailable(new Set(eps.map((e) => e.episodeNumber)));
        }
      })
      .catch(() => undefined)
      .finally(() => active && setLoading(false));

    return () => { active = false; };
  }, [item.id, season, seriesId, service]);

  return (
    <section className="detail-section">
      <h3>Episodes</h3>
      <div className="season-tabs">
        {seasons.map((s) => (
          <button
            key={s.id}
            className={`season-tab ${s.seasonNumber === season ? "is-active" : ""}`}
            onClick={() => setSeason(s.seasonNumber)}
          >
            {s.name || `Season ${s.seasonNumber}`}
          </button>
        ))}
      </div>
      <div className="episode-list">
        {loading && <p className="empty">Loading episodes…</p>}
        {!loading && episodes.map((episode) => {
          const isPlayable = available === null
            ? true // null = fail-open: показуем всё
            : available.has(episode.episodeNumber);
          const active = selectedEpisode?.season === season && selectedEpisode?.episode === episode.episodeNumber;
          return (
            <button
              key={episode.id}
              className={`episode-row ${active ? "is-active" : ""} ${isPlayable ? "" : "is-unavailable"}`}
              onClick={() => isPlayable && onPlayEpisode(season, episode.episodeNumber)}
              disabled={!isPlayable}
              title={isPlayable ? undefined : "Este episódio não está disponível no seu plano"}
            >
              <div className="episode-still">
                {episode.still ? <img src={episode.still} alt="" /> : <Play size={24} />}
                <span className="episode-play"><Play size={18} fill="currentColor" /></span>
              </div>
              <div className="episode-info">
                <strong>{episode.episodeNumber}. {episode.name}</strong>
                <span>
                  {episode.airDate || ""}{episode.runtime ? ` • ${episode.runtime}m` : ""}
                  {!isPlayable && <em className="episode-tag"> • Indisponível</em>}
                </span>
                <p>{episode.overview || ""}</p>
              </div>
            </button>
          );
        })}
        {!loading && available !== null && episodes.length > 0 && [...available].length === 0 && (
          <p className="empty">Nenhum episódio desta temporada está disponível no seu plano.</p>
        )}
      </div>
    </section>
  );
}
