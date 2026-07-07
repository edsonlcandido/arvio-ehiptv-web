"use client";

import { useEffect } from "react";

/**
 * TV / D-Pad navigation helpers.
 *
 * Three things go wrong on Smart TVs that this module fixes:
 *
 *   1. The browser reports a smaller viewport than the panel (typically
 *      1280 instead of 1920). `app/layout.tsx` ships an inline script that
 *      detects TVs and rewrites the viewport meta tag to `width=1920` so
 *      `vw` / `vh` units land on the design size. This module respects the
 *      resulting `<html class="is-tv">` flag in every check.
 *
 *   2. Most Smart-TV browsers translate D-Pad presses into mouse motion
 *      instead of (or in addition to) arrow-key events. We deal with both:
 *      a `keydown` handler that walks the focus tree spatially (closest
 *      element in the requested X/Y direction, not the next tab-order
 *      neighbour — important because the RailsView renders every rail's
 *      focusables in DOM order, and tab-order moving "down" inside a row
 *      would jump cards sideways inside the same row instead of landing
 *      on the row below). And a `pointermove` fallback that follows the
 *      virtual cursor with the focus ring when the TV is in pointer mode.
 *
 *   3. The D-Pad also pops a virtual cursor on screen. CSS
 *      `html.is-tv * { cursor: none }` hides it so the focus ring is the
 *      only on-screen "pointer".
 *
 * Text inputs keep their default caret behaviour. Enter / Space on a
 * focused button fires its click (browser default). Backspace tries to
 * close the open drawer / player first before doing anything else.
 *
 * All hooks are no-ops when `isTvPlatform()` is false, so the file is safe
 * to ship to desktop / mobile without behaviour changes.
 */

const TV_UA_PATTERN = /TV|SmartTV|SMART-TV|Android ?TV|GoogleTV|HBRA-|Chromecast|AFT|Web0S|webOS|NetCast|HISENSE|Roku|Apple ?TV|Tizen|SmartHub|Nintendo|SHIELD|Xbox|PlayStation|VIERA/i;

