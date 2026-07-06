"use client";

import { useApp } from "@/lib/store";
import { RailsView } from "@/components/media/RailsView";

export function WatchlistScreen() {
  const { watchlist, openDetails, settings } = useApp();
  return (
    <RailsView
      title="Minha Lista"
      eyebrow="Itens salvos para assistir depois"
      categories={[{ id: "watchlist", title: "Salvos", items: watchlist }]}
      onOpen={openDetails}
      posterMode={settings.cardLayoutMode === "poster"}
    />
  );
}
