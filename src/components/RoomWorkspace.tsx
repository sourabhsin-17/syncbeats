import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUp,
  Check,
  Copy,
  Crown,
  ExternalLink,
  Laptop,
  Lock,
  LogOut,
  MessageSquare,
  Music2,
  Pause,
  Pencil,
  Play,
  Plus,
  Send,
  Shield,
  SkipBack,
  SkipForward,
  Smartphone,
  Trash2,
  Upload,
  UserX,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useSyncRoom } from '../hooks/useSyncRoom';
import { getBuiltinTrackUrl } from '../lib/audioEngine';
import { YouTubeSyncPlayer } from './YouTubeSyncPlayer';
import { AmbientSoundCanvas } from './AmbientSoundCanvas';
import { MovingCoverStage } from './MovingCoverStage';
import type { RoomDevice, Track } from '../../shared/types';

interface RoomWorkspaceProps {
  roomId: string;
  onLeaveRoom: () => void;
}

type MobileTab = 'player' | 'playlist' | 'chat' | 'speakers';
type AddTrackTab = 'url' | 'upload' | 'studio';

function formatTime(sec: number): string {
  const safe = Math.max(0, Math.floor(sec));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatClockTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function readAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const probe = new Audio();
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => {
      const dur = Number.isFinite(probe.duration) ? Math.round(probe.duration) : 180;
      URL.revokeObjectURL(objectUrl);
      resolve(Math.max(5, dur));
    };
    probe.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(180);
    };
    probe.src = objectUrl;
  });
}

function DevicePlatformIcon({ platform }: { platform: string }) {
  if (/iOS|Android/i.test(platform)) {
    return <Smartphone className="w-4 h-4 text-zinc-400 shrink-0" />;
  }
  return <Laptop className="w-4 h-4 text-zinc-400 shrink-0" />;
}

function providerLabel(track: Track): string {
  switch (track.provider) {
    case 'builtin':
      return 'Beat Crate WAV · Sub-25 ms sync';
    case 'uploaded':
      return 'Uploaded Audio · Sub-25 ms sync';
    case 'direct_url':
      return 'Direct Audio URL · Sub-25 ms sync';
    case 'youtube':
      return 'YouTube · Approximate sync (~150–400 ms)';
    case 'spotify':
      return 'Spotify · Account-gated cue';
    case 'apple_music':
      return 'Apple Music · Account-gated cue';
  }
}

