import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  ChevronDown,
  Globe,
  Laptop,
  Lock,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Smartphone,
  Tablet,
  Volume2,
  X,
} from 'lucide-react';
import { getBuiltinTrackUrl, LandingSyncDemoAudio } from '../lib/audioEngine';
import type {
  BuiltinBeatKey,
  ControlMode,
  PublicRoomSummary,
  RoomVisibility,
} from '../../shared/types';

export interface CreateRoomOptions {
  roomName: string;
  visibility: RoomVisibility;
  password: string;
  maxCapacity: number;
  controlMode: ControlMode;
}

interface LandingPageProps {
  onCreateRoom: (options: CreateRoomOptions) => Promise<void>;
  onJoinRoom: (roomCode: string) => void;
  isCreating: boolean;
  joinError: string | null;
}

interface FeaturedBeat {
  key: BuiltinBeatKey;
  title: string;
  producer: string;
  genre: string;
  bpm: number;
  cover: string;
}

const FEATURED_BEATS: FeaturedBeat[] = [
  {
    key: 'afterhours',
    title: '808 Afterhours',
    producer: 'Metro District',
    genre: 'Trap / Dark 808s',
    bpm: 140,
    cover: '/src/assets/images/cover_808_afterhours_1795418328427.jpg',
  },
  {
    key: 'boombap',
    title: '94 Boom Bap',
    producer: 'Crate Diggers',
    genre: 'Classic East Coast',
    bpm: 92,
    cover: '/src/assets/images/cover_boom_bap_1795418328317.jpg',
  },
  {
    key: 'cypher',
    title: 'Concrete Cypher',
    producer: 'Westside Bounce',
    genre: 'G-Funk Groove',
    bpm: 102,
    cover: '/src/assets/images/cover_concrete_cypher_1795418328402.jpg',
  },
  {
    key: 'drill',
    title: 'Southside Stunt',
    producer: 'Block 808',
    genre: 'UK / NY Drill',
    bpm: 144,
    cover: '/src/assets/images/cover_808_afterhours_1795418328427.jpg',
  },
  {
    key: 'lofi',
    title: 'Late Night Lo-Fi',
    producer: 'Tape Deck 404',
    genre: 'Chill Hip-Hop',
    bpm: 82,
    cover: '/src/assets/images/cover_boom_bap_1795418328317.jpg',
  },
  {
    key: 'golden',
    title: 'Golden Era Tape',
    producer: 'Rooftop Sessions',
    genre: 'Neo-Soul Hop',
    bpm: 96,
    cover: '/src/assets/images/cover_concrete_cypher_1795418328402.jpg',
  },
];

const VIRTUAL_DEVICES = [
  {
    id: 'mac',
    name: 'MacBook · Aux Host',
    network: 'Home Wi-Fi',
    icon: Laptop,
    syncedOffset: 0.0,
    unsyncedOffset: 0.0,
  },
  {
    id: 'iphone',
    name: 'iPhone 16 · Pocket',
    network: '5G Cellular',
    icon: Smartphone,
    syncedOffset: 7.0,
    unsyncedOffset: 74.0,
  },
  {
    id: 'ipad',
    name: 'Android · Kitchen',
    network: 'Home Wi-Fi',
    icon: Tablet,
    syncedOffset: 11.0,
    unsyncedOffset: 148.0,
  },
];

const FAQ_ITEMS = [
  {
    q: 'Does everyone at the hangout need to install an app?',
    a: 'Nope. Open SyncBeats in Safari or Chrome on iOS, Android, Mac, Windows, or Linux—scan the room QR or punch in the 6-letter code and every phone locks right in.',
  },
  {
    q: 'What if some people are on 5G and others are on Wi-Fi?',
    a: 'Every phone syncs directly to the room server clock over WebSockets, so someone on cellular data stays locked with laptops on Wi-Fi.',
  },
  {
    q: 'Can we drop our own MP3s, WAVs, or YouTube tracks?',
    a: 'Yes. Upload MP3/WAV/M4A beats from your phone or paste YouTube, Spotify, Apple Music, or direct audio links. Built-in beats, uploads, and direct streams target sub-25 ms sync.',
  },
  {
    q: 'How do host controls and queue voting work?',
    a: 'Anyone can upvote upcoming tracks to push the next banger to the top, chat live, or adjust their own speaker volume. Hosts can lock controls, set a room password, or pass the aux.',
  },
];

