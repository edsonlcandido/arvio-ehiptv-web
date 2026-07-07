import Hls from "hls.js";

export function attachPlayback(video: HTMLVideoElement, url: string) {
  if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = url;
    return () => {
      video.removeAttribute("src");
      video.load();
    };
  }

  if (Hls.isSupported() && (url.includes(".m3u8") || url.includes("application/vnd.apple.mpegurl"))) {
    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 90
    });
    hls.loadSource(url);
    hls.attachMedia(video);
    return () => hls.destroy();
  }

  video.src = url;
  return () => {
    video.removeAttribute("src");
    video.load();
  };
}

/**
 * Request fullscreen on the document. Called from the play actions
 * (playChannel / playStream / playEhIptv) so the request lands inside
 * the same user-gesture click that triggered playback — calling it from
 * a React useEffect after the overlay mounts would race against the
 * gesture and silently fail on most browsers.
 */
export function enterFullscreen() {
  if (typeof document === "undefined") return;
  if (document.fullscreenElement) return;
  void document.documentElement.requestFullscreen?.().catch(() => undefined);
}

/** Exit fullscreen if currently active. No-op on the server or when not fullscreen. */
export function exitFullscreen() {
  if (typeof document === "undefined") return;
  if (!document.fullscreenElement) return;
  void document.exitFullscreen?.().catch(() => undefined);
}
