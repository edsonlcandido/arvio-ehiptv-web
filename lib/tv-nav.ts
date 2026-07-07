"use client";

import { useEffect } from "react";

/**
 * TV / D-Pad navigation helpers.
 *
 * Why this exists: when the app is opened on a Smart TV (Android TV, Chromecast,
 * Roku, webOS, etc.) the browser usually maps the remote's directional pad to
 * mouse pointer movement + click instead of arrow-key events. That makes the UI
 * almost unusable — no focus ring, no keyboard input, the user has to aim a
 * pointer at cards with the remote.
 *
 * This module detects the TV form factor (User Agent + manual override) and
 * installs a keyboard-style navigation layer on top of the regular app:
 *
 *   • <html class="is-tv"> lets CSS tune the layout (bigger hit targets,
 *     thicker focus rings, horizontal padding so the rightmost card on a
 *     rail isn't clipped).
 *   • Arrow keys / D-Pad move focus between focusable elements in DOM order.
 *     We use DOM order (tab order) instead of true spatial navigation so the
 *     behavior is predictable; rails scroll horizontally with the rail, lists
 *     scroll vertically with the list.
 *   • Enter / Space on a focused button fires its click.
 *   • Backspace closes the open drawer / player (mirrors the Back button on
 *     the remote); falls back to nothing rather than navigating history.
 *   • Text inputs swallow arrow keys so the caret still moves normally while
 *     typing.
 *   • Auto-focus hooks let each screen pick the first element to focus when
 *     it mounts, instead of relying on the browser default which is body.
 *
 * The hooks are no-ops outside a TV environment, so this is safe to ship to
 * desktop / mobile without behavior changes.
 */

const TV_UA_PATTERN = /TV|SmartTV|SMART-TV|Android ?TV|HBRA-|Chromecast|AFT|Web0S|webOS|HISENSE|Roku|Apple ?TV|Tizen|Nintendo|SHIELD|Xbox|PlayStation/i;

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
 * module level — the UA never changes inside a session.
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
  const ua = navigator.userAgent || "";
  cachedTv = TV_UA_PATTERN.test(ua);
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

function moveFocus(direction: 1 | -1) {
  const root = getNavigationRoot();
  const focusables = getFocusables(root);
  if (!focusables.length) return;
  const active = document.activeElement as HTMLElement | null;
  const currentIdx = active ? focusables.indexOf(active) : -1;
  // If nothing focused yet, jump to first / last. If at the boundary, stay put
  // so the user can tell the rail ran out.
  const nextIdx = currentIdx === -1 ? (direction === 1 ? 0 : focusables.length - 1) : currentIdx + direction;
  if (nextIdx < 0 || nextIdx >= focusables.length) return;
  focusElement(focusables[nextIdx]);
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
 * Install the global D-Pad handler. Call once at the app shell — duplicate
 * calls would double-fire, so don't.
 */
export function useTvShell() {
  useEffect(() => {
    if (!isTvPlatform()) return;
    if (typeof window === "undefined") return;

    document.documentElement.classList.add("is-tv");

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inText = isTextInput(target);

      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
          if (inText) return;
          e.preventDefault();
          moveFocus(1);
          break;
        case "ArrowLeft":
        case "ArrowUp":
          if (inText) return;
          e.preventDefault();
          moveFocus(-1);
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
      // Space / Enter fall through to the browser default, which fires click
      // on the focused button — that's exactly what we want.
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
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