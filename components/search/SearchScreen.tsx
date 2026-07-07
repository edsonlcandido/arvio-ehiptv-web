"use client";

import { Search } from "lucide-react";
import { useEffect, useRef } from "react";
import { useApp } from "@/lib/store";
import { isTvPlatform, useAutoFocus } from "@/lib/tv-nav";
import { MediaCard } from "@/components/media/MediaCard";

export function SearchScreen() {
  const { query, setQuery, results, openDetails } = useApp();
  // On TV: focus the search input so the user can type with the on-screen
  // keyboard. On desktop/mobile keep the browser's autoFocus behaviour.
  useAutoFocus(".search-hero input");
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (isTvPlatform()) return; // TV auto-focus handled by useAutoFocus
    inputRef.current?.focus();
  }, []);
  return (
    <div className="screen">
      <section className="search-hero">
        <Search size={28} />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Procure por filmes, séries e muito mais..."
        />
      </section>
      <div className="grid-results">
        {results.map((item) => <MediaCard key={`${item.mediaType}-${item.id}`} item={item} onOpen={openDetails} />)}
      </div>
    </div>
  );
}
