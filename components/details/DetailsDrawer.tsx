"use client";

import { Play, Star, UserCircle, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { getReviews, getSeasonEpisodes } from "@/lib/tmdb";
import { MediaCard } from "@/components/media/MediaCard";
import type { EpisodeInfo, MediaItem, ReviewInfo } from "@/lib/types";

export function DetailsDrawer() {
  const { selected: item } = useApp();
  if (!item) return null;
  return <DetailsDrawerView key={`${item.mediaType}-${item.id}`} item={item} />;
}

function DetailsDrawerView({ item }: { item: MediaItem }) {
  const { streams, selectedEpisode, loadEpisodeStreams, closeDetails, openDetails, playStream, playTrailer } = useApp();
  const [reviews, setReviews] = useState<ReviewInfo[]>([]);

  useEffect(() => {
    let active = true;
    void getReviews(item).then((r) => active && setReviews(r)).catch(() => undefined);
    return () => { active = false; };
  }, [item.id, item.mediaType]);

  const playableCount = streams.filter((stream) => Boolean(stream.url)).length;
  const isTv = item.mediaType === "tv";
  const sourceLabel = selectedEpisode ? `Fontes · T${selectedEpisode.season} E${selectedEpisode.episode}` : "Fontes";

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
          {streams.length > 0 && <span>{playableCount}/{streams.length} tocáveis</span>}
        </div>
        <div className="detail-actions">
          <button className="primary" onClick={() => streams[0] && playStream(streams[0])} disabled={!streams.length}>
            <Play size={18} fill="currentColor" /> Tocar melhor fonte
          </button>
        </div>

        {item.trailerUrl && (
          <button className="trailer-link" onClick={() => void playTrailer(item)}>
            <Play size={18} fill="currentColor" /> Assistir trailer
          </button>
        )}

        {isTv && item.seasons?.length ? (
          <SeasonEpisodes item={item} selectedEpisode={selectedEpisode} onPlayEpisode={(s, e) => loadEpisodeStreams(item, s, e)} />
        ) : null}

        {(!isTv || selectedEpisode || streams.length > 0) && (
          <section className="detail-section">
            <h3>{sourceLabel}</h3>
            <div className="source-list">
              {streams.length === 0 && (
                <p className="empty">{isTv && !selectedEpisode ? "Escolha um episódio para listar fontes." : "Nenhuma fonte disponível no momento."}</p>
              )}
              {streams.map((stream, index) => (
                <button key={`${stream.addonId}-${index}`} className={`source-row ${stream.url ? "" : "is-locked"}`} onClick={() => playStream(stream)}>
                  <div>
                    <strong>{stream.source}</strong>
                    <span>{stream.addonName} {stream.description ? `• ${stream.description}` : ""} {stream.url ? "" : "• não tocável"}</span>
                  </div>
                  <span className="quality">{stream.quality || "HD"}</span>
                </button>
              ))}
            </div>
          </section>
        )}

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

function SeasonEpisodes({ item, selectedEpisode, onPlayEpisode }: {
  item: MediaItem;
  selectedEpisode: { season: number; episode: number } | null;
  onPlayEpisode: (season: number, episode: number) => void;
}) {
  const seasons = item.seasons ?? [];
  const [season, setSeason] = useState(seasons[0]?.seasonNumber ?? 1);
  const [episodes, setEpisodes] = useState<EpisodeInfo[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void getSeasonEpisodes(item.id, season)
      .then((eps) => { if (active) setEpisodes(eps); })
      .catch(() => undefined)
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [item.id, season]);

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
          const active = selectedEpisode?.season === season && selectedEpisode?.episode === episode.episodeNumber;
          return (
            <button
              key={episode.id}
              className={`episode-row ${active ? "is-active" : ""}`}
              onClick={() => onPlayEpisode(season, episode.episodeNumber)}
            >
              <div className="episode-still">
                {episode.still ? <img src={episode.still} alt="" /> : <Play size={24} />}
                <span className="episode-play"><Play size={18} fill="currentColor" /></span>
              </div>
              <div className="episode-info">
                <strong>{episode.episodeNumber}. {episode.name}</strong>
                <span>{episode.airDate || ""}{episode.runtime ? ` • ${episode.runtime}m` : ""}</span>
                <p>{episode.overview || ""}</p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
