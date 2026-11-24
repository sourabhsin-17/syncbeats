import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  Disc3,
  Globe,
  Laptop,
  Lock,
  Pause,
  Play,
  RefreshCw,
  Smartphone,
  Tablet,
  Volume2,
  X,
} from 'lucide-react';
import { getBuiltinTrackUrl, LandingSyncDemoAudio } from '../lib/audioEngine';
import { AmbientSoundCanvas } from './AmbientSoundCanvas';
import { SignalMonitorDeck } from './SignalMonitorDeck';
import { SignalPatchLab } from './SignalPatchLab';
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
  accent: string;
  glowClass: string;
  cover: string;
  summary: string;
  pocketNote: string;
}

const FEATURED_BEATS: FeaturedBeat[] = [
  {
    key: 'afterhours',
    title: '808 Afterhours',
    producer: 'Metro District',
    genre: 'Trap / Dark 808s',
    bpm: 140,
    accent: '#FF4D1C',
    glowClass: 'glow-flame',
    cover: '/src/assets/images/cover_808_afterhours_1795418328427.jpg',
    summary:
      'Heavy sub-bass slides, crisp double-time hats, and late-night minor bell stabs engineered to punch through phone speakers.',
    pocketNote: 'Half-time snare snap · C minor sub',
  },
  {
    key: 'boombap',
    title: '94 Boom Bap',
    producer: 'Crate Diggers',
    genre: 'Classic East Coast',
    bpm: 92,
    accent: '#5DCAA5',
    glowClass: 'glow-cyan',
    cover: '/src/assets/images/cover_boom_bap_1795418328317.jpg',
    summary:
      'Dusty vinyl crackle, swung MPC kicks, and warm electric keys cut straight from a basement tape session.',
    pocketNote: 'Swing 58% · Rhodes chop',
  },
  {
    key: 'cypher',
    title: 'Concrete Cypher',
    producer: 'Westside Bounce',
    genre: 'G-Funk Groove',
    bpm: 102,
    accent: '#67E8F9',
    glowClass: 'glow-cyan',
    cover: '/src/assets/images/cover_concrete_cypher_1795418328402.jpg',
    summary:
      'Rubber-band synth basslines, crisp handclaps, and high-glide whistle leads built for rooftop cyphers.',
    pocketNote: 'Talkbox-style lead · Sun-baked bounce',
  },
  {
    key: 'drill',
    title: 'Southside Stunt',
    producer: 'Block 808',
    genre: 'UK / NY Drill',
    bpm: 144,
    accent: '#8B5CF6',
    glowClass: 'glow-violet',
    cover: '/src/assets/images/cover_southside_drill_1795551465534.jpg',
    summary:
      'Syncopated counter-snares and pitch-gliding 808 drops tuned to lock multiple devices into one chest-rattling pocket.',
    pocketNote: 'Off-beat snare pocket · Pitch glide 808',
  },
  {
    key: 'lofi',
    title: 'Late Night Lo-Fi',
    producer: 'Tape Deck 404',
    genre: 'Chill Hip-Hop',
    bpm: 82,
    accent: '#E879F9',
    glowClass: 'glow-violet',
    cover: '/src/assets/images/cover_lofi_tape_1795551465579.jpg',
    summary:
      'Warm cassette saturation, laid-back jazz sevenths, and soft brushed drums for study nights and chill hangs.',
    pocketNote: 'SP-404 tape wow · Rain-soaked chords',
  },
  {
    key: 'golden',
    title: 'Golden Era Tape',
    producer: 'Rooftop Sessions',
    genre: 'Neo-Soul Hop',
    bpm: 96,
    accent: '#F59E0B',
    glowClass: 'glow-flame',
    cover: '/src/assets/images/cover_golden_soul_1795551466591.jpg',
    summary:
      'Deep pocket electric bass, lush neo-soul voicings, and crisp rimshots made for passing the aux around the circle.',
    pocketNote: '90s vinyl warmth · Pocket rimshot',
  },
];

const HERO_INDEX_COLS = [
  { num: '01', label: 'Beat Crate', href: '#beats' },
  { num: '02', label: 'Signal Patch', href: '#patch' },
  { num: '03', label: 'Soundcheck', href: '#demo' },
  { num: '04', label: 'Live Rooms', href: '#rooms' },
];

