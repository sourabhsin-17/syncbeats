import { useEffect, useRef, useState } from 'react';

interface YouTubePlayerInstance {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  setVolume: (vol: number) => void;
  destroy: () => void;
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement | string,
        options: {
          videoId: string;
          playerVars?: Record<string, number | string>;
          events?: {
            onReady?: () => void;
            onError?: (e: { data: number }) => void;
          };
        },
      ) => YouTubePlayerInstance;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YouTubeSyncPlayerProps {
  videoId: string;
  isPlaying: boolean;
  anchorServerTime: number;
  anchorPositionSec: number;
  clockOffsetMs: number;
  volume: number;
  muted: boolean;
  onSyncDrift?: (driftMs: number) => void;
}

let ytApiPromise: Promise<void> | null = null;

function ensureYouTubeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise((resolve) => {
    const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prevReady?.();
      resolve();
    };
    if (!existing) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.async = true;
      document.head.appendChild(tag);
    }
  });

  return ytApiPromise;
}

export function YouTubeSyncPlayer({
  videoId,
  isPlaying,
  anchorServerTime,
  anchorPositionSec,
  clockOffsetMs,
  volume,
  muted,
  onSyncDrift,
}: YouTubeSyncPlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YouTubePlayerInstance | null>(null);
  const [ready, setReady] = useState(false);
  const [ytError, setYtError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setYtError(null);

    void ensureYouTubeApi().then(() => {
      if (cancelled || !containerRef.current || !window.YT?.Player) return;

      playerRef.current?.destroy();
      const mountNode = document.createElement('div');
      containerRef.current.innerHTML = '';
      containerRef.current.appendChild(mountNode);

      playerRef.current = new window.YT.Player(mountNode, {
        videoId,
        playerVars: {
          playsinline: 1,
          rel: 0,
          modestbranding: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            if (!cancelled) {
              setReady(true);
            }
          },
          onError: (evt) => {
            if (!cancelled) {
              const code = evt.data;
              setYtError(
                code === 101 || code === 150
                  ? 'The video owner disabled embedded playback for this YouTube track.'
                  : 'YouTube video could not be loaded or is unavailable in this region.',
              );
            }
          },
        },
      });
    });

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [videoId]);

  useEffect(() => {
    const player = playerRef.current;
    if (!ready || !player) return;
    player.setVolume(muted ? 0 : Math.round(volume * 100));
  }, [muted, ready, volume]);

  useEffect(() => {
    const player = playerRef.current;
    if (!ready || !player) return;

    const serverNow = Date.now() + clockOffsetMs;
    const elapsed = isPlaying ? Math.max(0, (serverNow - anchorServerTime) / 1000) : 0;
    const targetSec = Math.max(0, anchorPositionSec + elapsed);

    const current = player.getCurrentTime?.() ?? 0;
    if (Math.abs(current - targetSec) > 1.2) {
      player.seekTo(targetSec, true);
    }

    if (isPlaying) {
      player.playVideo();
    } else {
      player.pauseVideo();
    }
  }, [anchorPositionSec, anchorServerTime, clockOffsetMs, isPlaying, ready]);

  useEffect(() => {
    if (!ready || !isPlaying) return;
    const id = window.setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      const serverNow = Date.now() + clockOffsetMs;
      const expected = anchorPositionSec + Math.max(0, (serverNow - anchorServerTime) / 1000);
      const actual = player.getCurrentTime?.() ?? expected;
      const driftMs = (actual - expected) * 1000;
      onSyncDrift?.(driftMs);
      if (Math.abs(driftMs) > 1500) {
        player.seekTo(expected, true);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [anchorPositionSec, anchorServerTime, clockOffsetMs, isPlaying, onSyncDrift, ready]);

  return (
    <div className="space-y-2.5">
      <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-white/10 bg-black">
        {ytError ? (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-rose-300">
            {ytError}
          </div>
        ) : (
          <div ref={containerRef} className="h-full w-full" />
        )}
      </div>
      <p className="text-xs text-zinc-400">
        YouTube IFrame mode: playback aligns approximately (~150–400 ms) depending on browser
        buffering and ads. Upload MP3/WAV or use Studio tracks for sub-25 ms sample lock.
      </p>
    </div>
  );
}
