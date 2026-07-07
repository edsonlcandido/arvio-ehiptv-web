"use client";

import { useEffect } from "react";
import { useApp } from "@/lib/store";
import { useTvShell } from "@/lib/tv-nav";
import { DetailsDrawer } from "@/components/details/DetailsDrawer";
import { HomeScreen } from "@/components/home/HomeScreen";
import { LiveTvScreen } from "@/components/livetv/LiveTvScreen";
import { PlayerOverlay } from "@/components/player/PlayerOverlay";
import { SearchScreen } from "@/components/search/SearchScreen";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { WatchlistScreen } from "@/components/watchlist/WatchlistScreen";
import { SyncStrip } from "./SyncStrip";
import { Toast } from "./Toast";
import { TopNav } from "./TopNav";

const ACCENTS: Record<string, string> = {
  arctic: "#ededed",
  gold: "#ffcd3c",
  green: "#00d588",
  blue: "#3b82f6",
  purple: "#8b5cf6"
};

export function AppShell() {
  const { section, settings } = useApp();
  // TV / D-Pad handler — installs the global arrow-key listener and toggles
  // <html class="is-tv"> so CSS can re-tune layout for big screens. No-op on
  // desktop / mobile.
  useTvShell();

  useEffect(() => {
    document.documentElement.style.scrollBehavior = settings.smoothScrolling ? "smooth" : "auto";
  }, [settings.smoothScrolling]);

  const accent = ACCENTS[settings.accentColor] ?? ACCENTS.arctic;

  return (
    <main
      className={`app-shell ${settings.oledBlack ? "oled" : ""} ${settings.spoilerBlur ? "spoiler-blur" : ""}`}
      style={{ ["--accent" as string]: accent }}
    >
      <TopNav />

      <section className="content">  
        {section === "search" && <SearchScreen />}
        {section === "home" && <HomeScreen />}
        {section === "watchlist" && <WatchlistScreen />}
        {section === "tv" && <LiveTvScreen />}
        {section === "settings" && <SettingsScreen />}
      </section>

      <DetailsDrawer />
      <PlayerOverlay />
      <Toast />
    </main>
  );
}