const STACK_TOOLKIT = [
  'Web Audio WAV',
  'NTP Clock Anchor',
  'WebSocket Mesh',
  'Scrypt Room Locks',
  'MP3 & YouTube Cue',
  'Live Room Chat',
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

const HERO_TYPED_LINE = 'OUT 01 · MULTI-PHONE SOUND SYSTEM · SUB-25 MS LOCK';

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

  // Hero typewriter
  const [typedChars, setTypedChars] = useState(HERO_TYPED_LINE.length);

  // Manifesto scroll reveal + scramble stats
  const manifestoRef = useRef<HTMLElement | null>(null);
  const [manifestoVisible, setManifestoVisible] = useState(false);
  const [scrambleStats, setScrambleStats] = useState({
    beats: '6',
    drift: '<25ms',
    phones: '50',
    apps: '0',
  });

  // Featured Beat Crate Audio Preview + Expandable Dossier
  const [playingBeatKey, setPlayingBeatKey] = useState<BuiltinBeatKey | null>(null);
  const [loadingBeatKey, setLoadingBeatKey] = useState<BuiltinBeatKey | null>(null);
  const [selectedDossierKey, setSelectedDossierKey] = useState<BuiltinBeatKey | null>(null);
  const crateAudioRef = useRef<HTMLAudioElement | null>(null);

  // Interactive Multi-Device Cypher Sync Check
  const [demoRunning, setDemoRunning] = useState(false);
  const [demoSynced, setDemoSynced] = useState(true);
  const [demoStep, setDemoStep] = useState(0);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

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

  // Subtle hero typewriter effect (respects reduced motion)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setTypedChars(HERO_TYPED_LINE.length);
      return;
    }
    setTypedChars(0);
    let idx = 0;
    const timer = window.setInterval(() => {
      idx += 1;
      setTypedChars(idx);
      if (idx >= HERO_TYPED_LINE.length) {
        window.clearInterval(timer);
      }
    }, 24);
    return () => window.clearInterval(timer);
  }, []);

  // Manifesto scroll-triggered SVG doodle & digit scrambler
  useEffect(() => {
    const el = manifestoRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setManifestoVisible(true);
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!manifestoVisible) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setScrambleStats({ beats: '6', drift: '<25ms', phones: '50', apps: '0' });
      return;
    }
    let tick = 0;
    const timer = window.setInterval(() => {
      tick += 1;
      if (tick < 16) {
        setScrambleStats({
          beats: String(Math.floor(Math.random() * 9) + 1),
          drift: `${Math.floor(Math.random() * 40) + 10}ms`,
          phones: String(Math.floor(Math.random() * 45) + 12),
          apps: String(Math.floor(Math.random() * 5)),
        });
      } else {
        setScrambleStats({ beats: '6', drift: '<25ms', phones: '50', apps: '0' });
        window.clearInterval(timer);
      }
    }, 55);
    return () => window.clearInterval(timer);
  }, [manifestoVisible]);

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

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const jumpToDemo = () => {
    document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth' });
  };

  const combinedJoinError = localJoinError || joinError;
  const activeDossier = selectedDossierKey
    ? FEATURED_BEATS.find((b) => b.key === selectedDossierKey) ?? null
    : null;
  const isAudioActive = Boolean(playingBeatKey) || demoRunning;

  return (
    <div className="relative min-h-screen bg-[#06050E] text-[#F4F1EA] overflow-x-clip">
      <AmbientSoundCanvas active={isAudioActive} />

      <audio
        ref={crateAudioRef}
        loop
        onEnded={() => setPlayingBeatKey(null)}
      />

      {/* Strict 3-Zone Floating Glass Top Bar */}
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#06050E]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-8 px-6 py-4">
          <a
            href="#top"
            className="font-display text-xl font-extrabold tracking-tight text-[#F4F1EA] whitespace-nowrap shrink-0"
          >
            SyncBeats
          </a>

          <nav
            aria-label="Primary"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-[#8A8780]"
          >
            <a
              href="#beats"
              className="hover:text-[#67E8F9] transition-colors duration-150 whitespace-nowrap shrink-0"
            >
              Beat Crate
            </a>
            <a
              href="#patch"
              className="hover:text-[#67E8F9] transition-colors duration-150 whitespace-nowrap shrink-0"
            >
              Signal Patch
            </a>
            <a
              href="#demo"
              className="hover:text-[#67E8F9] transition-colors duration-150 whitespace-nowrap shrink-0"
            >
              Soundcheck
            </a>
            <a
              href="#rooms"
              className="hover:text-[#67E8F9] transition-colors duration-150 whitespace-nowrap shrink-0"
            >
              Live Rooms
            </a>
            <a
              href="#faq"
              className="hover:text-[#67E8F9] transition-colors duration-150 whitespace-nowrap shrink-0"
            >
              FAQ
            </a>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              disabled={isCreating}
              className="px-4 py-2 text-sm font-bold text-white bg-[#FF4D1C] hover:bg-[#FF6438] disabled:opacity-60 rounded-lg transition-all duration-150 hover:scale-[1.02] glow-flame whitespace-nowrap shrink-0 cursor-pointer"
            >
              Start Room
            </button>
          </div>
        </div>
      </header>

      <main id="top" className="relative z-10">
        {/* Section 1: Fused CRT Signal Monitor + Atmospheric Hero + 01-04 Editorial Index */}
        <section className="hero-gradient-stage border-b border-white/[0.08]">
          <div className="mx-auto max-w-[1280px] px-6 pt-10 pb-14 lg:pt-14 lg:pb-18">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
              <div className="lg:col-span-6 flex flex-col justify-between">
                <div>
                  <p className="font-mono text-xs text-[#67E8F9] tracking-wider mb-4 min-h-[1.5em]">
                    <span>{HERO_TYPED_LINE.slice(0, typedChars)}</span>
                    <span
                      aria-hidden="true"
                      className="inline-block w-2 h-3.5 bg-[#FF4D1C] ml-1 align-middle"
                    />
                  </p>

                  <h1
                    className="font-display font-extrabold tracking-[-0.03em] text-[#F4F1EA] leading-[1.0]"
                    style={{
                      fontSize: 'clamp(2.65rem, 4.9vw, 4.35rem)',
                      textWrap: 'balance',
                    }}
                  >
                    Link every phone.{' '}
                    <span className="text-[#67E8F9]">Drop the beat.</span>
                  </h1>

                  <p className="mt-5 text-base sm:text-lg text-[#A7A3C7] leading-relaxed max-w-[50ch]">
                    Real-time browser synchronization meets tactile beat culture. Open a session,
                    pass the QR code, route tracks into the queue, and lock every phone to the same
                    pocket.
                  </p>

                  <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setShowCreateModal(true)}
                      disabled={isCreating}
                      className="inline-flex items-center justify-center gap-2 px-6 py-3.5 text-sm font-bold text-white bg-gradient-to-r from-[#FF4D1C] to-[#8B5CF6] hover:brightness-110 disabled:opacity-60 rounded-xl transition-all duration-150 glow-flame whitespace-nowrap shrink-0 cursor-pointer"
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
                        className="flex-1 sm:w-48 px-3.5 py-3.5 text-sm font-mono uppercase tracking-wider glass-inset rounded-xl text-[#F4F1EA] placeholder:text-[#8A8780] placeholder:normal-case placeholder:tracking-normal focus:border-[#67E8F9] focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={isJoining || roomCodeInput.trim().length < 4}
                        className="px-4 py-3.5 text-sm font-semibold text-[#F4F1EA] glass hover:border-[#67E8F9]/50 disabled:opacity-40 rounded-xl transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
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

                {/* Slash-separated hardware & engine spec line (inspired by mayakhalil.com .kit) */}
                <div className="mt-10 pt-5 border-t border-white/[0.1] flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs">
                  <span className="font-mono uppercase tracking-widest text-[#FF4D1C] mr-1">
                    Engine
                  </span>
                  {STACK_TOOLKIT.map((item) => (
                    <span key={item} className="kit-slash-item text-[#A7A3C7]">
                      {item}
                    </span>
                  ))}
                </div>
              </div>

              {/* Right 6 Columns: CRT Signal Monitor Deck with Channel Switcher & Polaroids */}
              <div className="lg:col-span-6">
                <SignalMonitorDeck
                  playingBeatKey={playingBeatKey}
                  demoRunning={demoRunning}
                  onToggleBeatPreview={(k) => void toggleBeatPreview(k)}
                />
              </div>
            </div>

            {/* 01-04 Editorial Section Index Bar (inspired by mayakhalil.com .cols) */}
            <nav
              aria-label="Section index"
              className="mt-12 pt-8 border-t border-white/[0.1] grid grid-cols-2 md:grid-cols-4 gap-6"
            >
              {HERO_INDEX_COLS.map((col) => (
                <a
                  key={col.num}
                  href={col.href}
                  className="group block pr-4 focus:outline-none"
                >
                  <span className="block font-display font-extrabold text-4xl sm:text-5xl leading-none tracking-wider step-num-sweep tabular-nums">
                    {col.num}
                  </span>
                  <span className="block mt-2 font-mono text-xs uppercase tracking-[0.24em] text-[#8A8780] group-hover:text-[#FF4D1C] transition-colors">
                    {col.label}
                  </span>
                </a>
              ))}
            </nav>
          </div>
        </section>

        {/* Section 2: Kinetic Manifesto & Scrambler Telemetry (from websites-smoky-two) */}
        <section
          ref={manifestoRef}
          id="manifesto"
          className="relative border-b border-white/[0.08] py-20 lg:py-28 overflow-hidden"
        >
          <div className="mx-auto max-w-[1280px] px-6">
            <div className="max-w-4xl mx-auto">
              <div
                className={`inline-block font-mono text-sm sm:text-base text-[#8A8780] tracking-wider transform transition-all duration-700 ${
                  manifestoVisible
                    ? 'translate-y-0 opacity-100 -rotate-2'
                    : '-translate-y-6 opacity-0 rotate-0'
                }`}
              >
                we turn every device into
              </div>

              <div className="relative my-3 inline-block max-w-full">
                <h2
                  className={`font-display font-extrabold text-[13vw] sm:text-7xl lg:text-[7rem] text-[#F4F1EA] tracking-tight leading-none transform transition-all duration-700 ${
                    manifestoVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
                  }`}
                >
                  ONE CYPHER
                </h2>

                <svg
                  aria-hidden="true"
                  className="pointer-events-none absolute -inset-x-4 -inset-y-3 w-[108%] h-[122%] text-[#67E8F9]"
                  viewBox="0 0 640 160"
                  fill="none"
                >
                  <path
                    d="M 22 82 C 16 24, 210 12, 470 18 C 600 24, 628 72, 588 122 C 535 156, 260 152, 62 138 C 12 134, 16 56, 152 38 C 280 20, 520 28, 596 68"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeDasharray="1900"
                    strokeDashoffset={manifestoVisible ? '0' : '1900'}
                    style={{ transition: 'stroke-dashoffset 1.6s ease-out' }}
                    strokeLinecap="round"
                  />
                </svg>
              </div>

              <div className="flex flex-wrap items-center gap-6 sm:gap-10 mt-8">
                <div className="relative inline-block transform -rotate-2">
                  <span className="font-display font-extrabold text-3xl sm:text-5xl text-[#5DCAA5]">
                    DROP
                  </span>
                  <svg
                    aria-hidden="true"
                    className="absolute -bottom-2.5 left-0 w-full h-3 text-[#5DCAA5]"
                    viewBox="0 0 140 14"
                    fill="none"
                  >
                    <path
                      d="M2 9 Q 24 2, 46 9 T 92 9 T 138 9"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>

                <div className="relative inline-block transform rotate-1">
                  <span className="font-display font-extrabold text-3xl sm:text-5xl text-[#67E8F9]">
                    SYNC
                  </span>
                  <svg
                    aria-hidden="true"
                    className="absolute -bottom-2.5 left-0 w-full h-3 text-[#67E8F9]"
                    viewBox="0 0 140 14"
                    fill="none"
                  >
                    <path
                      d="M2 7 Q 35 13, 70 6 T 138 8"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>

                <div className="relative inline-block transform -rotate-1">
                  <span className="font-display font-extrabold text-3xl sm:text-5xl text-[#FF4D1C]">
                    LOCK
                  </span>
                  <svg
                    aria-hidden="true"
                    className="absolute -bottom-2.5 left-0 w-full h-3 text-[#FF4D1C]"
                    viewBox="0 0 140 14"
                    fill="none"
                  >
                    <path
                      d="M2 8 C 35 2, 105 14, 138 6"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
              </div>

              <div className="mt-14 grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="glass rounded-2xl p-5">
                  <div className="font-mono text-2xl sm:text-3xl font-bold text-[#67E8F9] tabular-nums">
                    {scrambleStats.beats}
                  </div>
                  <div className="mt-1 text-xs text-[#A7A3C7]">Built-in Hip-Hop cuts</div>
                </div>
                <div className="glass rounded-2xl p-5">
                  <div className="font-mono text-2xl sm:text-3xl font-bold text-[#5DCAA5] tabular-nums">
                    {scrambleStats.drift}
                  </div>
                  <div className="mt-1 text-xs text-[#A7A3C7]">Clock-lock accuracy</div>
                </div>
                <div className="glass rounded-2xl p-5">
                  <div className="font-mono text-2xl sm:text-3xl font-bold text-[#F4F1EA] tabular-nums">
                    {scrambleStats.phones}
                  </div>
                  <div className="mt-1 text-xs text-[#A7A3C7]">Max synced devices / room</div>
                </div>
                <div className="glass rounded-2xl p-5">
                  <div className="font-mono text-2xl sm:text-3xl font-bold text-[#FF4D1C] tabular-nums">
                    {scrambleStats.apps}
                  </div>
                  <div className="mt-1 text-xs text-[#A7A3C7]">App downloads required</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 3: Interactive Beat Crate + Expandable Beat Dossier */}
        <section id="beats" className="relative border-b border-white/[0.08] py-20 lg:py-24">
          <div className="mx-auto max-w-[1280px] px-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10 pb-6 border-b border-white/15">
              <div>
                <p className="font-mono text-xs sm:text-sm text-[#67E8F9] uppercase tracking-wider mb-1.5">
                  01 · Built-In Beat Crate
                </p>
                <h2
                  className="font-display text-2xl sm:text-4xl font-extrabold tracking-tight text-[#F4F1EA]"
                  style={{ textWrap: 'balance' }}
                >
                  Tap any cut to audition—or open its beat dossier
                </h2>
              </div>

              {activeDossier ? (
                <button
                  type="button"
                  onClick={() => setSelectedDossierKey(null)}
                  className="inline-flex items-center gap-2 font-mono text-xs font-bold text-[#67E8F9] hover:text-white cursor-pointer whitespace-nowrap shrink-0"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>All 6 Beats</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowCreateModal(true)}
                  className="px-5 py-2.5 text-xs font-bold text-[#F4F1EA] glass hover:border-[#67E8F9]/50 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Spin Crate in a Room
                </button>
              )}
            </div>

            {activeDossier ? (
              <div
                className={`glass ${activeDossier.glowClass} rounded-3xl p-6 sm:p-10 relative overflow-hidden`}
                style={{ borderColor: `${activeDossier.accent}55` }}
              >
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                  <div className="lg:col-span-5">
                    <div className="relative aspect-square max-w-[320px] mx-auto rounded-2xl overflow-hidden border border-white/15 bg-[#0B0A16] shadow-2xl">
                      <img
                        src={activeDossier.cover}
                        alt={`${activeDossier.title} cover art`}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => void toggleBeatPreview(activeDossier.key)}
                        aria-label={
                          playingBeatKey === activeDossier.key
                            ? `Pause ${activeDossier.title}`
                            : `Play ${activeDossier.title}`
                        }
                        className="absolute inset-0 flex items-center justify-center bg-black/35 hover:bg-black/50 transition-colors cursor-pointer"
                      >
                        <span
                          className="w-16 h-16 rounded-full flex items-center justify-center text-white shadow-xl transition-transform hover:scale-105"
                          style={{ backgroundColor: activeDossier.accent }}
                        >
                          {loadingBeatKey === activeDossier.key ? (
                            <RefreshCw className="w-6 h-6 animate-spin" />
                          ) : playingBeatKey === activeDossier.key ? (
                            <Pause className="w-6 h-6" />
                          ) : (
                            <Play className="w-6 h-6 ml-0.5" />
                          )}
                        </span>
                      </button>
                    </div>
                  </div>

                  <div className="lg:col-span-7">
                    <div className="flex flex-wrap items-center gap-2.5 text-xs font-mono text-[#A7A3C7] mb-3">
                      <span style={{ color: activeDossier.accent }}>{activeDossier.genre}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{activeDossier.bpm} BPM</span>
                      <span aria-hidden="true">·</span>
                      <span>{activeDossier.producer}</span>
                    </div>

                    <h3 className="font-display text-3xl sm:text-5xl font-extrabold text-[#F4F1EA] tracking-tight">
                      {activeDossier.title}
                    </h3>

                    <p className="mt-4 text-base text-[#F4F1EA]/85 leading-relaxed max-w-[55ch]">
                      {activeDossier.summary}
                    </p>

                    <div className="mt-6 glass-inset rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <div className="text-[11px] font-mono text-[#8A8780]">Groove Spec</div>
                        <div className="text-sm font-medium text-[#F4F1EA] mt-0.5">
                          {activeDossier.pocketNote}
                        </div>
                      </div>
                      <Disc3
                        className={`w-6 h-6 ${
                          playingBeatKey === activeDossier.key ? 'animate-spin' : ''
                        }`}
                        style={{ color: activeDossier.accent }}
                      />
                    </div>

                    <div className="mt-7 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => void toggleBeatPreview(activeDossier.key)}
                        className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-bold text-white transition-transform hover:scale-[1.02] cursor-pointer"
                        style={{ backgroundColor: activeDossier.accent }}
                      >
                        {playingBeatKey === activeDossier.key ? (
                          <>
                            <Pause className="w-4 h-4" />
                            <span>Pause Preview</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4" />
                            <span>Audition Beat</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowCreateModal(true)}
                        className="px-5 py-3 rounded-xl text-xs font-bold text-[#F4F1EA] glass hover:border-[#67E8F9]/60 transition-colors cursor-pointer"
                      >
                        Drop Room with This Crate
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {FEATURED_BEATS.map((beat) => {
                  const isPlaying = playingBeatKey === beat.key;
                  const isLoading = loadingBeatKey === beat.key;

                  return (
                    <article
                      key={beat.key}
                      className={`glass rounded-2xl p-4 flex flex-col justify-between gap-4 transition-transform duration-200 hover:-translate-y-0.5 ${
                        isPlaying ? beat.glowClass : ''
                      }`}
                      style={{
                        borderColor: isPlaying ? beat.accent : undefined,
                      }}
                    >
                      <div className="flex items-center gap-4">
                        <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-white/15 bg-[#0B0A16] shrink-0">
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
                              className="w-10 h-10 rounded-full flex items-center justify-center transition-colors"
                              style={{
                                backgroundColor: isPlaying ? beat.accent : '#FFFFFF',
                                color: isPlaying ? '#FFFFFF' : '#0B0A16',
                              }}
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
                          <div className="flex items-center justify-between gap-2 text-xs text-[#A7A3C7]">
                            <span className="truncate">{beat.genre}</span>
                            <span
                              className="font-mono tabular-nums shrink-0 font-semibold"
                              style={{ color: beat.accent }}
                            >
                              {beat.bpm} BPM
                            </span>
                          </div>
                          <h3 className="font-display text-lg font-bold text-[#F4F1EA] truncate mt-0.5">
                            {beat.title}
                          </h3>
                          <p className="text-xs text-[#8A8780] truncate mt-0.5">{beat.producer}</p>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-white/[0.08] flex items-center justify-between text-xs">
                        <span className="text-[#A7A3C7] truncate">{beat.pocketNote}</span>
                        <button
                          type="button"
                          onClick={() => setSelectedDossierKey(beat.key)}
                          className="font-mono font-semibold text-[#67E8F9] hover:text-white transition-colors shrink-0 ml-2 cursor-pointer"
                        >
                          Inspect →
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Section 4: TouchDesigner-Style Interactive Signal Patch Network */}
        <SignalPatchLab
          onJumpToDemo={jumpToDemo}
          onStartRoom={() => setShowCreateModal(true)}
        />

        {/* Section 5: Tactile Pocket Soundcheck Console (3-Phone 808 Soundcheck) */}
        <section id="demo" className="relative border-b border-white/[0.08] py-20 lg:py-24">
          <div className="mx-auto max-w-[1280px] px-6">
            <div className="glass glow-cyan rounded-3xl p-6 sm:p-10 relative">
              <div aria-hidden="true" className="hidden sm:flex justify-between mb-6 opacity-35">
                <span className="w-2.5 h-2.5 rounded-full border border-white/40 bg-white/10" />
                <span className="w-2.5 h-2.5 rounded-full border border-white/40 bg-white/10" />
              </div>

              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-9">
                <div>
                  <p className="font-mono text-xs sm:text-sm text-[#67E8F9] uppercase tracking-wider mb-1.5">
                    03 · Pocket Soundcheck Console
                  </p>
                  <h2
                    className="font-display text-2xl sm:text-4xl font-extrabold tracking-tight text-[#F4F1EA]"
                    style={{ textWrap: 'balance' }}
                  >
                    Hear echo drift snap into one 808 pocket
                  </h2>
                  <p className="mt-2 text-sm sm:text-base text-[#A7A3C7] max-w-[58ch]">
                    Trigger a live three-device 808 and snare pattern right in your browser. Flip
                    between Clock-Locked and Echo Drift to hear why server time alignment matters.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 shrink-0">
                  <div
                    role="group"
                    aria-label="Synchronization mode"
                    className="flex items-center gap-1 p-1 glass-inset rounded-xl"
                  >
                    <button
                      type="button"
                      onClick={() => handleSetDemoMode(true)}
                      className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors duration-150 whitespace-nowrap cursor-pointer ${
                        demoSynced
                          ? 'bg-[#67E8F9] text-[#0B0A16]'
                          : 'text-[#A7A3C7] hover:text-white'
                      }`}
                    >
                      Clock-Locked
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetDemoMode(false)}
                      className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors duration-150 whitespace-nowrap cursor-pointer ${
                        !demoSynced
                          ? 'bg-rose-500/80 text-white'
                          : 'text-[#A7A3C7] hover:text-white'
                      }`}
                    >
                      Echo Drift
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={toggleDemoAudio}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-[#FF4D1C] hover:bg-[#FF6438] rounded-xl transition-colors duration-150 glow-flame whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {demoRunning ? (
                      <>
                        <Pause className="w-4 h-4" />
                        <span>Stop Groove</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        <span>Test 3-Phone 808</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="glass-inset rounded-2xl divide-y divide-white/[0.08]">
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
                      className="grid grid-cols-1 md:grid-cols-12 items-center gap-4 px-5 sm:px-6 py-5"
                    >
                      <div className="md:col-span-4 flex items-center gap-3.5 min-w-0">
                        <div className="w-10 h-10 rounded-xl glass-chip flex items-center justify-center shrink-0">
                          <Icon className="w-5 h-5 text-[#F4F1EA]" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-[#F4F1EA] truncate">
                            {device.name}
                          </div>
                          <div className="text-xs text-[#8A8780]">{device.network}</div>
                        </div>
                      </div>

                      <div className="md:col-span-5">
                        <div className="relative h-8 rounded-lg bg-[#06050E]/85 border border-white/[0.08] overflow-hidden flex items-center px-3">
                          <div className="w-full h-1.5 bg-white/10 rounded-full relative overflow-hidden">
                            <div
                              className={`absolute top-0 bottom-0 w-16 rounded-full transition-transform duration-150 ${
                                demoSynced ? 'bg-[#67E8F9]' : 'bg-rose-400/85'
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
                        <span className="font-mono text-[#F4F1EA] tabular-nums">
                          +{offset.toFixed(1)} ms
                        </span>
                        <span
                          className={
                            demoSynced
                              ? 'text-[#67E8F9] font-semibold'
                              : offset === 0
                                ? 'text-[#8A8780]'
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
          </div>
        </section>

        {/* Section 6: "The Next Speaker Is Yours" Tilted Card Stack + Live Public Rooms */}
        <section id="rooms" className="relative border-b border-white/[0.08] py-24">
          <div className="mx-auto max-w-[1280px] px-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
              <div className="lg:col-span-5 flex flex-col items-center">
                <p className="font-mono text-xs text-[#67E8F9] uppercase font-bold tracking-widest mb-6">
                  The Next Speaker Is Yours
                </p>

                <div className="w-full max-w-[300px] space-y-3.5 transform -rotate-3 hover:rotate-0 transition-transform duration-500">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(true)}
                    className="w-full p-4 rounded-2xl glass glow-cyan border-dashed border-[#67E8F9]/60 text-center cursor-pointer hover:brightness-110 transition-all"
                  >
                    <span className="font-display font-extrabold text-2xl text-[#67E8F9]">YOU</span>
                    <div className="font-mono text-[10px] text-[#F4F1EA]/90 uppercase font-bold mt-0.5">
                      Tap to claim host deck
                    </div>
                  </button>

                  <div className="p-3.5 rounded-2xl glass glow-violet text-[#F4F1EA] font-display font-bold text-base flex items-center justify-between">
                    <span>Aux Host</span>
                    <span className="font-mono text-[11px] text-[#A7A3C7]">MAC / SAFARI</span>
                  </div>

                  <div className="p-3.5 rounded-2xl glass glow-flame text-[#F4F1EA] font-display font-bold text-base flex items-center justify-between">
                    <span>Pocket 5G</span>
                    <span className="font-mono text-[11px] text-[#FF6438]">IPHONE / IOS</span>
                  </div>

                  <div className="p-3.5 rounded-2xl glass text-[#F4F1EA] font-display font-bold text-base flex items-center justify-between">
                    <span>Speaker Wall</span>
                    <span className="font-mono text-[11px] text-[#5DCAA5]">SUB-25 MS</span>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-7">
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6 pb-4 border-b border-white/15">
                  <div>
                    <p className="font-mono text-xs text-[#FF4D1C] uppercase tracking-wider mb-1">
                      04 · Live Sessions
                    </p>
                    <h2 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[#F4F1EA]">
                      Jump into a live public room
                    </h2>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => void fetchPublicRooms()}
                      disabled={loadingRooms}
                      className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-[#F4F1EA] glass hover:border-[#67E8F9]/40 rounded-xl transition-colors cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingRooms ? 'animate-spin' : ''}`} />
                      <span>Refresh</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCreateModal(true)}
                      className="px-4 py-2 text-xs font-bold text-white bg-[#FF4D1C] hover:bg-[#FF6438] rounded-xl transition-colors cursor-pointer"
                    >
                      New Room
                    </button>
                  </div>
                </div>

                {loadingRooms && publicRooms.length === 0 ? (
                  <div className="glass rounded-2xl p-8 text-center text-sm text-[#A7A3C7]">
                    Checking active rooms...
                  </div>
                ) : publicRooms.length === 0 ? (
                  <div className="glass rounded-2xl p-7 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <p className="text-base font-semibold text-[#F4F1EA]">
                        No public rooms live yet
                      </p>
                      <p className="text-sm text-[#A7A3C7] mt-1">
                        Spin up the first room—keep it open or lock it with a password for your
                        crew.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCreateModal(true)}
                      className="px-5 py-2.5 text-sm font-bold text-white bg-[#FF4D1C] hover:bg-[#FF6438] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Start First Room
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {publicRooms.map((room) => (
                      <article
                        key={room.roomId}
                        className="glass rounded-2xl p-5 flex flex-col justify-between gap-4 hover:border-[#67E8F9]/40 transition-colors"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 text-xs text-[#A7A3C7] mb-2">
                            <span className="font-mono text-[#67E8F9] font-semibold">
                              {room.roomId}
                            </span>
                            <span>
                              {room.hasPassword ? 'Locked' : 'Open'} ·{' '}
                              {room.controlMode === 'host_only' ? 'Host Aux' : 'Open Aux'}
                            </span>
                          </div>
                          <h3 className="font-display text-lg font-bold text-[#F4F1EA] truncate">
                            {room.roomName}
                          </h3>
                          <p className="mt-1 text-sm text-[#A7A3C7] truncate">
                            {room.isPlaying
                              ? `Spinning: ${room.currentTrackTitle}`
                              : `Up next: ${room.currentTrackTitle}`}
                          </p>
                        </div>

                        <div className="pt-3.5 border-t border-white/[0.08] flex items-center justify-between gap-3">
                          <span className="text-xs font-mono text-[#A7A3C7] tabular-nums">
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

                <div className="mt-5 flex items-center gap-2 text-xs text-[#A7A3C7]">
                  <Volume2 className="w-4 h-4 text-[#67E8F9]" />
                  <span>Every connected speaker keeps its own physical volume slider.</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 7: FAQ */}
        <section id="faq" className="relative py-20 lg:py-24">
          <div className="mx-auto max-w-[1280px] px-6">
            <h2 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[#F4F1EA] mb-8">
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
                      <span className="text-base font-medium text-[#F4F1EA] group-hover:text-[#67E8F9] transition-colors">
                        {item.q}
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 text-[#8A8780] shrink-0 transition-transform duration-150 ${
                          isOpen ? 'rotate-180 text-[#67E8F9]' : ''
                        }`}
                      />
                    </button>
                    {isOpen && (
                      <p className="pb-5 text-sm sm:text-base text-[#A7A3C7] leading-relaxed max-w-[70ch]">
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

      {/* Giant Extruded Wordmark Footer */}
      <footer className="relative z-10 mt-10 pt-16 pb-12 border-t border-white/10 bg-[#06050E]/90 backdrop-blur-md">
        <div className="mx-auto max-w-[1280px] px-6">
          <div className="flex justify-center -mt-22 mb-10">
            <button
              type="button"
              onClick={scrollToTop}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full glass glow-cyan text-[#F4F1EA] font-mono text-xs font-bold uppercase tracking-wider transition-transform hover:scale-105 cursor-pointer"
            >
              <ArrowUp className="w-3.5 h-3.5 text-[#67E8F9]" />
              <span>Back to top</span>
            </button>
          </div>

          <div className="w-full flex items-center justify-center my-6 overflow-hidden select-none">
            <span className="font-display font-extrabold text-[15vw] sm:text-8xl md:text-9xl lg:text-[9.5rem] tracking-tight leading-none wordmark-extrusion">
              Sync<span className="text-[#67E8F9]">Beats</span>
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-8 border-t border-white/10 text-xs text-[#8A8780]">
            <div className="flex items-center gap-3">
              <span className="font-display text-sm font-bold text-[#F4F1EA]">SyncBeats</span>
              <span aria-hidden="true">·</span>
              <span>Clan Edition · Multi-device sound system</span>
            </div>
            <div className="flex items-center gap-6">
              <a href="#beats" className="hover:text-[#67E8F9] transition-colors">
                Beat Crate
              </a>
              <a href="#patch" className="hover:text-[#67E8F9] transition-colors">
                Signal Patch
              </a>
              <a href="#demo" className="hover:text-[#67E8F9] transition-colors">
                Soundcheck
              </a>
              <a href="#rooms" className="hover:text-[#67E8F9] transition-colors">
                Live Rooms
              </a>
              <span>© 2026 SyncBeats</span>
            </div>
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
          <div className="w-full max-w-md rounded-2xl glass glow-violet p-6 sm:p-7">
            <div className="flex items-center justify-between mb-5">
              <h2 id="create-room-title" className="font-display text-xl font-bold text-[#F4F1EA]">
                Start a Listening Session
              </h2>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                aria-label="Close modal"
                className="p-2 text-[#A7A3C7] hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={(e) => void handleCreateSubmit(e)} className="space-y-4">
              <div>
                <label htmlFor="room-name" className="block text-xs font-medium text-[#F4F1EA] mb-1.5">
                  Session Name
                </label>
                <input
                  id="room-name"
                  type="text"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  maxLength={48}
                  placeholder="e.g. Late Night 808 Cypher"
                  className="w-full px-3.5 py-2.5 text-sm glass-inset rounded-xl text-[#F4F1EA] placeholder:text-[#8A8780] focus:border-[#67E8F9] focus:outline-none"
                />
              </div>

              <div>
                <span className="block text-xs font-medium text-[#F4F1EA] mb-1.5">Room Access</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setVisibility('public')}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 text-xs font-semibold rounded-xl border transition-colors cursor-pointer ${
                      visibility === 'public'
                        ? 'bg-[#67E8F9]/15 border-[#67E8F9] text-[#67E8F9]'
                        : 'glass-inset text-[#A7A3C7] hover:text-white'
                    }`}
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>Public</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setVisibility('private')}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 text-xs font-semibold rounded-xl border transition-colors cursor-pointer ${
                      visibility === 'private'
                        ? 'bg-[#67E8F9]/15 border-[#67E8F9] text-[#67E8F9]'
                        : 'glass-inset text-[#A7A3C7] hover:text-white'
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
                    className="block text-xs font-medium text-[#F4F1EA] mb-1.5"
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
                    className="w-full px-3.5 py-2.5 text-sm font-mono glass-inset rounded-xl text-[#F4F1EA] focus:border-[#67E8F9] focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="room-password"
                    className="block text-xs font-medium text-[#F4F1EA] mb-1.5"
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
                    className="w-full px-3.5 py-2.5 text-sm glass-inset rounded-xl text-[#F4F1EA] placeholder:text-[#8A8780] focus:border-[#67E8F9] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <span className="block text-xs font-medium text-[#F4F1EA] mb-1.5">Aux Controls</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setControlMode('collaborative')}
                    className={`py-2.5 px-3 text-xs font-semibold rounded-xl border transition-colors cursor-pointer ${
                      controlMode === 'collaborative'
                        ? 'bg-[#FF4D1C]/15 border-[#FF4D1C] text-[#FF6438]'
                        : 'glass-inset text-[#A7A3C7] hover:text-white'
                    }`}
                  >
                    Open Aux (All)
                  </button>
                  <button
                    type="button"
                    onClick={() => setControlMode('host_only')}
                    className={`py-2.5 px-3 text-xs font-semibold rounded-xl border transition-colors cursor-pointer ${
                      controlMode === 'host_only'
                        ? 'bg-[#FF4D1C]/15 border-[#FF4D1C] text-[#FF6438]'
                        : 'glass-inset text-[#A7A3C7] hover:text-white'
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
                  className="px-4 py-2.5 text-xs font-medium text-[#A7A3C7] hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-5 py-2.5 text-sm font-bold text-white bg-[#FF4D1C] hover:bg-[#FF6438] disabled:opacity-60 rounded-xl transition-colors cursor-pointer"
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
          <div className="w-full max-w-sm rounded-2xl glass glow-cyan p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 id="password-room-title" className="font-display text-lg font-bold text-[#F4F1EA]">
                Enter Room Password
              </h2>
              <button
                type="button"
                onClick={() => setPasswordPromptRoomId(null)}
                aria-label="Close password modal"
                className="p-2 text-[#A7A3C7] hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[#A7A3C7] mb-4">
              Room <span className="font-mono text-[#67E8F9]">{passwordPromptRoomId}</span> requires
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
                className="w-full px-3.5 py-2.5 text-sm glass-inset rounded-xl text-[#F4F1EA] placeholder:text-[#8A8780] focus:border-[#67E8F9] focus:outline-none"
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
                  className="px-4 py-2 text-xs text-[#A7A3C7] hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={verifyingPassword || !passwordAttempt}
                  className="px-4 py-2 text-xs font-bold text-white bg-[#FF4D1C] hover:bg-[#FF6438] disabled:opacity-50 rounded-xl cursor-pointer"
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