const FOCUSABLE_SELECTOR = [
  "a[href]:not([disabled])",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

let cachedTv: boolean | null = null;

/**
 * True when we're running on a TV-shaped browser. The result is memoised at
 * module level — the UA and the inline-script `is-tv` class never change
 * inside a session.
 *
 * Honours `settings.deviceModeOverride` so a user can force TV layout on a
 * desktop browser for testing, or force desktop on a TV that gets detected
 * wrong.
 */
export function isTvPlatform(override?: "auto" | "tv" | "desktop"): boolean {
  if (typeof window === "undefined") return false;
  if (override === "tv") return true;
  if (override === "desktop") return false;
  if (cachedTv !== null) return cachedTv;
  // The init script in app/layout.tsx tags TVs up front. Honoring that here
  // means even browsers with a vanilla desktop UA (some Tizen models mask
  // as Desktop) still get TV treatment.
  if (document.documentElement.classList.contains("is-tv")) {
    cachedTv = true;
    return true;
  }
  cachedTv = TV_UA_PATTERN.test(navigator.userAgent || "");
  return cachedTv;
}

/** All currently focusable descendants of `root`. Skips hidden elements. */
function getFocusables(root: ParentNode = document): HTMLElement[] {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  return nodes.filter((el) => {
    if (el === document.activeElement) return true;
    // offsetParent is null for display:none and detached nodes.
    if (el.offsetParent === null) {
      // Fixed-positioned elements (toast, drawer, player) report null but
      // are still on-screen. Check via getClientRects instead.
      return el.getClientRects().length > 0;
    }
    const style = window.getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none";
  });
}

/** Where arrow-key navigation should look for candidates. */
function getNavigationRoot(): ParentNode {
  const drawer = document.querySelector(".details-drawer");
  if (drawer) return drawer;
  return document;
}

function focusElement(el: HTMLElement) {
  el.focus({ preventScroll: true });
  // Make sure the focused element is on screen (rails overflow horizontally,
  // lists vertically, so this matters for cards beyond the first viewport).
  el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
}

/**
 * Move focus to the closest focusable element in `direction`. The math is
 * the tv.js / W3C spatial-nav formula: project each candidate's centre
 * against the active element's centre, keep only the candidates in the
 * requested quadrant, then pick the one whose primary-axis distance is
 * smallest (with a small penalty on the perpendicular axis so lateral
 * drift is tolerated when there is no directly-aligned candidate).
 */
function moveFocusSpatial(direction: { dx: -1 | 0 | 1; dy: -1 | 0 | 1 }) {
  const root = getNavigationRoot();
  const focusables = getFocusables(root).filter(
    (el) => !el.hasAttribute("data-tv-skip")
  );
  if (!focusables.length) return;
  const active = document.activeElement as HTMLElement | null;
  if (!active || active === document.body || !document.body.contains(active)) {
    focusElement(focusables[0]);
    return;
  }
  const aRect = active.getBoundingClientRect();
  const aCx = aRect.left + aRect.width / 2;
  const aCy = aRect.top + aRect.height / 2;

  let best: { el: HTMLElement; score: number } | null = null;
  for (const el of focusables) {
    if (el === active) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const bCx = r.left + r.width / 2;
    const bCy = r.top + r.height / 2;
    const dx = bCx - aCx;
    const dy = bCy - aCy;

    // Strict quadrant requirement — must be measurably in the chosen
    // direction (≥4 CSS px) so the navigation actually moves.
    if (direction.dx > 0 && dx <= 4) continue;
    if (direction.dx < 0 && dx >= -4) continue;
    if (direction.dy > 0 && dy <= 4) continue;
    if (direction.dy < 0 && dy >= -4) continue;

    const primary = direction.dx !== 0 ? Math.abs(dx) : Math.abs(dy);
    const lateral = direction.dx !== 0 ? Math.abs(dy) : Math.abs(dx);
    // Penalise the perpendicular axis. This way, when there's no candidate
    // directly below, we accept one slightly to the side rather than
    // refusing to move.
    const score = primary + lateral * 2.2;
    if (!best || score < best.score) best = { el, score };
  }
  if (best) focusElement(best.el);
}

function closeIfOpen(): boolean {
  // Drawer has higher priority than player (player overlay sits on top, but
  // the drawer is what the user opens from the home rails).
  const drawerClose = document.querySelector(".details-drawer .close") as HTMLButtonElement | null;
  if (drawerClose) {
    drawerClose.click();
    return true;
  }
  // Player has its own Back / X button labelled "Close".
  const playerClose = document.querySelector(".player-overlay .player-icon-btn[aria-label='Close']") as HTMLButtonElement | null;
  if (playerClose) {
    playerClose.click();
    return true;
  }
  return false;
}

function isTextInput(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  if (target.tagName === "TEXTAREA") return true;
  if (target.tagName === "INPUT") {
    const type = (target as HTMLInputElement).type;
    // Buttons, checkboxes, etc. should keep their default focus behaviour.
    const textLike = ["text", "search", "email", "password", "number", "url", "tel"].includes(type);
    return textLike;
  }
  if (target.isContentEditable) return true;
  return false;
}

/**
 * Walk up from `el` until we hit a focusable ancestor that's not marked
 * with `data-tv-skip`. Returns null if no focusable ancestor exists.
 */
function closestFocusable(el: Element | null): HTMLElement | null {
  let current: Element | null = el;
  while (current && current !== document.body) {
    if (current instanceof HTMLElement) {
      if (current.matches(FOCUSABLE_SELECTOR) && !current.hasAttribute("data-tv-skip")) {
        return current;
      }
    }
    current = current.parentElement;
  }
  return null;
}

/**
 * Install the global D-Pad handler. Call once at the app shell — duplicate
 * calls would double-fire, so don't.
 */
export function useTvShell() {
  useEffect(() => {
    if (!isTvPlatform()) return;
    if (typeof window === "undefined") return;

    // Re-tag in case the init script was bypassed (override=tv on desktop).
    document.documentElement.classList.add("is-tv");

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inText = isTextInput(target);

      switch (e.key) {
        case "ArrowRight":
          if (inText) return;
          e.preventDefault();
          moveFocusSpatial({ dx: 1, dy: 0 });
          break;
        case "ArrowLeft":
          if (inText) return;
          e.preventDefault();
          moveFocusSpatial({ dx: -1, dy: 0 });
          break;
        case "ArrowDown":
          if (inText) return;
          e.preventDefault();
          moveFocusSpatial({ dx: 0, dy: 1 });
          break;
        case "ArrowUp":
          if (inText) return;
          e.preventDefault();
          moveFocusSpatial({ dx: 0, dy: -1 });
          break;
        case "Backspace":
          if (inText) return;
          // Suppress browser default (history.back) and try our own close.
          e.preventDefault();
          closeIfOpen();
          break;
        default:
          break;
      }
      // Space / Enter / Arrow keys fall through to the browser default,
      // which fires click on the focused button — that's what we want.
    };

    /**
     * Pointermove fallback for TVs that translate D-Pad presses into
     * mouse motion (Roku, some Tizen / webOS builds). The handler maps
     * the current cursor position to the underlying focusable element
     * and follows it with the focus ring. Throttled to a single rAF tick
     * so a stream of native events doesn't stutter the UI.
     *
     * Skip when the pointer is a real mouse without a button pressed —
     * those are normal hover events and focusing them would be hostile.
     */
    let rafPending = false;
    let lastFocused: HTMLElement | null = null;
    const onPointerMove = (e: PointerEvent) => {
      // Real mouse without buttons → normal hover; don't auto-focus.
      if (e.pointerType === "mouse" && e.buttons === 0) return;
      if (rafPending) return;
      rafPending = true;
      window.requestAnimationFrame(() => {
        rafPending = false;
        const hit = document.elementFromPoint(e.clientX, e.clientY);
        if (!hit || hit === document.body) return;
        const candidate = closestFocusable(hit);
        if (candidate && candidate !== lastFocused) {
          lastFocused = candidate;
          candidate.focus({ preventScroll: true });
        }
      });
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.classList.remove("is-tv");
    };
  }, []);
}

