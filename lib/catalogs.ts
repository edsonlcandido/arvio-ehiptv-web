import type { CatalogConfig } from "./types";

export const defaultCatalogs: CatalogConfig[] = [
  { id: "trending_movies", name: "Filmes em Alta", sourceType: "mdblist", mediaType: "movie", sourceUrl: "https://mdblist.com/lists/snoak/trending-movies", enabled: true, isPreinstalled: true },
  { id: "trending_tv", name: "Séries em Alta", sourceType: "mdblist", mediaType: "tv", sourceUrl: "https://mdblist.com/lists/snoak/trakt-s-trending-shows", enabled: true, isPreinstalled: true },
  { id: "trending_anime", name: "Animes em Alta", sourceType: "mdblist", mediaType: "tv", sourceUrl: "https://mdblist.com/lists/snoak/trending-anime-shows", enabled: true, isPreinstalled: true },
  { id: "top10_movies_today", name: "Top 10 Filmes Hoje", sourceType: "mdblist", mediaType: "movie", sourceUrl: "https://mdblist.com/lists/snoak/top-10-movies-of-the-day", enabled: true, isPreinstalled: true },
  { id: "top10_shows_today", name: "Top 10 Séries Hoje", sourceType: "mdblist", mediaType: "tv", sourceUrl: "https://mdblist.com/lists/snoak/top-10-shows-of-the-day", enabled: true, isPreinstalled: true },
  { id: "just_added", name: "Últimos Adicionados", sourceType: "mdblist", mediaType: "movie", sourceUrl: "https://mdblist.com/lists/snoak/latest-movies-digital-release", enabled: true, isPreinstalled: true },
  { id: "latest_tv", name: "Últimos Episódios", sourceType: "mdblist", mediaType: "tv", sourceUrl: "https://mdblist.com/lists/snoak/latest-tv-shows", enabled: true, isPreinstalled: true },
  { id: "top_movies_week", name: "Filmes Mais Vistos da Semana", sourceType: "mdblist", mediaType: "movie", sourceUrl: "https://mdblist.com/lists/linaspurinis/top-watched-movies-of-the-week", enabled: true, isPreinstalled: true },
  { id: "new_kdramas", name: "Novos K-Dramas", sourceType: "mdblist", mediaType: "tv", sourceUrl: "https://mdblist.com/lists/snoak/latest-kdrama-shows", enabled: true, isPreinstalled: true },
  { id: "coming_soon", name: "Em Breve", sourceType: "mdblist", mediaType: "movie", sourceUrl: "https://mdblist.com/lists/snoak/upcoming-movies", enabled: true, isPreinstalled: true },
  { id: "netflix", name: "Netflix", sourceType: "mdblist", mediaType: "all", sourceUrl: "https://mdblist.com/lists/garycrawfordgc/netflix-shows", enabled: true, isPreinstalled: true },
  { id: "disney", name: "Disney+", sourceType: "mdblist", mediaType: "all", sourceUrl: "https://mdblist.com/lists/garycrawfordgc/disney-shows", enabled: true, isPreinstalled: true },
  { id: "prime", name: "Prime Video", sourceType: "mdblist", mediaType: "all", sourceUrl: "https://mdblist.com/lists/garycrawfordgc/amazon-prime-shows", enabled: true, isPreinstalled: true },
  { id: "hbo", name: "HBO Max", sourceType: "mdblist", mediaType: "all", sourceUrl: "https://mdblist.com/lists/garycrawfordgc/hbo-max-shows", enabled: true, isPreinstalled: true },
  { id: "apple_tv", name: "Apple TV+", sourceType: "mdblist", mediaType: "all", sourceUrl: "https://mdblist.com/lists/garycrawfordgc/apple-tv-shows", enabled: true, isPreinstalled: true },
  { id: "action", name: "Ação Popular", sourceType: "mdblist", mediaType: "all", sourceUrl: "https://mdblist.com/lists/snoak/action-movies", enabled: true, isPreinstalled: true },
  { id: "comedy", name: "Comédia Popular", sourceType: "mdblist", mediaType: "all", sourceUrl: "https://mdblist.com/lists/snoak/comedy-movies", enabled: true, isPreinstalled: true },
  { id: "scifi", name: "Ficção Científica Popular", sourceType: "mdblist", mediaType: "all", sourceUrl: "https://mdblist.com/lists/snoak/science-fiction-movies", enabled: true, isPreinstalled: true },
  { id: "thriller", name: "Suspense Popular", sourceType: "mdblist", mediaType: "all", sourceUrl: "https://mdblist.com/lists/snoak/thriller-movies", enabled: true, isPreinstalled: true },
  { id: "drama", name: "Drama Popular", sourceType: "mdblist", mediaType: "all", sourceUrl: "https://mdblist.com/lists/snoak/drama-movies", enabled: true, isPreinstalled: true },
  { id: "horror", name: "Terror Popular", sourceType: "mdblist", mediaType: "all", sourceUrl: "https://mdblist.com/lists/snoak/horror-movies", enabled: true, isPreinstalled: true },
  { id: "documentary", name: "Documentário Popular", sourceType: "mdblist", mediaType: "all", sourceUrl: "https://mdblist.com/lists/snoak/popular-documentary-movies", enabled: true, isPreinstalled: true },
  { id: "romance", name: "Romance Popular", sourceType: "mdblist", mediaType: "all", sourceUrl: "https://mdblist.com/lists/snoak/popular-romance-movies", enabled: true, isPreinstalled: true },
  { id: "animated", name: "Animação Popular", sourceType: "mdblist", mediaType: "all", sourceUrl: "https://mdblist.com/lists/snoak/animationanime-movies", enabled: true, isPreinstalled: true },
  { id: "family", name: "Família Popular", sourceType: "mdblist", mediaType: "all", sourceUrl: "https://mdblist.com/lists/familytv133/family-kids-english-movies-rated-g-pg", enabled: true, isPreinstalled: true },
];

export function mergeCatalogs(saved: CatalogConfig[] | undefined, hiddenIds: string[] = []) {
  const savedById = new Map((saved ?? []).map((catalog) => [catalog.id, catalog]));
  const merged = defaultCatalogs.map((catalog) => ({
    ...catalog,
    ...savedById.get(catalog.id),
    enabled: !hiddenIds.includes(catalog.id) && (savedById.get(catalog.id)?.enabled ?? catalog.enabled)
  }));
  const custom = (saved ?? []).filter((catalog) => !defaultCatalogs.some((base) => base.id === catalog.id));
  return [...merged, ...custom];
}
