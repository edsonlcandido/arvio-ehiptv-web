import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Eh!IPTV Web Player",
  description: "Eh!IPTV Web Player for web, iPad, desktop, and TV browsers",
  manifest: "/manifest.webmanifest"
};

export const viewport: Viewport = {
  themeColor: "#02070c",
  colorScheme: "dark",
  // Mobile / tablet stays device-width so the responsive layout works as
  // before. TV detection runs in <head> below and overrides this meta tag
  // when the UA looks like a Smart TV.
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false
};

/**
 * Inline script that runs BEFORE React hydration on Smart-TV browsers so
 * the responsive units (vw / vh) compute against the correct viewport.
 *
 * Why this matters: most TVs (Tizen, webOS, Roku, Fire TV stick, generic
 * Android TV boxes, etc.) report `window.innerWidth = 1280` regardless of
 * the actual 1920x1080 panel. Chromium then stretches the 1280-pixel page
 * onto the 1920-pixel screen — every vw-based size comes out 1.5x larger
 * than designed, which is what the user reads as "zoom". Adding
 * `width=1920, initial-scale=1.0` makes the same elements render at the size
 * they would on a desktop browser at 1920x1080, which is what the layout
 * was designed for.
 *
 * No-op on desktop / mobile (the meta keeps its `device-width` value).
 */
const tvViewportInit = `
(function () {
  try {
    if (typeof window === 'undefined' || !document.documentElement) return;
    var ua = navigator.userAgent || '';
    var isTV = /TV|SmartTV|SMART-TV|Android ?TV|GoogleTV|HBRA-|Chromecast|AFT|Web0S|webOS|NetCast|HISENSE|Roku|Apple ?TV|Tizen|SmartHub|Nintendo|SHIELD|Xbox|PlayStation|VIERA/i.test(ua);
    if (!isTV) return;
    // Tag the document up front so CSS can hide the virtual cursor and tune
    // for TV before React has a chance to paint.
    document.documentElement.classList.add('is-tv');
    var meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'viewport');
      document.head.appendChild(meta);
    }
    // Most TVs report 1280 even on a 1920 panel — force 1920 so our 1vw
    // equals a desktop-style 19.2 CSS pixels. Locked scale so the user can
    // never pinch-zoom a TV interface.
    meta.setAttribute('content', 'width=1920, initial-scale=1.0, user-scalable=no, maximum-scale=1.0, shrink-to-fit=no, viewport-fit=cover');
  } catch (err) {
    // Init script must never break the page — silently fall back to the
    // meta-viewport React/Next renders for desktop.
  }
})();
`.trim();

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* TV viewport fix must run before the first paint; Next streams
            this into the <head> as a blocking inline script. */}
        <script dangerouslySetInnerHTML={{ __html: tvViewportInit }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