/**
 * Focus the first focusable descendant of `rootSelector` shortly after mount.
 * Skips elements that opted out via `[data-tv-skip]` (used by the brand /
 * clock that are visual filler, not navigation targets).
 */
export function useAutoFocus(rootSelector: string, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    if (!isTvPlatform()) return;
    if (typeof window === "undefined") return;

    // Wait a tick so async-loaded content (rails, drawer) has a chance to
    // mount; without this we'd focus the sidebar and miss the actual content.
    const timer = window.setTimeout(() => {
      const root = document.querySelector(rootSelector);
      if (!root) return;
      const candidates = getFocusables(root).filter((el) => !el.hasAttribute("data-tv-skip"));
      if (!candidates.length) return;
      focusElement(candidates[0]);
    }, 240);

    return () => window.clearTimeout(timer);
  }, [rootSelector, enabled]);
}

/**
 * Focus a specific element (by selector) when `when` becomes true. Used by the
 * drawer to focus its close button on open, and by the player to focus the
 * playback overlay on show.
 */
export function useFocusOn(selector: string, when: boolean) {
  useEffect(() => {
    if (!when) return;
    if (!isTvPlatform()) return;
    if (typeof window === "undefined") return;

    const timer = window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(selector);
      if (el) focusElement(el);
    }, 80);

    return () => window.clearTimeout(timer);
  }, [selector, when]);
}

/** Test helper — clears the cached TV detection. */
export function __resetTvCacheForTests() {
  cachedTv = null;
}
