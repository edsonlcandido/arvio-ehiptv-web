"use client";

import { Bookmark, Home, Search, Settings, Tv } from "lucide-react";
import { useApp } from "@/lib/store";
import type { NavSection } from "@/lib/types";

const nav = [
  { id: "home", label: "Início", icon: Home },
  { id: "search", label: "Buscar", icon: Search },
  { id: "watchlist", label: "Minha Lista", icon: Bookmark },
  { id: "tv", label: "TV ao Vivo", icon: Tv }
] satisfies Array<{ id: NavSection; label: string; icon: typeof Home }>;

export function TopNav() {
  const { section, setSection, settings } = useApp();
  const clock = new Intl.DateTimeFormat([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: settings.clockFormat === "12h"
  }).format(new Date());

  return (
    <aside className="sidebar" aria-label="Navegação ARVIO">
      <div className="brand-wrap">
        <a className="brand" href="/" aria-label="ARVIO">
          <img src="/arvio-logo.svg" alt="" />
        </a>
      </div>
      <nav>
        {nav.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={`nav-item ${section === item.id ? "is-active" : ""}`}
              onClick={() => setSection(item.id)}
            >
              <Icon size={22} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="top-right">
        <button
          className={`settings-gear ${section === "settings" ? "is-active" : ""}`}
          onClick={() => setSection("settings")}
          aria-label="Configurações"
        >
          <Settings size={26} />
        </button>
        <span className="top-clock">{clock}</span>
      </div>
    </aside>
  );
}