export function LandingPage({
  onCreateRoom,
  onJoinRoom,
  isCreating,
  joinError,
}: LandingPageProps) {
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [localJoinError, setLocalJoinError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);

  const [publicRooms, setPublicRooms] = useState<PublicRoomSummary[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [visibility, setVisibility] = useState<RoomVisibility>('public');
  const [roomPassword, setRoomPassword] = useState('');
  const [maxCapacity, setMaxCapacity] = useState(16);
  const [controlMode, setControlMode] = useState<ControlMode>('collaborative');

  const [passwordPromptRoomId, setPasswordPromptRoomId] = useState<string | null>(null);
  const [passwordAttempt, setPasswordAttempt] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [verifyingPassword, setVerifyingPassword] = useState(false);

  // Featured Beat Crate Audio Preview
  const [playingBeatKey, setPlayingBeatKey] = useState<BuiltinBeatKey | null>(null);
  const [loadingBeatKey, setLoadingBeatKey] = useState<BuiltinBeatKey | null>(null);
  const crateAudioRef = useRef<HTMLAudioElement | null>(null);

  // Interactive Multi-Device Cypher Sync Check
  const [demoRunning, setDemoRunning] = useState(false);
  const [demoSynced, setDemoSynced] = useState(true);
  const [demoStep, setDemoStep] = useState(0);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  const demoAudioRef = useRef<LandingSyncDemoAudio | null>(null);

  const fetchPublicRooms = useCallback(async () => {
    setLoadingRooms(true);
    try {
      const resp = await fetch('/api/rooms');
      if (resp.ok) {
        const data = (await resp.json()) as { rooms: PublicRoomSummary[] };
        setPublicRooms(data.rooms || []);
      }
    } catch {
      // Retain existing list
    } finally {
      setLoadingRooms(false);
    }
  }, []);

  useEffect(() => {
    demoAudioRef.current = new LandingSyncDemoAudio();
    void fetchPublicRooms();
    return () => {
      demoAudioRef.current?.stop();
      crateAudioRef.current?.pause();
    };
  }, [fetchPublicRooms]);

  const toggleBeatPreview = async (key: BuiltinBeatKey) => {
    if (demoRunning) {
      demoAudioRef.current?.stop();
      setDemoRunning(false);
    }

    const audio = crateAudioRef.current;
    if (!audio) return;

    if (playingBeatKey === key) {
      audio.pause();
      setPlayingBeatKey(null);
      return;
    }

    setLoadingBeatKey(key);
    try {
      const url = await getBuiltinTrackUrl(key);
      audio.src = url;
      audio.currentTime = 0;
      await audio.play();
      setPlayingBeatKey(key);
    } catch {
      setPlayingBeatKey(null);
    } finally {
      setLoadingBeatKey(null);
    }
  };

  const toggleDemoAudio = () => {
    if (playingBeatKey && crateAudioRef.current) {
      crateAudioRef.current.pause();
      setPlayingBeatKey(null);
    }
    if (!demoAudioRef.current) return;
    if (demoRunning) {
      demoAudioRef.current.stop();
      setDemoRunning(false);
    } else {
      setDemoRunning(true);
      demoAudioRef.current.start(demoSynced, (step) => {
        setDemoStep(step);
      });
    }
  };

  const handleSetDemoMode = (synced: boolean) => {
    setDemoSynced(synced);
    demoAudioRef.current?.setSynced(synced);
  };

  const attemptJoinRoom = async (rawCode: string) => {
    const cleaned = rawCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (cleaned.length < 4) {
      setLocalJoinError('Enter a valid 4–10 character room code.');
      return;
    }

    setIsJoining(true);
    setLocalJoinError(null);
    try {
      const resp = await fetch(`/api/rooms/${encodeURIComponent(cleaned)}`);
      const data = (await resp.json().catch(() => ({}))) as {
        error?: string;
        hasPassword?: boolean;
        authorized?: boolean;
        memberCount?: number;
        maxCapacity?: number;
      };

      if (!resp.ok) {
        setLocalJoinError(data.error || `Room "${cleaned}" was not found.`);
        return;
      }

      if (
        typeof data.memberCount === 'number' &&
        typeof data.maxCapacity === 'number' &&
        data.memberCount >= data.maxCapacity
      ) {
        setLocalJoinError(`Room "${cleaned}" is full (${data.maxCapacity} speakers max).`);
        return;
      }

      if (data.hasPassword && !data.authorized) {
        setPasswordPromptRoomId(cleaned);
        setPasswordAttempt('');
        setPasswordError(null);
        return;
      }

      onJoinRoom(cleaned);
    } catch {
      setLocalJoinError('Unable to check room status. Try again.');
    } finally {
      setIsJoining(false);
    }
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void attemptJoinRoom(roomCodeInput);
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordPromptRoomId) return;
    setVerifyingPassword(true);
    setPasswordError(null);
    try {
      const resp = await fetch(`/api/rooms/${encodeURIComponent(passwordPromptRoomId)}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordAttempt }),
      });
      if (!resp.ok) {
        const body = (await resp.json().catch(() => ({}))) as { error?: string };
        setPasswordError(body.error || 'Incorrect room password.');
        return;
      }
      const targetCode = passwordPromptRoomId;
      setPasswordPromptRoomId(null);
      onJoinRoom(targetCode);
    } catch {
      setPasswordError('Unable to verify password.');
    } finally {
      setVerifyingPassword(false);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onCreateRoom({
      roomName: roomName.trim(),
      visibility,
      password: roomPassword,
      maxCapacity,
      controlMode,
    });
    setShowCreateModal(false);
  };

  const combinedJoinError = localJoinError || joinError;

  return (
    <div className="min-h-screen bg-[#070709] text-[#F7F7F3]">
      <audio
        ref={crateAudioRef}
        loop
        onEnded={() => setPlayingBeatKey(null)}
      />

      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#070709]/92 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-8 px-6 py-4">
          <a
            href="#top"
            className="font-display text-xl font-extrabold tracking-tight text-white whitespace-nowrap shrink-0"
          >
            SyncBeats
          </a>

          <nav
            aria-label="Primary"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-zinc-400"
          >
            <a
              href="#beats"
              className="hover:text-white transition-colors duration-150 whitespace-nowrap shrink-0"
            >
              Beat Crate
            </a>
            <a
              href="#demo"
              className="hover:text-white transition-colors duration-150 whitespace-nowrap shrink-0"
            >
              Sync Check
            </a>
            <a
              href="#rooms"
              className="hover:text-white transition-colors duration-150 whitespace-nowrap shrink-0"
            >
              Live Rooms
            </a>
            <a
              href="#faq"
              className="hover:text-white transition-colors duration-150 whitespace-nowrap shrink-0"
            >
              FAQ
            </a>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              disabled={isCreating}
              className="px-4 py-2 text-sm font-bold text-white bg-[#FF4D1C] hover:bg-[#FF6438] disabled:opacity-60 rounded-lg transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Start Room
            </button>
          </div>
        </div>
      </header>

      <main id="top">
        {/* Bold Youth / Music-Culture Hero */}
        <section className="mx-auto max-w-[1240px] px-6 pt-12 pb-16 lg:pt-16 lg:pb-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-between">
              <div>
                <p className="text-sm font-semibold text-[#FF4D1C] tracking-tight mb-3">
                  Clan Edition · Multi-Phone Sound System
                </p>
                <h1
                  className="font-display font-extrabold tracking-[-0.03em] text-white leading-[1.02]"
                  style={{
                    fontSize: 'clamp(2.5rem, 4.8vw, 4.1rem)',
                    textWrap: 'balance',
                  }}
                >
                  Link every phone. Drop the beat.
                </h1>
                <p className="mt-5 text-base sm:text-lg text-zinc-400 leading-relaxed max-w-[50ch]">
                  Turn every phone at the kickback into one loud speaker wall. Open a room, pass
                  the QR code, vote up the next 808, and talk live—no app downloads needed.
                </p>

                <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(true)}
                    disabled={isCreating}
                    className="inline-flex items-center justify-center gap-2 px-6 py-3.5 text-sm font-bold text-white bg-[#FF4D1C] hover:bg-[#FF6438] disabled:opacity-60 rounded-lg transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <span>{isCreating ? 'Opening Session...' : 'Start a Session'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <form onSubmit={handleJoinSubmit} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={roomCodeInput}
                      onChange={(e) => {
                        setLocalJoinError(null);
                        setRoomCodeInput(
                          e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10),
                        );
                      }}
                      placeholder="Room code (e.g. SB4829)"
                      aria-label="Room code"
                      className="flex-1 sm:w-48 px-3.5 py-3.5 text-sm font-mono uppercase tracking-wider bg-[#121216] border border-white/14 rounded-lg text-white placeholder:text-zinc-500 placeholder:normal-case placeholder:tracking-normal focus:border-[#FF4D1C] focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={isJoining || roomCodeInput.trim().length < 4}
                      className="px-4 py-3.5 text-sm font-semibold text-white bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 border border-white/12 rounded-lg transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {isJoining ? 'Checking...' : 'Join'}
                    </button>
                  </form>
                </div>

                {combinedJoinError && (
                  <p role="alert" className="mt-3 text-sm text-rose-400">
                    {combinedJoinError}
                  </p>
                )}
              </div>

              <div className="mt-10 pt-6 border-t border-white/[0.08] flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-zinc-400">
                <span>6 built-in Hip-Hop &amp; 808 beats</span>
                <span aria-hidden="true">·</span>
                <span>Works over 5G &amp; Wi-Fi</span>
                <span aria-hidden="true">·</span>
                <span>MP3 uploads, YouTube, voting &amp; chat</span>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="relative h-full min-h-[300px] lg:min-h-[460px] rounded-xl overflow-hidden border border-white/12 bg-[#121216]">
                {!heroImgFailed ? (
                  <img
                    src="/src/assets/images/hero_cypher_session_1795418328368.jpg"
                    alt="Friends in a late-night creative loft studio syncing laptops, studio monitors, and smartphones"
                    referrerPolicy="no-referrer"
                    onError={() => setHeroImgFailed(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-gradient-to-br from-[#121216] via-[#070709] to-[#2B0F08] text-center">
                    <Radio className="w-10 h-10 text-[#FF4D1C] mb-3" />
                    <p className="font-display text-lg font-bold text-white">
                      Late-Night Cypher Session
                    </p>
                    <p className="text-sm text-zinc-400 mt-1 max-w-xs">
                      Every phone in the room locked to the same 808 drop.
                    </p>
                  </div>
                )}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#070709]/85 via-transparent to-transparent" />
                <div className="absolute bottom-5 left-5 right-5 flex items-center justify-between text-xs text-zinc-200">
                  <span>Loft session · 6 synced devices</span>
                  <span className="font-mono text-[#FF6438] tabular-nums">Sub-25 ms lock</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Loaded Beat Crate — Playable Hip-Hop / Trap / Boom-Bap Beats */}
        <section id="beats" className="border-t border-white/[0.08] bg-[#0B0B0E]">
          <div className="mx-auto max-w-[1240px] px-6 py-20">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
              <div>
                <p className="text-sm font-semibold text-[#FF4D1C] mb-1.5">Loaded in Every Room</p>
                <h2
                  className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-white"
                  style={{ textWrap: 'balance' }}
                >
                  Tap any beat to audition the crate
                </h2>
                <p className="mt-2 text-sm sm:text-base text-zinc-400 max-w-[58ch]">
                  Every new room comes stocked with six studio-synthesized Hip-Hop, Trap, Boom-Bap,
                  Drill, and Lo-Fi instrumentals—ready to play right now or mix with your own MP3s.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="px-5 py-2.5 text-xs font-bold text-white bg-zinc-800 hover:bg-zinc-700 border border-white/12 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Spin Crate in a Room
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {FEATURED_BEATS.map((beat) => {
                const isPlaying = playingBeatKey === beat.key;
                const isLoading = loadingBeatKey === beat.key;

                return (
                  <article
                    key={beat.key}
                    className={`rounded-xl border transition-colors bg-[#111115] p-4 flex items-center gap-4 ${
                      isPlaying ? 'border-[#FF4D1C]/70' : 'border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="relative w-20 h-20 rounded-lg overflow-hidden border border-white/10 bg-zinc-900 shrink-0">
                      <img
                        src={beat.cover}
                        alt={`${beat.title} cover art`}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => void toggleBeatPreview(beat.key)}
                        aria-label={isPlaying ? `Pause ${beat.title}` : `Play ${beat.title}`}
                        className="absolute inset-0 flex items-center justify-center bg-black/45 hover:bg-black/60 transition-colors cursor-pointer"
                      >
                        <span
                          className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                            isPlaying ? 'bg-[#FF4D1C] text-white' : 'bg-white text-zinc-950'
                          }`}
                        >
                          {isLoading ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : isPlaying ? (
                            <Pause className="w-4 h-4" />
                          ) : (
                            <Play className="w-4 h-4 ml-0.5" />
                          )}
                        </span>
                      </button>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2 text-xs text-zinc-400">
                        <span className="truncate">{beat.genre}</span>
                        <span className="font-mono text-[#FF6438] tabular-nums shrink-0">
                          {beat.bpm} BPM
                        </span>
                      </div>
                      <h3 className="font-display text-lg font-bold text-white truncate mt-0.5">
                        {beat.title}
                      </h3>
                      <p className="text-xs text-zinc-400 truncate mt-0.5">{beat.producer}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* Interactive Multi-Phone 808 Sync Check */}
        <section id="demo" className="border-t border-white/[0.08] bg-[#070709]">
          <div className="mx-auto max-w-[1240px] px-6 py-20">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
              <div>
                <p className="text-sm font-semibold text-[#FF4D1C] mb-1.5">Live Soundcheck</p>
                <h2
                  className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-white"
                  style={{ textWrap: 'balance' }}
                >
                  Hear why echo ruins a room—and how SyncBeats locks the 808
                </h2>
                <p className="mt-2 text-sm sm:text-base text-zinc-400 max-w-[60ch]">
                  Hit play to trigger a three-phone 808 and snare groove right here. Flip between
                  Clock-Locked and Echo Drift to hear three speakers snap into one pocket.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 shrink-0">
                <div
                  role="group"
                  aria-label="Synchronization mode"
                  className="flex items-center gap-1 p-1 bg-[#121216] border border-white/10 rounded-lg"
                >
                  <button
                    type="button"
                    onClick={() => handleSetDemoMode(true)}
                    className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors duration-150 whitespace-nowrap cursor-pointer ${
                      demoSynced
                        ? 'bg-[#FF4D1C] text-white'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Clock-Locked
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetDemoMode(false)}
                    className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors duration-150 whitespace-nowrap cursor-pointer ${
                      !demoSynced
                        ? 'bg-zinc-700 text-white'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Echo Drift
                  </button>
                </div>

                <button
                  type="button"
                  onClick={toggleDemoAudio}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-zinc-800 hover:bg-zinc-700 border border-white/12 rounded-lg transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {demoRunning ? (
                    <>
                      <Pause className="w-4 h-4 text-[#FF4D1C]" />
                      <span>Stop Groove</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 text-[#FF4D1C]" />
                      <span>Test 3-Phone 808</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-[#101013] divide-y divide-white/[0.08]">
              {VIRTUAL_DEVICES.map((device, index) => {
                const Icon = device.icon;
                const offset = demoSynced ? device.syncedOffset : device.unsyncedOffset;
                const delayRatio = Math.min(1, offset / 160);
                const pulsePosition = demoRunning
                  ? ((demoStep + index * (demoSynced ? 0 : 2)) % 8) / 7
                  : 0.15;

                return (
                  <div
                    key={device.id}
                    className="grid grid-cols-1 md:grid-cols-12 items-center gap-4 px-6 py-5"
                  >
                    <div className="md:col-span-4 flex items-center gap-3.5 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-[#18181D] border border-white/10 flex items-center justify-center shrink-0">
                        <Icon className="w-5 h-5 text-zinc-200" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white truncate">
                          {device.name}
                        </div>
                        <div className="text-xs text-zinc-500">{device.network}</div>
                      </div>
                    </div>

                    <div className="md:col-span-5">
                      <div className="relative h-8 rounded-md bg-zinc-900/90 border border-white/[0.06] overflow-hidden flex items-center px-3">
                        <div className="w-full h-1.5 bg-zinc-800 rounded-full relative overflow-hidden">
                          <div
                            className={`absolute top-0 bottom-0 w-16 rounded-full transition-transform duration-150 ${
                              demoSynced ? 'bg-[#FF4D1C]' : 'bg-rose-400/80'
                            }`}
                            style={{
                              transform: `translateX(${Math.round(
                                (demoRunning ? pulsePosition : 0.15 + delayRatio * 0.45) * 180,
                              )}px)`,
                              opacity: demoRunning ? 1 : 0.45,
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="md:col-span-3 flex items-center justify-between md:justify-end gap-4 text-xs">
                      <span className="font-mono text-zinc-300 tabular-nums">
                        +{offset.toFixed(1)} ms
                      </span>
                      <span
                        className={
                          demoSynced
                            ? 'text-[#FF6438] font-semibold'
                            : offset === 0
                              ? 'text-zinc-400'
                              : 'text-rose-400 font-semibold'
                        }
                      >
                        {demoSynced ? 'In Pocket' : offset === 0 ? 'Aux Host' : 'Lagging'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Live Public Rooms Directory */}
        <section id="rooms" className="border-t border-white/[0.08] bg-[#0B0B0E]">
          <div className="mx-auto max-w-[1240px] px-6 py-20">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
              <div>
                <p className="text-sm font-semibold text-[#FF4D1C] mb-1.5">Open Sessions</p>
                <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white">
                  Jump into a live public room
                </h2>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => void fetchPublicRooms()}
                  disabled={loadingRooms}
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-zinc-200 bg-zinc-900 hover:bg-zinc-800 border border-white/10 rounded-lg transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingRooms ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(true)}
                  className="px-4 py-2 text-xs font-bold text-white bg-[#FF4D1C] hover:bg-[#FF6438] rounded-lg transition-colors cursor-pointer"
                >
                  New Room
                </button>
              </div>
            </div>

            {loadingRooms && publicRooms.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-[#111115] p-8 text-center text-sm text-zinc-400">
                Checking active rooms...
              </div>
            ) : publicRooms.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-[#111115] p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <p className="text-base font-semibold text-white">No public rooms live yet</p>
                  <p className="text-sm text-zinc-400 mt-1">
                    Spin up the first room—set it public or lock it with a password for just your
                    crew.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(true)}
                  className="px-5 py-2.5 text-sm font-bold text-white bg-[#FF4D1C] hover:bg-[#FF6438] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Start First Room
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {publicRooms.map((room) => (
                  <article
                    key={room.roomId}
                    className="rounded-xl border border-white/10 bg-[#111115] p-6 flex flex-col justify-between gap-5"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 text-xs text-zinc-400 mb-2">
                        <span className="font-mono text-[#FF6438]">{room.roomId}</span>
                        <span>
                          {room.hasPassword ? 'Locked' : 'Open'} ·{' '}
                          {room.controlMode === 'host_only' ? 'Host Aux' : 'Open Aux'}
                        </span>
                      </div>
                      <h3 className="font-display text-lg font-bold text-white truncate">
                        {room.roomName}
                      </h3>
                      <p className="mt-1.5 text-sm text-zinc-400 truncate">
                        {room.isPlaying
                          ? `Spinning: ${room.currentTrackTitle}`
                          : `Up next: ${room.currentTrackTitle}`}
                      </p>
                    </div>

                    <div className="pt-4 border-t border-white/[0.08] flex items-center justify-between gap-3">
                      <span className="text-xs font-mono text-zinc-400 tabular-nums">
                        {room.memberCount} / {room.maxCapacity} speakers
                      </span>
                      <button
                        type="button"
                        onClick={() => void attemptJoinRoom(room.roomId)}
                        className="px-4 py-2 text-xs font-bold text-white bg-[#FF4D1C] hover:bg-[#FF6438] rounded-lg transition-colors cursor-pointer"
                      >
                        Join Room
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Straightforward 3-Step Flow */}
        <section id="how-it-works" className="border-t border-white/[0.08] bg-[#070709]">
          <div className="mx-auto max-w-[1240px] px-6 py-20">
            <div className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div>
                <p className="text-sm font-semibold text-[#FF4D1C] mb-1.5">How the Crew Connects</p>
                <h2
                  className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-white max-w-xl"
                  style={{ textWrap: 'balance' }}
                >
                  Three moves from silent phones to a room-wide sound system
                </h2>
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <Volume2 className="w-4 h-4 text-[#FF4D1C]" />
                <span>Every speaker keeps its own physical volume slider</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <article className="rounded-xl border border-white/10 bg-[#101013] p-7">
                <span className="font-mono text-xs text-[#FF6438]">01</span>
                <h3 className="font-display text-xl font-bold text-white mt-2">Drop a Room</h3>
                <p className="mt-3 text-sm text-zinc-400 leading-relaxed">
                  Pick a room name, choose Open or Password-Locked, and decide whether everyone
                  shares the aux or only the host controls the deck.
                </p>
              </article>

              <article className="rounded-xl border border-white/10 bg-[#101013] p-7">
                <span className="font-mono text-xs text-[#FF6438]">02</span>
                <h3 className="font-display text-xl font-bold text-white mt-2">
                  Scan &amp; Lock In
                </h3>
                <p className="mt-3 text-sm text-zinc-400 leading-relaxed">
                  Friends scan the QR code or enter your 6-letter code. Each browser measures its
                  ping and locks onto the same beat ahead of drop time.
                </p>
              </article>

              <article className="rounded-xl border border-white/10 bg-[#101013] p-7">
                <span className="font-mono text-xs text-[#FF6438]">03</span>
                <h3 className="font-display text-xl font-bold text-white mt-2">
                  Vote &amp; Run Chat
                </h3>
                <p className="mt-3 text-sm text-zinc-400 leading-relaxed">
                  Upload MP3s, paste YouTube links, or spin the 6 built-in Hip-Hop beats while your
                  crew upvotes the queue and chats live.
                </p>
              </article>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="border-t border-white/[0.08] bg-[#0B0B0E]">
          <div className="mx-auto max-w-[1240px] px-6 py-20">
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white mb-8">
              Got questions?
            </h2>

            <div className="divide-y divide-white/[0.08] border-y border-white/[0.08]">
              {FAQ_ITEMS.map((item, idx) => {
                const isOpen = openFaqIndex === idx;
                return (
                  <div key={item.q}>
                    <button
                      type="button"
                      onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                      aria-expanded={isOpen}
                      className="w-full flex items-center justify-between gap-4 py-5 text-left cursor-pointer group"
                    >
                      <span className="text-base font-medium text-white group-hover:text-[#FF6438] transition-colors">
                        {item.q}
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 text-zinc-400 shrink-0 transition-transform duration-150 ${
                          isOpen ? 'rotate-180 text-[#FF4D1C]' : ''
                        }`}
                      />
                    </button>
                    {isOpen && (
                      <p className="pb-5 text-sm sm:text-base text-zinc-400 leading-relaxed max-w-[70ch]">
                        {item.a}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/[0.08] bg-[#070709]">
        <div className="mx-auto max-w-[1240px] px-6 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-zinc-500">
          <div className="flex items-center gap-3">
            <span className="font-display text-sm font-bold text-zinc-200">SyncBeats</span>
            <span aria-hidden="true">·</span>
            <span>Clan Edition · Multi-device sound system</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#beats" className="hover:text-zinc-300 transition-colors">
              Beat Crate
            </a>
            <a href="#demo" className="hover:text-zinc-300 transition-colors">
              Sync Check
            </a>
            <a href="#rooms" className="hover:text-zinc-300 transition-colors">
              Live Rooms
            </a>
            <span>© 2026 SyncBeats</span>
          </div>
        </div>
      </footer>

      {/* Create Room Modal */}
      {showCreateModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-room-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
        >
          <div className="w-full max-w-md rounded-xl border border-white/12 bg-[#111115] p-6 sm:p-7">
            <div className="flex items-center justify-between mb-5">
              <h2 id="create-room-title" className="font-display text-xl font-bold text-white">
                Start a Listening Session
              </h2>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                aria-label="Close modal"
                className="p-2 text-zinc-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={(e) => void handleCreateSubmit(e)} className="space-y-4">
              <div>
                <label htmlFor="room-name" className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Session Name
                </label>
                <input
                  id="room-name"
                  type="text"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  maxLength={48}
                  placeholder="e.g. Late Night 808 Cypher"
                  className="w-full px-3.5 py-2.5 text-sm bg-zinc-900 border border-white/12 rounded-lg text-white placeholder:text-zinc-500 focus:border-[#FF4D1C] focus:outline-none"
                />
              </div>

              <div>
                <span className="block text-xs font-medium text-zinc-300 mb-1.5">Room Access</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setVisibility('public')}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                      visibility === 'public'
                        ? 'bg-[#FF4D1C]/15 border-[#FF4D1C] text-[#FF6438]'
                        : 'bg-zinc-900 border-white/10 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>Public</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setVisibility('private')}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                      visibility === 'private'
                        ? 'bg-[#FF4D1C]/15 border-[#FF4D1C] text-[#FF6438]'
                        : 'bg-zinc-900 border-white/10 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Private</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="room-capacity"
                    className="block text-xs font-medium text-zinc-300 mb-1.5"
                  >
                    Max Speakers (2–50)
                  </label>
                  <input
                    id="room-capacity"
                    type="number"
                    min={2}
                    max={50}
                    value={maxCapacity}
                    onChange={(e) =>
                      setMaxCapacity(Math.max(2, Math.min(50, Number(e.target.value) || 16)))
                    }
                    className="w-full px-3.5 py-2.5 text-sm font-mono bg-zinc-900 border border-white/12 rounded-lg text-white focus:border-[#FF4D1C] focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="room-password"
                    className="block text-xs font-medium text-zinc-300 mb-1.5"
                  >
                    Password (Optional)
                  </label>
                  <input
                    id="room-password"
                    type="password"
                    value={roomPassword}
                    onChange={(e) => setRoomPassword(e.target.value)}
                    maxLength={64}
                    placeholder="Leave blank if open"
                    className="w-full px-3.5 py-2.5 text-sm bg-zinc-900 border border-white/12 rounded-lg text-white placeholder:text-zinc-500 focus:border-[#FF4D1C] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <span className="block text-xs font-medium text-zinc-300 mb-1.5">Aux Controls</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setControlMode('collaborative')}
                    className={`py-2.5 px-3 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                      controlMode === 'collaborative'
                        ? 'bg-[#FF4D1C]/15 border-[#FF4D1C] text-[#FF6438]'
                        : 'bg-zinc-900 border-white/10 text-zinc-400 hover:text-white'
                    }`}
                  >
                    Open Aux (All)
                  </button>
                  <button
                    type="button"
                    onClick={() => setControlMode('host_only')}
                    className={`py-2.5 px-3 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                      controlMode === 'host_only'
                        ? 'bg-[#FF4D1C]/15 border-[#FF4D1C] text-[#FF6438]'
                        : 'bg-zinc-900 border-white/10 text-zinc-400 hover:text-white'
                    }`}
                  >
                    Host-Only
                  </button>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2.5 text-xs font-medium text-zinc-300 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-5 py-2.5 text-sm font-bold text-white bg-[#FF4D1C] hover:bg-[#FF6438] disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
                >
                  {isCreating ? 'Opening...' : 'Drop Room'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Password Modal */}
      {passwordPromptRoomId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="password-room-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
        >
          <div className="w-full max-w-sm rounded-xl border border-white/12 bg-[#111115] p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 id="password-room-title" className="font-display text-lg font-bold text-white">
                Enter Room Password
              </h2>
              <button
                type="button"
                onClick={() => setPasswordPromptRoomId(null)}
                aria-label="Close password modal"
                className="p-2 text-zinc-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-zinc-400 mb-4">
              Room <span className="font-mono text-[#FF6438]">{passwordPromptRoomId}</span> requires
              a password to enter.
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
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPasswordPromptRoomId(null)}
                  className="px-4 py-2 text-xs text-zinc-300 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={verifyingPassword || !passwordAttempt}
                  className="px-4 py-2 text-xs font-bold text-white bg-[#FF4D1C] hover:bg-[#FF6438] disabled:opacity-50 rounded-lg cursor-pointer"
                >
                  {verifyingPassword ? 'Verifying...' : 'Unlock & Join'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
