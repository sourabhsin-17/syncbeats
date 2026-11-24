import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, Radio } from 'lucide-react';
import type { BuiltinBeatKey } from '../../shared/types';

interface SignalMonitorDeckProps {
  playingBeatKey: BuiltinBeatKey | null;
  demoRunning: boolean;
  onToggleBeatPreview: (key: BuiltinBeatKey) => void;
}

const CHANNELS = [
  { id: 'cypher', code: 'OUT 01', label: 'CYPHER ROOM' },
  { id: 'scope', code: 'OUT 02', label: 'LIVE SCOPE' },
  { id: 'radar', code: 'OUT 03', label: 'CLOCK RADAR' },
] as const;

export function SignalMonitorDeck({
  playingBeatKey,
  demoRunning,
  onToggleBeatPreview,
}: SignalMonitorDeckProps) {
  const [channelIndex, setChannelIndex] = useState(0);
  const [wipeTick, setWipeTick] = useState(0);
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [coords, setCoords] = useState({ tx: 0, ty: 0, fps: 60 });

  const scopeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const radarCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const activeChannel = CHANNELS[channelIndex];
  const isAudioHot = Boolean(playingBeatKey) || demoRunning;

  const stepChannel = (delta: number) => {
    setChannelIndex((prev) => (prev + delta + CHANNELS.length) % CHANNELS.length);
    setWipeTick((t) => t + 1);
  };

  // Pointer telemetry readout (tx / ty) inspired by creative tech OSDs
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const nx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    const ny = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    setCoords((prev) => ({
      ...prev,
      tx: Number(nx.toFixed(3)),
      ty: Number(ny.toFixed(3)),
    }));
  };

  // Real-time Oscilloscope Canvas (Channel 2)
  useEffect(() => {
    if (activeChannel.id !== 'scope') return;
    const canvas = scopeCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let rafId = 0;
    let phase = 0;

    const render = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(200, Math.floor(rect.width));
      const h = Math.max(160, Math.floor(rect.height));
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      ctx.fillStyle = '#06050E';
      ctx.fillRect(0, 0, w, h);

      // Graticule grid
      ctx.strokeStyle = 'rgba(244, 241, 234, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= w; x += w / 8) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let y = 0; y <= h; y += h / 6) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();

      // Harmonic 808 + hi-hat dual trace
      const amp = isAudioHot ? h * 0.24 : h * 0.11;
      const freqShift = 1 + Math.abs(coords.tx) * 1.4;

      ctx.strokeStyle = '#67E8F9';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 3) {
        const t = (x / w) * Math.PI * 4 * freqShift + phase;
        const sub = Math.sin(t) * amp;
        const transient = Math.sin(t * 3.5 + phase * 1.8) * (isAudioHot ? amp * 0.38 : amp * 0.15);
        const y = h * 0.48 + sub + transient;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.strokeStyle = '#FF4D1C';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 3) {
        const t = (x / w) * Math.PI * 6 + phase * 1.4;
        const y = h * 0.48 + Math.cos(t) * (amp * 0.65);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      if (!reducedMotion) {
        phase += isAudioHot ? 0.11 : 0.035;
        rafId = window.requestAnimationFrame(render);
      }
    };

    render();
    return () => window.cancelAnimationFrame(rafId);
  }, [activeChannel.id, isAudioHot, coords.tx]);

  // Real-time Clock Lock Radar Canvas (Channel 3)
  useEffect(() => {
    if (activeChannel.id !== 'radar') return;
    const canvas = radarCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let rafId = 0;
    let tick = 0;

    const render = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(200, Math.floor(rect.width));
      const h = Math.max(160, Math.floor(rect.height));
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      ctx.fillStyle = '#06050E';
      ctx.fillRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h * 0.46;
      const maxR = Math.min(w, h) * 0.34;

      // Concentric latency rings
      [0.35, 0.68, 1].forEach((ratio) => {
        ctx.strokeStyle = 'rgba(244, 241, 234, 0.14)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, maxR * ratio, 0, Math.PI * 2);
        ctx.stroke();
      });

      // Expanding anchor sync pulse
      const pulseR = ((tick * 1.8) % maxR);
      ctx.strokeStyle = `rgba(103, 232, 249, ${Math.max(0.08, 1 - pulseR / maxR)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, pulseR, 0, Math.PI * 2);
      ctx.stroke();

      // Center server clock node + 3 satellite speaker nodes
      ctx.fillStyle = '#FF4D1C';
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fill();

      const nodes = [
        { angle: -0.7, dist: 0.65, label: 'MAC HOST +0ms' },
        { angle: 1.5, dist: 0.72, label: 'IPHONE 5G +7ms' },
        { angle: 3.3, dist: 0.78, label: 'ANDROID +11ms' },
      ];

      ctx.font = '10px "JetBrains Mono", monospace';
      nodes.forEach((n, i) => {
        const a = n.angle + tick * 0.008;
        const nx = cx + Math.cos(a) * maxR * n.dist;
        const ny = cy + Math.sin(a) * maxR * n.dist;

        ctx.strokeStyle = 'rgba(139, 92, 246, 0.5)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(nx, ny);
        ctx.stroke();

        ctx.fillStyle = i === 0 ? '#67E8F9' : '#5DCAA5';
        ctx.beginPath();
        ctx.arc(nx, ny, 4.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#F4F1EA';
        ctx.fillText(n.label, nx + 8, ny + 3);
      });

      if (!reducedMotion) {
        tick += isAudioHot ? 1.5 : 0.8;
        rafId = window.requestAnimationFrame(render);
      }
    };

    render();
    return () => window.cancelAnimationFrame(rafId);
  }, [activeChannel.id, isAudioHot]);

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      className="relative h-full min-h-[380px] lg:min-h-[490px] rounded-2xl overflow-hidden glass glow-violet flex flex-col"
    >
      {/* Top Broadcast OSD Header (inspired by mayakhalil.com channel bar) */}
      <div className="relative z-20 flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 bg-[#06050E]/85 font-mono text-[11px] uppercase tracking-wider text-[#F4F1EA]">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-[#FF4D1C] font-bold shrink-0">{activeChannel.code}</span>
          <span className="text-[#8A8780]" aria-hidden="true">/</span>
          <span className="truncate">{activeChannel.label}</span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden sm:inline text-[#8A8780] tabular-nums">
            tx {coords.tx.toFixed(2)} ty {coords.ty.toFixed(2)}
          </span>
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={() => stepChannel(-1)}
              aria-label="Previous monitor signal"
              className="w-7 h-7 border border-white/20 hover:border-[#67E8F9] flex items-center justify-center text-[#F4F1EA] hover:text-[#67E8F9] transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => stepChannel(1)}
              aria-label="Next monitor signal"
              className="w-7 h-7 border border-white/20 hover:border-[#67E8F9] flex items-center justify-center text-[#F4F1EA] hover:text-[#67E8F9] transition-colors cursor-pointer"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main CRT Viewport */}
      <div className="relative flex-1 overflow-hidden bg-[#06050E]">
        {activeChannel.id === 'cypher' && (
          <>
            {!heroImgFailed ? (
              <img
                src="/src/assets/images/hero_pokemon_cypher_1795552578820.jpg"
                alt="Pikachu, Charmander, Gengar, Bulbasaur, Squirtle, and Snorlax sitting together in a late-night music studio syncing smartphones and speakers"
                referrerPolicy="no-referrer"
                onError={() => setHeroImgFailed(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-gradient-to-br from-[#131126] via-[#06050E] to-[#2B123C] text-center">
                <Radio className="w-10 h-10 text-[#67E8F9] mb-3" />
                <p className="font-display text-lg font-bold text-[#F4F1EA]">
                  Late-Night Cypher Session
                </p>
              </div>
            )}
          </>
        )}

        {activeChannel.id === 'scope' && (
          <canvas
            ref={scopeCanvasRef}
            aria-label="Live dual-trace audio oscilloscope"
            className="w-full h-full block"
          />
        )}

        {activeChannel.id === 'radar' && (
          <canvas
            ref={radarCanvasRef}
            aria-label="Server clock synchronization radar"
            className="w-full h-full block"
          />
        )}

        {/* CRT Scanlines + Bottom Gradient Scrim + Wipe Sweep */}
        <div className="pointer-events-none absolute inset-0 crt-scanlines opacity-55" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#06050E]/92 via-transparent to-transparent" />
        {wipeTick > 0 && (
          <div
            key={wipeTick}
            aria-hidden="true"
            className="pointer-events-none absolute left-0 right-0 top-0 h-[2px] bg-[#FF4D1C] shadow-[0_0_16px_#FF4D1C] crt-wipe-line z-20"
          />
        )}

        {/* Playful Polaroid Instant-Preview Snapshots (from websites-smoky-two) */}
        <div className="relative sm:absolute sm:bottom-4 sm:left-4 sm:right-4 z-10 p-4 sm:p-0 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onToggleBeatPreview('afterhours')}
              aria-label={
                playingBeatKey === 'afterhours'
                  ? 'Pause 808 Afterhours'
                  : 'Play 808 Afterhours preview'
              }
              className="group w-24 p-1.5 pb-2.5 bg-[#F4F0E6] text-[#0B0A16] rounded-md shadow-xl transform -rotate-3 hover:rotate-0 transition-transform duration-200 text-left cursor-pointer"
            >
              <div className="relative aspect-square w-full overflow-hidden rounded-sm bg-[#131126]">
                <img
                  src="/src/assets/images/cover_808_afterhours_1795418328427.jpg"
                  alt="808 Afterhours"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                <span className="absolute inset-0 flex items-center justify-center bg-black/35 group-hover:bg-black/50 transition-colors">
                  {playingBeatKey === 'afterhours' ? (
                    <Pause className="w-4 h-4 text-[#67E8F9]" />
                  ) : (
                    <Play className="w-4 h-4 text-white ml-0.5" />
                  )}
                </span>
              </div>
              <p className="mt-1.5 font-mono text-[10px] font-bold tracking-tight truncate">
                808 Afterhours
              </p>
            </button>

            <button
              type="button"
              onClick={() => onToggleBeatPreview('boombap')}
              aria-label={
                playingBeatKey === 'boombap'
                  ? 'Pause 94 Boom Bap'
                  : 'Play 94 Boom Bap preview'
              }
              className="hidden sm:block group w-24 p-1.5 pb-2.5 bg-[#F4F0E6] text-[#0B0A16] rounded-md shadow-xl transform rotate-3 hover:rotate-0 transition-transform duration-200 text-left cursor-pointer"
            >
              <div className="relative aspect-square w-full overflow-hidden rounded-sm bg-[#131126]">
                <img
                  src="/src/assets/images/cover_boom_bap_1795418328317.jpg"
                  alt="94 Boom Bap"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                <span className="absolute inset-0 flex items-center justify-center bg-black/35 group-hover:bg-black/50 transition-colors">
                  {playingBeatKey === 'boombap' ? (
                    <Pause className="w-4 h-4 text-[#67E8F9]" />
                  ) : (
                    <Play className="w-4 h-4 text-white ml-0.5" />
                  )}
                </span>
              </div>
              <p className="mt-1.5 font-mono text-[10px] font-bold tracking-tight truncate">
                94 Boom Bap
              </p>
            </button>
          </div>

          <div className="text-left sm:text-right text-xs text-[#F4F1EA]">
            <div className="font-mono text-[11px] uppercase tracking-wider text-[#67E8F9]">
              {isAudioHot ? 'Signal Active · Live Audio' : 'Flip OUT 01–03 · Tap Photo'}
            </div>
            <div className="text-[#A7A3C7] mt-0.5">60 fps · Sub-25 ms clock lock</div>
          </div>
        </div>
      </div>
    </div>
  );
}