export function RoomWorkspace({ roomId, onLeaveRoom }: RoomWorkspaceProps) {
  const {
    roomState,
    connected,
    error,
    errorCode,
    passwordRequired,
    kickedReason,
    deviceId,
    localDeviceName,
    clockOffsetMs,
    rttMs,
    submitRoomPassword,
    leaveRoomExplicitly,
    play,
    pause,
    seek,
    selectTrack,
    addBuiltinTrack,
    addUrlTrack,
    voteTrack,
    removeTrack,
    renameDevice,
    reportTelemetry,
    reportTrackDuration,
    sendChat,
    transferHost,
    kickMember,
    updateRoomSettings,
    clearError,
  } = useSyncRoom(roomId);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const loadedTrackIdRef = useRef<string | null>(null);
  const scheduleTimeoutRef = useRef<number | null>(null);
  const lastAdvanceRef = useRef<string>('');
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [audioSrc, setAudioSrc] = useState<string>('');
  const [audioReady, setAudioReady] = useState<boolean>(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState<boolean>(false);
  const [mediaLoadError, setMediaLoadError] = useState<string | null>(null);
  const [displayPosSec, setDisplayPosSec] = useState<number>(0);
  const [localDriftMs, setLocalDriftMs] = useState<number>(0);
  const [volume, setVolume] = useState<number>(0.85);
  const [muted, setMuted] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [editingName, setEditingName] = useState<boolean>(false);
  const [draftName, setDraftName] = useState<string>(localDeviceName);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [artFailed, setArtFailed] = useState<boolean>(false);
  const [meterBars, setMeterBars] = useState<number[]>([0.2, 0.4, 0.3, 0.55, 0.35, 0.45, 0.25, 0.3]);

  const [mobileTab, setMobileTab] = useState<MobileTab>('player');
  const [showAddTrack, setShowAddTrack] = useState<boolean>(false);
  const [addTab, setAddTab] = useState<AddTrackTab>('url');
  const [trackUrlInput, setTrackUrlInput] = useState<string>('');
  const [trackTitleInput, setTrackTitleInput] = useState<string>('');
  const [trackArtistInput, setTrackArtistInput] = useState<string>('');

  const [chatInput, setChatInput] = useState<string>('');
  const [passwordAttempt, setPasswordAttempt] = useState<string>('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [verifyingPassword, setVerifyingPassword] = useState<boolean>(false);

  const currentTrack: Track | undefined = useMemo(() => {
    if (!roomState || roomState.queue.length === 0) return undefined;
    return roomState.queue[roomState.currentTrackIndex] ?? roomState.queue[0];
  }, [roomState]);

  const isHtmlAudioTrack = Boolean(
    currentTrack &&
      (currentTrack.provider === 'builtin' ||
        currentTrack.provider === 'uploaded' ||
        currentTrack.provider === 'direct_url'),
  );

  const isHost = roomState?.hostDeviceId === deviceId;
  const canControlPlayback = roomState?.controlMode !== 'host_only' || isHost;

  const inviteUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/?room=${encodeURIComponent(roomId)}`;
  }, [roomId]);

  useEffect(() => {
    setDraftName(localDeviceName);
  }, [localDeviceName]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = muted ? 0 : volume;
    }
  }, [volume, muted]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [roomState?.chat.length]);

  // Resolve track audio URL for HTMLAudio-compatible providers
  useEffect(() => {
    let cancelled = false;
    setMediaLoadError(null);

    if (!currentTrack) {
      loadedTrackIdRef.current = null;
      setAudioSrc('');
      return;
    }

    setArtFailed(false);

    if (
      currentTrack.provider !== 'builtin' &&
      currentTrack.provider !== 'uploaded' &&
      currentTrack.provider !== 'direct_url'
    ) {
      loadedTrackIdRef.current = currentTrack.id;
      audioRef.current?.pause();
      setAudioSrc('');
      return;
    }

    async function resolveSource(track: Track) {
      if (track.sourceType === 'builtin' && track.builtinKey) {
        const url = await getBuiltinTrackUrl(track.builtinKey);
        if (!cancelled && loadedTrackIdRef.current !== track.id) {
          loadedTrackIdRef.current = track.id;
          setAudioSrc(url);
        }
      } else if (track.mediaUrl) {
        if (!cancelled && loadedTrackIdRef.current !== track.id) {
          loadedTrackIdRef.current = track.id;
          setAudioSrc(track.mediaUrl);
        }
      }
    }

    void resolveSource(currentTrack);
    return () => {
      cancelled = true;
    };
  }, [currentTrack]);

  const latestClockOffsetRef = useRef(clockOffsetMs);
  const latestLocalDriftRef = useRef(localDriftMs);
  const latestAudioReadyRef = useRef(audioReady);
  const latestRoomStateRef = useRef(roomState);

  useEffect(() => {
    latestClockOffsetRef.current = clockOffsetMs;
  }, [clockOffsetMs]);

  useEffect(() => {
    latestLocalDriftRef.current = localDriftMs;
  }, [localDriftMs]);

  useEffect(() => {
    latestAudioReadyRef.current = audioReady;
  }, [audioReady]);

  useEffect(() => {
    latestRoomStateRef.current = roomState;
  }, [roomState]);

  const syncIsPlaying = roomState?.isPlaying ?? false;
  const syncTrackIndex = roomState?.currentTrackIndex ?? 0;
  const syncAnchorTime = roomState?.anchorServerTime ?? 0;
  const syncAnchorPos = roomState?.anchorPositionSec ?? 0;
  const syncTrackId = currentTrack?.id ?? '';
  const syncTrackDuration = currentTrack?.durationSec ?? 0;
  const syncHostDeviceId = roomState?.hostDeviceId ?? '';
  const syncQueueLength = roomState?.queue.length ?? 0;

  // Core synchronization executor for HTMLAudioElement (only re-runs on playback anchor / track changes)
  const syncAudioToRoom = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !syncTrackId || !isHtmlAudioTrack || !audioSrc) return;

    if (scheduleTimeoutRef.current !== null) {
      clearTimeout(scheduleTimeoutRef.current);
      scheduleTimeoutRef.current = null;
    }

    if (!syncIsPlaying) {
      audio.pause();
      const targetPos = Math.max(0, Math.min(syncTrackDuration, syncAnchorPos));
      if (Math.abs(audio.currentTime - targetPos) > 0.05 && audio.readyState >= 1) {
        audio.currentTime = targetPos;
      }
      setDisplayPosSec(targetPos);
      setLocalDriftMs(0);
      return;
    }

    const serverNow = Date.now() + latestClockOffsetRef.current;
    const delayUntilAnchorMs = syncAnchorTime - serverNow;

    const startAtCalculatedPosition = async () => {
      const activeAudio = audioRef.current;
      const latestRoom = latestRoomStateRef.current;
      if (!activeAudio || !latestRoom?.isPlaying) return;

      const nowServer = Date.now() + latestClockOffsetRef.current;
      const elapsedSec = Math.max(0, (nowServer - syncAnchorTime) / 1000);
      const targetPos = Math.min(
        Math.max(0, syncTrackDuration - 0.05),
        syncAnchorPos + elapsedSec,
      );

      if (activeAudio.readyState >= 1) {
        activeAudio.currentTime = targetPos;
      }

      try {
        await activeAudio.play();
        setAudioReady(true);
        setAutoplayBlocked(false);
      } catch {
        setAudioReady(false);
        setAutoplayBlocked(true);
      }
    };

    if (delayUntilAnchorMs > 18 && delayUntilAnchorMs < 3000) {
      if (audio.readyState >= 1) {
        audio.currentTime = Math.max(0, syncAnchorPos);
      }
      scheduleTimeoutRef.current = window.setTimeout(() => {
        void startAtCalculatedPosition();
      }, delayUntilAnchorMs);
    } else {
      await startAtCalculatedPosition();
    }
  }, [
    audioSrc,
    isHtmlAudioTrack,
    syncAnchorPos,
    syncAnchorTime,
    syncIsPlaying,
    syncTrackDuration,
    syncTrackId,
  ]);

  useEffect(() => {
    void syncAudioToRoom();
    return () => {
      if (scheduleTimeoutRef.current !== null) {
        clearTimeout(scheduleTimeoutRef.current);
      }
    };
  }, [syncAudioToRoom]);

  // Continuous 250ms drift check + progress timer + host auto-advance
  useEffect(() => {
    if (!syncTrackId) return;

    const interval = window.setInterval(() => {
      const audio = audioRef.current;
      const serverNow = Date.now() + latestClockOffsetRef.current;

      if (!syncIsPlaying) {
        setDisplayPosSec(syncAnchorPos);
        return;
      }

      const elapsed = Math.max(0, (serverNow - syncAnchorTime) / 1000);
      const expectedPos = syncAnchorPos + elapsed;
      const clampedExpected = Math.min(syncTrackDuration, expectedPos);
      setDisplayPosSec(clampedExpected);

      if (!autoplayBlocked && currentTrack) {
        const phase = expectedPos * (currentTrack.bpm / 60) * Math.PI;
        setMeterBars(
          Array.from({ length: 8 }, (_, idx) => {
            const val = 0.25 + 0.65 * Math.abs(Math.sin(phase + idx * 0.55));
            return Math.min(1, Math.max(0.12, val));
          }),
        );
      }

      if (expectedPos >= syncTrackDuration - 0.15 && syncQueueLength > 0) {
        const advanceKey = `${syncTrackIndex}-${syncAnchorTime}`;
        if (syncHostDeviceId === deviceId && lastAdvanceRef.current !== advanceKey) {
          lastAdvanceRef.current = advanceKey;
          const nextIdx = (syncTrackIndex + 1) % syncQueueLength;
          selectTrack(nextIdx, true);
        }
        return;
      }

      if (isHtmlAudioTrack && audio && !audio.paused && audio.readyState >= 2) {
        const driftMs = (audio.currentTime - expectedPos) * 1000;
        setLocalDriftMs(Math.round(driftMs * 10) / 10);
        if (Math.abs(driftMs) > 22) {
          audio.currentTime = Math.max(0, expectedPos);
        }
      }
    }, 250);

    return () => clearInterval(interval);
  }, [
    autoplayBlocked,
    currentTrack,
    deviceId,
    isHtmlAudioTrack,
    selectTrack,
    syncAnchorPos,
    syncAnchorTime,
    syncHostDeviceId,
    syncIsPlaying,
    syncQueueLength,
    syncTrackDuration,
    syncTrackId,
    syncTrackIndex,
  ]);

  // Periodically report real device telemetry to room on a calm 2.5s cadence
  useEffect(() => {
    if (!connected || !syncTrackId) return;
    reportTelemetry(latestLocalDriftRef.current, isHtmlAudioTrack ? latestAudioReadyRef.current : true);
    const id = window.setInterval(() => {
      reportTelemetry(
        latestLocalDriftRef.current,
        isHtmlAudioTrack ? latestAudioReadyRef.current : true,
      );
    }, 2500);
    return () => clearInterval(id);
  }, [connected, isHtmlAudioTrack, reportTelemetry, syncTrackId]);

  const handleLeave = () => {
    leaveRoomExplicitly();
    onLeaveRoom();
  };

  const handleUnlockAudio = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      await audio.play();
      setAudioReady(true);
      setAutoplayBlocked(false);
      await syncAudioToRoom();
    } catch {
      setAutoplayBlocked(true);
    }
  };

  const handleTogglePlay = async () => {
    if (!roomState || !canControlPlayback) return;
    if (roomState.isPlaying) {
      pause(displayPosSec);
    } else {
      const audio = audioRef.current;
      if (isHtmlAudioTrack && audio && audio.paused) {
        const prevMuted = audio.muted;
        try {
          audio.muted = true;
          await audio.play();
          audio.pause();
          setAudioReady(true);
          setAutoplayBlocked(false);
        } catch {
          // Handled on room:state
        } finally {
          audio.muted = prevMuted;
        }
      }
      play(displayPosSec);
    }
  };

  const handlePrev = () => {
    if (!roomState || roomState.queue.length === 0 || !canControlPlayback) return;
    if (displayPosSec > 3) {
      seek(0);
      return;
    }
    const prevIdx =
      (roomState.currentTrackIndex - 1 + roomState.queue.length) % roomState.queue.length;
    selectTrack(prevIdx, roomState.isPlaying);
  };

  const handleNext = () => {
    if (!roomState || roomState.queue.length === 0 || !canControlPlayback) return;
    const nextIdx = (roomState.currentTrackIndex + 1) % roomState.queue.length;
    selectTrack(nextIdx, roomState.isPlaying);
  };

  const handleCopyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 1800);
    } catch {
      setCopiedLink(false);
    }
  };

  const handleSaveDeviceName = (e: React.FormEvent) => {
    e.preventDefault();
    renameDevice(draftName);
    setEditingName(false);
  };

  const handleAddUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackUrlInput.trim()) return;
    addUrlTrack(trackUrlInput.trim(), trackTitleInput.trim(), trackArtistInput.trim());
    setTrackUrlInput('');
    setTrackTitleInput('');
    setTrackArtistInput('');
    setShowAddTrack(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (file.size > 24 * 1024 * 1024) {
      setUploadError('Audio file must be under 24 MB.');
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    try {
      const durationSec = await readAudioDuration(file);
      const cleanTitle = file.name.replace(/\.[^/.]+$/, '').slice(0, 80) || 'Uploaded Track';
      const resp = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': file.type || 'audio/mpeg',
          'X-Requested-With': 'XMLHttpRequest',
          'x-device-id': deviceId,
          'x-track-title': encodeURIComponent(cleanTitle),
          'x-track-artist': encodeURIComponent('Shared File'),
          'x-added-by': encodeURIComponent(localDeviceName),
          'x-track-duration': String(durationSec),
        },
        body: file,
      });

      if (!resp.ok) {
        const body = (await resp.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || 'Upload failed');
      }
      setShowAddTrack(false);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Unable to upload audio file.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    sendChat(chatInput);
    setChatInput('');
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifyingPassword(true);
    setPasswordError(null);
    const err = await submitRoomPassword(passwordAttempt);
    if (err) {
      setPasswordError(err);
    }
    setVerifyingPassword(false);
  };

  // Terminal / Blocking states: Kicked, Room Not Found / Full, Password Required
  if (kickedReason) {
    return (
      <div className="min-h-screen bg-[#06050E] text-[#E6EDF7] flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-xl glass p-7 text-center">
          <UserX className="w-10 h-10 text-rose-400 mx-auto mb-3" />
          <h1 className="font-display text-xl font-semibold text-white">Removed from Room</h1>
          <p className="mt-2 text-sm text-zinc-400">{kickedReason}</p>
          <button
            type="button"
            onClick={onLeaveRoom}
            className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#FF4D1C] hover:bg-[#FF6438] rounded-lg cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Home</span>
          </button>
        </div>
      </div>
    );
  }

  if (passwordRequired && !roomState) {
    return (
      <div className="min-h-screen bg-[#06050E] text-[#E6EDF7] flex items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-xl glass p-7">
          <div className="flex items-center gap-2.5 mb-2">
            <Lock className="w-5 h-5 text-[#FF4D1C]" />
            <h1 className="font-display text-xl font-semibold text-white">Room Locked</h1>
          </div>
          <p className="text-sm text-zinc-400 mb-5">
            Enter the password for room <span className="font-mono text-[#FF4D1C]">{roomId}</span>.
          </p>
          <form onSubmit={(e) => void handlePasswordSubmit(e)} className="space-y-4">
            <input
              type="password"
              value={passwordAttempt}
              onChange={(e) => setPasswordAttempt(e.target.value)}
              placeholder="Room password"
              autoFocus
              required
              className="w-full px-3.5 py-2.5 text-sm bg-zinc-900 border border-white/12 rounded-lg text-white placeholder:text-zinc-500 focus:border-[#FF4D1C] focus:outline-none"
            />
            {passwordError && (
              <p role="alert" className="text-xs text-rose-400">
                {passwordError}
              </p>
            )}
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={onLeaveRoom}
                className="text-xs text-zinc-400 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={verifyingPassword || !passwordAttempt}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-[#FF4D1C] hover:bg-[#FF6438] disabled:opacity-50 rounded-lg cursor-pointer"
              >
                {verifyingPassword ? 'Verifying...' : 'Unlock Room'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  if (
    !roomState &&
    (errorCode === 'ROOM_NOT_FOUND' || errorCode === 'INVALID_ROOM' || errorCode === 'ROOM_FULL')
  ) {
    return (
      <div className="min-h-screen bg-[#06050E] text-[#E6EDF7] flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-xl glass p-7 text-center">
          <h1 className="font-display text-xl font-semibold text-white">Unable to Join Room</h1>
          <p className="mt-2 text-sm text-zinc-400">{error}</p>
          <button
            type="button"
            onClick={onLeaveRoom}
            className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#FF4D1C] hover:bg-[#FF6438] rounded-lg cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Home</span>
          </button>
        </div>
      </div>
    );
  }

  const devices: RoomDevice[] = roomState?.devices ?? [];
  const onlineCount = devices.filter((d) => d.online).length;
  const queue: Track[] = roomState?.queue ?? [];
  const chat = roomState?.chat ?? [];

  return (
    <div className="relative min-h-screen bg-[#06050E] text-[#E6EDF7]">
      <AmbientSoundCanvas active={Boolean(roomState?.isPlaying)} />
      <audio
        ref={audioRef}
        src={audioSrc || undefined}
        preload="auto"
        onLoadedMetadata={() => {
          const audio = audioRef.current;
          if (
            audio &&
            currentTrack &&
            currentTrack.sourceType !== 'builtin' &&
            Number.isFinite(audio.duration) &&
            audio.duration >= 5 &&
            canControlPlayback
          ) {
            reportTrackDuration(currentTrack.id, Math.round(audio.duration));
          }
        }}
        onLoadedData={() => {
          setMediaLoadError(null);
          void syncAudioToRoom();
        }}
        onError={() => {
          if (audioSrc && isHtmlAudioTrack) {
            setMediaLoadError(
              'Audio stream could not be loaded by this browser (expired URL or CORS restriction).',
            );
          }
        }}
      />

      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#06050E]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1320px] items-center justify-between gap-8 px-6 py-4">
          <button
            type="button"
            onClick={handleLeave}
            className="font-display text-lg font-extrabold tracking-tight text-[#E6EDF7] hover:text-[#67E8F9] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            SyncBeats
          </button>

          <nav
            aria-label="Room Navigation"
            className="hidden lg:flex items-center gap-7 text-sm font-medium text-[#A7A3C7]"
          >
            <a href="#room-player" className="hover:text-[#67E8F9] transition-colors whitespace-nowrap shrink-0">
              Player
            </a>
            <a href="#room-queue" className="hover:text-[#67E8F9] transition-colors whitespace-nowrap shrink-0">
              Playlist
            </a>
            <a href="#room-chat" className="hover:text-[#67E8F9] transition-colors whitespace-nowrap shrink-0">
              Chat
            </a>
            <button
              type="button"
              onClick={handleLeave}
              className="inline-flex items-center gap-1.5 hover:text-[#67E8F9] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Leave Room</span>
            </button>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => void handleCopyInvite()}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#FF4D1C] hover:bg-[#FF6438] rounded-lg transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copiedLink ? 'Link Copied' : 'Share Room'}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-[1320px] px-4 sm:px-6 py-6 lg:py-8">
        {/* Room Sub-Bar & Host Permissions */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-white/[0.08]">
          <div>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-[#A7A3C7]">
              <span className="font-mono text-[#67E8F9] font-semibold">Code {roomId}</span>
              <span aria-hidden="true">·</span>
              <span>{roomState?.visibility === 'private' ? 'Private Room' : 'Public Room'}</span>
              {roomState?.hasPassword && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>Password Locked</span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {onlineCount}/{roomState?.maxCapacity ?? 16} speakers
              </span>
              <span aria-hidden="true">·</span>
              <span>{connected ? 'Connected' : 'Reconnecting...'}</span>
            </div>
            <h1 className="font-display text-xl sm:text-2xl font-semibold text-white mt-1">
              {roomState?.roomName ?? `Room ${roomId}`}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {isHost ? (
              <button
                type="button"
                onClick={() =>
                  updateRoomSettings({
                    controlMode:
                      roomState?.controlMode === 'host_only' ? 'collaborative' : 'host_only',
                  })
                }
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-zinc-200 bg-zinc-900 hover:bg-zinc-800 border border-white/12 rounded-lg transition-colors cursor-pointer"
              >
                <Shield className="w-3.5 h-3.5 text-[#FF4D1C]" />
                <span>
                  Mode: {roomState?.controlMode === 'host_only' ? 'Host-Only' : 'Collaborative'}
                </span>
              </button>
            ) : (
              <span className="text-xs text-zinc-400 px-2 py-1.5">
                {roomState?.controlMode === 'host_only'
                  ? 'Host-Only playback active'
                  : 'Collaborative controls'}
              </span>
            )}

            <button
              type="button"
              onClick={handleLeave}
              className="lg:hidden inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-zinc-200 bg-zinc-900 hover:bg-zinc-800 border border-white/12 rounded-lg cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Leave</span>
            </button>
          </div>
        </div>

        {/* Mobile / Tablet Section Switcher */}
        <div
          role="tablist"
          aria-label="Room sections"
          className="lg:hidden grid grid-cols-4 gap-1 p-1 mb-6 bg-zinc-900 border border-white/10 rounded-lg"
        >
          {(
            [
              { id: 'player', label: 'Player' },
              { id: 'playlist', label: `Queue (${queue.length})` },
              { id: 'chat', label: 'Chat' },
              { id: 'speakers', label: `Speakers (${onlineCount})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={mobileTab === tab.id}
              type="button"
              onClick={() => setMobileTab(tab.id)}
              className={`py-2.5 px-2 text-xs font-medium rounded-md transition-colors truncate cursor-pointer ${
                mobileTab === tab.id
                  ? 'bg-[#FF4D1C] text-white font-semibold'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {error && (
          <div
            role="alert"
            className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-rose-500/30 bg-rose-950/30 px-5 py-3.5 text-sm text-rose-200"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={clearError}
              aria-label="Dismiss message"
              className="p-1 text-rose-300 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {mediaLoadError && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-rose-500/30 bg-rose-950/30 px-5 py-3.5 text-sm text-rose-200"
          >
            {mediaLoadError}
          </div>
        )}

        {autoplayBlocked && isHtmlAudioTrack && (
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-[#FF4D1C]/40 bg-[#FF4D1C]/10 px-5 py-4">
            <div>
              <p className="text-sm font-semibold text-white">
                Browser audio output needs confirmation
              </p>
              <p className="text-xs text-zinc-300 mt-0.5">
                Tap below to unlock this speaker and lock immediately into the active track.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleUnlockAudio()}
              className="px-4 py-2.5 text-sm font-semibold text-white bg-[#FF4D1C] hover:bg-[#FF6438] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Enable Speaker Audio
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-7 items-start">
          {/* Primary Stage: Player + Playlist */}
          <div className="lg:col-span-8 space-y-7">
            {/* Player Card */}
            <section
              id="room-player"
              className={`${mobileTab === 'player' ? 'block' : 'hidden'} lg:block rounded-xl glass p-5 sm:p-7`}
            >
              {currentTrack ? (
                <>
                  <div className="flex flex-col sm:flex-row gap-5 items-start sm:items-center">
                    <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-lg overflow-hidden border border-white/10 bg-zinc-900 shrink-0">
                      {currentTrack.artworkUrl && !artFailed ? (
                        <img
                          src={currentTrack.artworkUrl}
                          alt={`${currentTrack.title} cover art`}
                          referrerPolicy="no-referrer"
                          onError={() => setArtFailed(true)}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-950">
                          <Music2 className="w-8 h-8 text-[#FF4D1C]" />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-zinc-400 mb-1.5">
                        <span>{providerLabel(currentTrack)}</span>
                      </div>

                      <h2 className="font-display text-xl sm:text-2xl font-semibold tracking-tight text-white truncate">
                        {currentTrack.title}
                      </h2>
                      <p className="mt-1 text-sm text-zinc-400 truncate">{currentTrack.artist}</p>

                      <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-zinc-500">
                        <span className="font-mono tabular-nums">{currentTrack.bpm} BPM</span>
                        <span aria-hidden="true">·</span>
                        <span>Added by {currentTrack.addedBy}</span>
                      </div>
                    </div>

                    <div
                      aria-hidden="true"
                      className="hidden sm:flex items-end gap-1 h-12 px-2 shrink-0"
                    >
                      {meterBars.map((level, idx) => (
                        <div
                          key={idx}
                          className="w-1.5 rounded-sm bg-[#FF4D1C]/85 transition-transform duration-150 origin-bottom"
                          style={{
                            height: '44px',
                            transform: `scaleY(${roomState?.isPlaying && !autoplayBlocked ? level : 0.14})`,
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Animated Song Front-Page Cover Slides */}
                  <MovingCoverStage
                    track={currentTrack}
                    isPlaying={Boolean(roomState?.isPlaying)}
                  />

                  {/* Provider-specific embed or notice */}
                  {currentTrack.provider === 'youtube' && currentTrack.youtubeId && (
                    <div className="mt-6">
                      <YouTubeSyncPlayer
                        videoId={currentTrack.youtubeId}
                        isPlaying={Boolean(roomState?.isPlaying)}
                        anchorServerTime={roomState?.anchorServerTime ?? Date.now()}
                        anchorPositionSec={roomState?.anchorPositionSec ?? 0}
                        clockOffsetMs={clockOffsetMs}
                        volume={volume}
                        muted={muted}
                        onSyncDrift={(d) => setLocalDriftMs(Math.round(d * 10) / 10)}
                        onDurationDetected={(dur) => {
                          if (canControlPlayback) {
                            reportTrackDuration(currentTrack.id, dur);
                          }
                        }}
                        onTrackEnded={() => {
                          if (isHost && roomState && roomState.queue.length > 0) {
                            const nextIdx = (roomState.currentTrackIndex + 1) % roomState.queue.length;
                            selectTrack(nextIdx, true);
                          }
                        }}
                      />
                    </div>
                  )}

                  {(currentTrack.provider === 'spotify' ||
                    currentTrack.provider === 'apple_music') && (
                    <div className="mt-6 rounded-lg border border-white/10 bg-zinc-900/70 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-white">
                          {currentTrack.provider === 'spotify' ? 'Spotify' : 'Apple Music'} Cue
                          (Manual / Account Playback)
                        </p>
                        <p className="text-xs text-zinc-400 mt-1">
                          Due to streaming DRM and individual subscription restrictions, browsers
                          cannot automatically sync full tracks across guests. Open the track in your
                          app to listen along.
                        </p>
                      </div>
                      {currentTrack.externalUrl && (
                        <a
                          href={currentTrack.externalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#FF4D1C] hover:bg-[#FF6438] rounded-lg whitespace-nowrap shrink-0"
                        >
                          <span>
                            Open in {currentTrack.provider === 'spotify' ? 'Spotify' : 'Apple Music'}
                          </span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  )}

                  {/* Timeline Scrubber */}
                  <div className="mt-7">
                    <input
                      type="range"
                      min={0}
                      max={currentTrack.durationSec || 44}
                      step={0.1}
                      disabled={!canControlPlayback}
                      value={Math.min(displayPosSec, currentTrack.durationSec || 44)}
                      onChange={(e) => seek(Number(e.target.value))}
                      aria-label="Playback position"
                      className="w-full h-2 accent-[#FF4D1C] bg-zinc-800 rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <div className="mt-2 flex items-center justify-between text-xs font-mono text-zinc-400 tabular-nums">
                      <span>{formatTime(displayPosSec)}</span>
                      <span>
                        {roomState?.isPlaying
                          ? isHtmlAudioTrack
                            ? `Drift ${localDriftMs >= 0 ? '+' : ''}${localDriftMs.toFixed(1)} ms`
                            : 'Provider-dependent sync'
                          : 'Paused'}
                      </span>
                      <span>{formatTime(currentTrack.durationSec)}</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="py-10 text-center">
                  <Music2 className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
                  <p className="text-base font-medium text-white">No track loaded</p>
                  <p className="text-sm text-zinc-400 mt-1">
                    Drop in a Beat Crate cut, audio URL, or upload an MP3/WAV file to start playback.
                  </p>
                </div>
              )}

              {/* Transport & Local Volume Controls */}
              <div className="mt-6 pt-5 border-t border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-5">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handlePrev}
                    disabled={!canControlPlayback || queue.length === 0}
                    aria-label="Previous track"
                    className="w-11 h-11 rounded-lg border border-white/10 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 flex items-center justify-center text-zinc-200 transition-colors cursor-pointer disabled:cursor-not-allowed"
                  >
                    <SkipBack className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleTogglePlay()}
                    disabled={!canControlPlayback || queue.length === 0}
                    className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-[#FF4D1C] hover:bg-[#FF6438] disabled:opacity-40 rounded-lg transition-colors duration-150 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {roomState?.isPlaying ? (
                      <>
                        <Pause className="w-4 h-4" />
                        <span>Pause</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        <span>Play Synced</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleNext}
                    disabled={!canControlPlayback || queue.length === 0}
                    aria-label="Next track"
                    className="w-11 h-11 rounded-lg border border-white/10 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 flex items-center justify-center text-zinc-200 transition-colors cursor-pointer disabled:cursor-not-allowed"
                  >
                    <SkipForward className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setMuted((prev) => !prev)}
                    aria-label={muted ? 'Unmute local speaker' : 'Mute local speaker'}
                    className="w-10 h-10 rounded-lg border border-white/10 bg-zinc-900 hover:bg-zinc-800 flex items-center justify-center text-zinc-300 transition-colors shrink-0 cursor-pointer"
                  >
                    {muted || volume === 0 ? (
                      <VolumeX className="w-4 h-4 text-zinc-500" />
                    ) : (
                      <Volume2 className="w-4 h-4 text-zinc-200" />
                    )}
                  </button>
                  <div className="flex items-center gap-2.5 flex-1 sm:w-36">
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.02}
                      value={muted ? 0 : volume}
                      onChange={(e) => {
                        setMuted(false);
                        setVolume(Number(e.target.value));
                      }}
                      aria-label="Local speaker volume"
                      className="w-full h-2 accent-[#FF4D1C] bg-zinc-800 rounded-lg cursor-pointer"
                    />
                    <span className="text-xs font-mono text-zinc-400 tabular-nums w-9 text-right">
                      {Math.round((muted ? 0 : volume) * 100)}%
                    </span>
                  </div>
                </div>
              </div>
            </section>

            {/* Shared Collaborative Playlist */}
            <section
              id="room-queue"
              className={`${mobileTab === 'playlist' ? 'block' : 'hidden'} lg:block rounded-xl glass overflow-hidden`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-6 py-5 border-b border-white/[0.08]">
                <div>
                  <h2 className="font-display text-lg font-semibold text-white">
                    Shared Room Playlist
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Vote upcoming tracks up the queue, upload MP3/WAV, or add YouTube and audio
                    links.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAddTrack((prev) => !prev)}
                  disabled={roomState?.controlMode === 'host_only' && !isHost}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#FF4D1C] hover:bg-[#FF6438] disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
                >
                  {showAddTrack ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                  <span>{showAddTrack ? 'Close Panel' : 'Add Track'}</span>
                </button>
              </div>

              {/* Add Track Drawer */}
              {showAddTrack && (
                <div className="px-6 py-5 bg-zinc-950/60 border-b border-white/[0.08] space-y-4">
                  <div className="flex flex-wrap items-center gap-1 p-1 bg-zinc-900 border border-white/10 rounded-lg w-fit">
                    {(
                      [
                        { id: 'url', label: 'Track / Stream URL' },
                        { id: 'upload', label: 'Upload File' },
                        { id: 'studio', label: 'Beat Crate' },
                      ] as const
                    ).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setAddTab(t.id)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                          addTab === t.id
                            ? 'bg-[#FF4D1C] text-white font-semibold'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {addTab === 'url' && (
                    <form onSubmit={handleAddUrlSubmit} className="space-y-3">
                      <input
                        type="url"
                        value={trackUrlInput}
                        onChange={(e) => setTrackUrlInput(e.target.value)}
                        placeholder="Paste YouTube, Direct MP3/WAV URL, Spotify, or Apple Music link"
                        required
                        className="w-full px-3.5 py-2.5 text-sm bg-zinc-900 border border-white/12 rounded-lg text-white placeholder:text-zinc-500 focus:border-[#FF4D1C] focus:outline-none"
                      />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input
                          type="text"
                          value={trackTitleInput}
                          onChange={(e) => setTrackTitleInput(e.target.value)}
                          placeholder="Track title (optional)"
                          maxLength={80}
                          className="px-3.5 py-2 text-xs bg-zinc-900 border border-white/12 rounded-lg text-white placeholder:text-zinc-500 focus:border-[#FF4D1C] focus:outline-none"
                        />
                        <input
                          type="text"
                          value={trackArtistInput}
                          onChange={(e) => setTrackArtistInput(e.target.value)}
                          placeholder="Artist (optional)"
                          maxLength={80}
                          className="px-3.5 py-2 text-xs bg-zinc-900 border border-white/12 rounded-lg text-white placeholder:text-zinc-500 focus:border-[#FF4D1C] focus:outline-none"
                        />
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <p className="text-[11px] text-zinc-400">
                          YouTube, Spotify, Apple Music &amp; SoundCloud links automatically pull
                          cover slides. Direct MP3/WAV syncs sub-25 ms.
                        </p>
                        <button
                          type="submit"
                          className="px-4 py-2 text-xs font-semibold text-white bg-[#FF4D1C] hover:bg-[#FF6438] rounded-lg whitespace-nowrap cursor-pointer"
                        >
                          Add to Playlist
                        </button>
                      </div>
                    </form>
                  )}

                  {addTab === 'upload' && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <p className="text-sm text-white font-medium">Upload local audio file</p>
                        <p className="text-xs text-zinc-400 mt-0.5">
                          MP3, WAV, OGG, or M4A up to 24 MB. Streamed synchronously to all speakers.
                        </p>
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="audio/*"
                        onChange={(e) => void handleFileUpload(e)}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#FF4D1C] hover:bg-[#FF6438] disabled:opacity-50 rounded-lg cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>{isUploading ? 'Uploading...' : 'Choose Audio File'}</span>
                      </button>
                    </div>
                  )}

                  {addTab === 'studio' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {(
                        [
                          { key: 'afterhours', label: '808 Afterhours · 140 BPM Trap' },
                          { key: 'boombap', label: '94 Boom Bap · 92 BPM Classic' },
                          { key: 'cypher', label: 'Concrete Cypher · 102 BPM West' },
                          { key: 'drill', label: 'Southside Stunt · 144 BPM Drill' },
                          { key: 'lofi', label: 'Late Night Lo-Fi · 82 BPM Chill' },
                          { key: 'golden', label: 'Golden Era Tape · 96 BPM Soul' },
                        ] as const
                      ).map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => addBuiltinTrack(item.key)}
                          className="flex items-center justify-between px-3.5 py-2.5 text-xs font-medium text-zinc-200 bg-zinc-900 hover:bg-zinc-800 border border-white/10 rounded-lg cursor-pointer"
                        >
                          <span>{item.label}</span>
                          <Plus className="w-3.5 h-3.5 text-[#FF4D1C]" />
                        </button>
                      ))}
                    </div>
                  )}

                  {uploadError && (
                    <p role="alert" className="text-xs text-rose-400">
                      {uploadError}
                    </p>
                  )}
                </div>
              )}

              {queue.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <p className="text-sm font-medium text-white">Playlist is empty</p>
                  <p className="text-xs text-zinc-400 mt-1">
                    Click “Add Track” above to queue a Beat Crate cut, audio file, or URL.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-white/[0.06]">
                  {queue.map((track, idx) => {
                    const isCurrent = idx === roomState?.currentTrackIndex;
                    const hasVoted = track.votes.includes(deviceId);
                    const canRemove =
                      isHost ||
                      (roomState?.controlMode === 'collaborative' &&
                        track.addedByDeviceId === deviceId);

                    return (
                      <div
                        key={track.id}
                        className={`flex items-center justify-between gap-3 px-5 sm:px-6 py-3.5 transition-colors ${
                          isCurrent ? 'bg-[#FF4D1C]/[0.06]' : 'hover:bg-white/[0.02]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => canControlPlayback && selectTrack(idx, true)}
                          disabled={!canControlPlayback}
                          className="flex-1 flex items-center gap-3.5 text-left min-w-0 cursor-pointer disabled:cursor-default"
                        >
                          <span
                            className={`w-6 text-xs font-mono tabular-nums shrink-0 ${
                              isCurrent ? 'text-[#FF4D1C] font-semibold' : 'text-zinc-500'
                            }`}
                          >
                            {String(idx + 1).padStart(2, '0')}
                          </span>
                          <div className="min-w-0">
                            <div
                              className={`text-sm font-medium truncate ${
                                isCurrent ? 'text-[#FF6438]' : 'text-white'
                              }`}
                            >
                              {track.title}
                            </div>
                            <div className="text-xs text-zinc-500 truncate mt-0.5">
                              {track.artist} · {track.addedBy}
                            </div>
                          </div>
                        </button>

                        <div className="flex items-center gap-2.5 sm:gap-3.5 shrink-0">
                          <span className="hidden sm:inline text-xs text-zinc-400 font-medium">
                            {isCurrent ? (roomState?.isPlaying ? 'Playing' : 'Selected') : ''}
                          </span>

                          {!isCurrent && (
                            <button
                              type="button"
                              onClick={() => voteTrack(track.id)}
                              aria-label={hasVoted ? `Remove vote for ${track.title}` : `Vote up ${track.title}`}
                              className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-mono tabular-nums rounded-md border transition-colors cursor-pointer ${
                                hasVoted
                                  ? 'bg-[#FF4D1C]/15 border-[#FF4D1C]/50 text-[#FF6438]'
                                  : 'bg-zinc-900 border-white/10 text-zinc-300 hover:border-white/25'
                              }`}
                            >
                              <ArrowUp className="w-3 h-3" />
                              <span>{track.votes.length}</span>
                            </button>
                          )}

                          <span className="text-xs font-mono text-zinc-400 tabular-nums">
                            {formatTime(track.durationSec)}
                          </span>

                          {canRemove && (
                            <button
                              type="button"
                              onClick={() => removeTrack(track.id)}
                              aria-label={`Remove ${track.title} from queue`}
                              className="p-2 text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          {/* Right Rail: Chat + Invite + Connected Speakers */}
          <aside className="lg:col-span-4 space-y-6">
            {/* Live Room Chat */}
            <section
              id="room-chat"
              className={`${mobileTab === 'chat' ? 'flex' : 'hidden'} lg:flex flex-col rounded-xl glass overflow-hidden`}
            >
              <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-[#FF4D1C]" />
                  <h2 className="font-display text-base font-semibold text-white">Room Chat</h2>
                </div>
                <span className="text-xs font-mono text-zinc-400 tabular-nums">
                  {chat.length} messages
                </span>
              </div>

              <div className="h-64 overflow-y-auto px-5 py-4 space-y-3 bg-zinc-950/35">
                {chat.length === 0 ? (
                  <p className="text-xs text-zinc-500 text-center py-12">
                    No messages yet. Say hello to everyone in the room.
                  </p>
                ) : (
                  chat.map((msg) =>
                    msg.system ? (
                      <div key={msg.id} className="text-[11px] text-zinc-500 text-center py-0.5">
                        <span>{msg.text}</span>
                      </div>
                    ) : (
                      <div key={msg.id} className="space-y-0.5">
                        <div className="flex items-baseline justify-between gap-2">
                          <span
                            className={`text-xs font-medium ${
                              msg.deviceId === deviceId ? 'text-[#FF6438]' : 'text-zinc-200'
                            }`}
                          >
                            {msg.senderName}
                          </span>
                          <span className="text-[11px] font-mono text-zinc-500 tabular-nums">
                            {formatClockTime(msg.timestamp)}
                          </span>
                        </div>
                        <p className="text-sm text-zinc-300 leading-snug break-words">{msg.text}</p>
                      </div>
                    ),
                  )
                )}
                <div ref={chatEndRef} />
              </div>

              <form
                onSubmit={handleSendChat}
                className="p-3 border-t border-white/[0.08] flex items-center gap-2"
              >
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  maxLength={400}
                  placeholder="Send a message..."
                  aria-label="Room chat message"
                  className="flex-1 px-3 py-2 text-sm bg-zinc-900 border border-white/12 rounded-lg text-white placeholder:text-zinc-500 focus:border-[#FF4D1C] focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim() || !connected}
                  aria-label="Send message"
                  className="p-2.5 text-white bg-[#FF4D1C] hover:bg-[#FF6438] disabled:opacity-40 rounded-lg transition-colors cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </section>

            {/* Invite / Multi-Device QR Card */}
            <section
              className={`${mobileTab === 'speakers' ? 'block' : 'hidden'} lg:block rounded-xl glass p-5`}
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs text-zinc-400">Room Code</p>
                  <p className="font-mono text-2xl font-semibold tracking-wider text-white mt-0.5">
                    {roomId}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleCopyInvite()}
                  className="px-3 py-2 text-xs font-medium text-zinc-200 bg-zinc-800 hover:bg-zinc-700 border border-white/10 rounded-lg transition-colors cursor-pointer"
                >
                  {copiedLink ? 'Copied' : 'Copy URL'}
                </button>
              </div>

              <div className="mt-4 flex justify-center">
                <div className="p-2.5 bg-white rounded-lg">
                  <QRCodeSVG
                    value={inviteUrl || roomId}
                    size={132}
                    level="M"
                    bgColor="#FFFFFF"
                    fgColor="#09090B"
                  />
                </div>
              </div>

              <a
                href={inviteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-zinc-800 hover:bg-zinc-700 border border-white/12 rounded-lg transition-colors"
              >
                <span>Open Second Speaker Tab</span>
                <ExternalLink className="w-3.5 h-3.5 text-[#FF4D1C]" />
              </a>
            </section>

            {/* Connected Speakers & Host Governance */}
            <section
              id="room-speakers"
              className={`${mobileTab === 'speakers' ? 'block' : 'hidden'} lg:block rounded-xl glass overflow-hidden`}
            >
              <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between">
                <h2 className="font-display text-base font-semibold text-white">
                  Members &amp; Speakers
                </h2>
                <span className="text-xs font-mono text-zinc-400 tabular-nums">
                  {onlineCount} / {roomState?.maxCapacity ?? 16} online
                </span>
              </div>

              <div className="px-5 py-2.5 bg-zinc-950/60 border-b border-white/[0.06] flex items-center justify-between text-xs">
                <span className="text-zinc-400">Your Clock Offset</span>
                <span className="font-mono text-zinc-200 tabular-nums">
                  {clockOffsetMs >= 0 ? '+' : ''}
                  {clockOffsetMs} ms · RTT {rttMs} ms
                </span>
              </div>

              <div className="divide-y divide-white/[0.06]">
                {devices.map((dev) => {
                  const isYou = dev.id === deviceId;
                  const driftMagnitude = Math.abs(dev.driftMs);
                  const syncLabel = !dev.online
                    ? 'Reconnecting'
                    : !roomState?.isPlaying
                      ? 'Standby'
                      : !dev.audioReady
                        ? 'Audio Muted'
                        : driftMagnitude <= 25
                          ? 'Locked'
                          : 'Aligning';

                  return (
                    <div key={dev.id} className="px-5 py-3.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <DevicePlatformIcon platform={dev.platform} />
                          <div className="min-w-0">
                            {isYou && editingName ? (
                              <form
                                onSubmit={handleSaveDeviceName}
                                className="flex items-center gap-1.5"
                              >
                                <input
                                  type="text"
                                  value={draftName}
                                  onChange={(e) => setDraftName(e.target.value)}
                                  maxLength={40}
                                  autoFocus
                                  className="w-32 px-2 py-1 text-xs bg-zinc-900 border border-[#FF4D1C] rounded text-white focus:outline-none"
                                />
                                <button
                                  type="submit"
                                  className="px-2 py-1 text-xs font-medium bg-[#FF4D1C] text-white rounded cursor-pointer"
                                >
                                  Save
                                </button>
                              </form>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-medium text-white truncate">
                                  {dev.name}
                                </span>
                                {isYou && (
                                  <button
                                    type="button"
                                    onClick={() => setEditingName(true)}
                                    aria-label="Rename this device"
                                    className="text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            )}
                            <div className="text-xs text-zinc-500 mt-0.5">
                              {dev.platform}
                              {isYou ? ' · You' : ''}
                              {dev.isHost ? ' · Host' : ''}
                            </div>
                          </div>
                        </div>

                        <span
                          className={`text-xs font-medium shrink-0 ${
                            syncLabel === 'Locked'
                              ? 'text-[#FF4D1C]'
                              : syncLabel === 'Audio Muted' || syncLabel === 'Reconnecting'
                                ? 'text-rose-400'
                                : 'text-zinc-400'
                          }`}
                        >
                          {syncLabel}
                        </span>
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 text-[11px] font-mono text-zinc-400 tabular-nums">
                          <span>RTT {dev.rttMs} ms</span>
                          <span aria-hidden="true">·</span>
                          <span>
                            Drift {dev.driftMs >= 0 ? '+' : ''}
                            {dev.driftMs.toFixed(1)} ms
                          </span>
                        </div>

                        {isHost && !isYou && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => transferHost(dev.id)}
                              title="Make Host"
                              aria-label={`Transfer host to ${dev.name}`}
                              className="p-1.5 text-zinc-400 hover:text-[#FF4D1C] rounded border border-white/10 hover:border-[#FF4D1C]/40 transition-colors cursor-pointer"
                            >
                              <Crown className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => kickMember(dev.id)}
                              title="Remove from Room"
                              aria-label={`Remove ${dev.name} from room`}
                              className="p-1.5 text-zinc-400 hover:text-rose-400 rounded border border-white/10 hover:border-rose-400/40 transition-colors cursor-pointer"
                            >
                              <UserX className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
