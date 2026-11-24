import { useState } from 'react';
import { Play, Zap } from 'lucide-react';

interface PatchNode {
  id: 'clock' | 'broker' | 'crate' | 'speakers';
  code: string;
  title: string;
  subtitle: string;
  accent: string;
  detail: string;
  spec: string;
  x: number;
  y: number;
}

const PATCH_NODES: PatchNode[] = [
  {
    id: 'clock',
    code: 'NODE 01',
    title: 'Server Anchor Clock',
    subtitle: '+260 ms future drop time',
    accent: '#FF4D1C',
    detail:
      'Every play, pause, or seek schedules a shared future server timestamp so all phones begin decoding before the beat drops.',
    spec: 'Authoritative UTC anchor · Drift guard',
    x: 9,
    y: 26,
  },
  {
    id: 'broker',
    code: 'NODE 02',
    title: 'WebSocket Ping Mesh',
    subtitle: 'RTT offset calibration',
    accent: '#67E8F9',
    detail:
      'Each browser continuously exchanges compact ping/pong timestamps to subtract cellular or Wi-Fi transit latency automatically.',
    spec: '5G + Wi-Fi · Continuous RTT compensation',
    x: 37,
    y: 58,
  },
  {
    id: 'crate',
    code: 'NODE 03',
    title: 'Audio & Queue Engine',
    subtitle: 'WAV / MP3 / YouTube / Votes',
    accent: '#8B5CF6',
    detail:
      'Decodes built-in hip-hop WAV stems, uploaded room MP3s, and YouTube streams with live upvote reordering and host permissions.',
    spec: '44.1 kHz stereo · Duplicate lock',
    x: 64,
    y: 24,
  },
  {
    id: 'speakers',
    code: 'NODE 04',
    title: 'Multi-Phone Wall',
    subtitle: 'Up to 50 browser speakers',
    accent: '#5DCAA5',
    detail:
      'Safely joins iOS Safari, Android Chrome, and laptops via QR code with independent hardware volume sliders on every device.',
    spec: 'Zero app install · Signed room cookies',
    x: 88,
    y: 56,
  },
];

interface SignalPatchLabProps {
  onJumpToDemo: () => void;
  onStartRoom: () => void;
}

export function SignalPatchLab({ onJumpToDemo, onStartRoom }: SignalPatchLabProps) {
  const [selectedId, setSelectedId] = useState<PatchNode['id']>('clock');
  const [pulseCount, setPulseCount] = useState(1);

  const selectedNode = PATCH_NODES.find((n) => n.id === selectedId) ?? PATCH_NODES[0];

  const triggerPulse = (id?: PatchNode['id']) => {
    if (id) setSelectedId(id);
    setPulseCount((c) => c + 1);
  };

  return (
    <section id="patch" className="relative border-b border-white/[0.08] py-20 lg:py-24">
      <div className="mx-auto max-w-[1280px] px-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <p className="font-mono text-xs sm:text-sm text-[#FF4D1C] uppercase tracking-wider mb-1.5">
              Signal Patch Architecture
            </p>
            <h2
              className="font-display text-2xl sm:text-4xl font-extrabold tracking-tight text-[#F4F1EA]"
              style={{ textWrap: 'balance' }}
            >
              Route the signal from server clock to every phone
            </h2>
          </div>

          <button
            type="button"
            onClick={() => triggerPulse()}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-mono font-bold uppercase tracking-wider text-[#0B0A16] bg-[#67E8F9] hover:brightness-110 rounded-xl transition-all whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Fire Sync Pulse</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Interactive Patch Graph Stage (inspired by mayakhalil.com Creative Lab) */}
          <div className="lg:col-span-8 glass rounded-2xl p-5 sm:p-6 relative overflow-hidden min-h-[320px] flex flex-col justify-between">
            <div className="flex items-center justify-between text-[11px] font-mono text-[#8A8780] mb-4">
              <span>/syncbeats/patch</span>
              <span>click any node to route</span>
            </div>

            {/* Desktop Interactive Wire Canvas */}
            <div className="relative hidden md:block h-[240px] w-full rounded-xl glass-inset overflow-hidden">
              <svg
                aria-hidden="true"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="absolute inset-0 w-full h-full pointer-events-none"
              >
                <defs>
                  <linearGradient id="patchWireGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#FF4D1C" />
                    <stop offset="50%" stopColor="#67E8F9" />
                    <stop offset="100%" stopColor="#5DCAA5" />
                  </linearGradient>
                </defs>
                {/* Patch cables */}
                <path
                  d="M 14 34 C 24 34, 26 64, 38 64"
                  fill="none"
                  stroke="rgba(244,241,234,0.2)"
                  strokeWidth="0.6"
                />
                <path
                  d="M 46 64 C 55 64, 55 32, 65 32"
                  fill="none"
                  stroke="rgba(244,241,234,0.2)"
                  strokeWidth="0.6"
                />
                <path
                  d="M 73 32 C 80 32, 80 62, 88 62"
                  fill="none"
                  stroke="rgba(244,241,234,0.2)"
                  strokeWidth="0.6"
                />

                {/* Highlighted active signal path */}
                <path
                  key={pulseCount}
                  d="M 14 34 C 24 34, 26 64, 38 64 M 46 64 C 55 64, 55 32, 65 32 M 73 32 C 80 32, 80 62, 88 62"
                  fill="none"
                  stroke="url(#patchWireGrad)"
                  strokeWidth="1.1"
                  strokeDasharray="6 4"
                >
                  <animate
                    attributeName="stroke-dashoffset"
                    from="40"
                    to="0"
                    dur="1.4s"
                    repeatCount="indefinite"
                  />
                </path>
              </svg>

              {PATCH_NODES.map((node) => {
                const isSelected = node.id === selectedId;
                return (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => triggerPulse(node.id)}
                    style={{
                      left: `${node.x}%`,
                      top: `${node.y}%`,
                      borderColor: isSelected ? node.accent : 'rgba(244, 241, 234, 0.18)',
                    }}
                    className="absolute -translate-x-1/4 -translate-y-1/4 w-[184px] text-left p-3 rounded-xl bg-[#0B0A16]/95 border transition-all duration-150 hover:scale-[1.03] cursor-pointer shadow-lg"
                  >
                    <div className="flex items-center justify-between gap-2 font-mono text-[10px]">
                      <span style={{ color: node.accent }}>{node.code}</span>
                      <span className="text-[#8A8780]">{isSelected ? 'ACTIVE' : 'PATCH'}</span>
                    </div>
                    <div className="font-display text-sm font-bold text-[#F4F1EA] mt-1 truncate">
                      {node.title}
                    </div>
                    <div className="text-[11px] text-[#A7A3C7] truncate mt-0.5">
                      {node.subtitle}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Mobile Clean Node Selector */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:hidden">
              {PATCH_NODES.map((node) => {
                const isSelected = node.id === selectedId;
                return (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => triggerPulse(node.id)}
                    style={{
                      borderColor: isSelected ? node.accent : 'rgba(244, 241, 234, 0.14)',
                    }}
                    className="text-left p-3.5 rounded-xl glass-inset border cursor-pointer"
                  >
                    <div className="font-mono text-[10px]" style={{ color: node.accent }}>
                      {node.code}
                    </div>
                    <div className="font-display text-sm font-bold text-[#F4F1EA] mt-0.5">
                      {node.title}
                    </div>
                    <div className="text-xs text-[#A7A3C7] mt-0.5">{node.subtitle}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Inspector Case Window (inspired by mayakhalil.com #cwin) */}
          <aside className="lg:col-span-4 glass rounded-2xl p-6 flex flex-col justify-between gap-5">
            <div>
              <div className="flex items-center justify-between text-xs font-mono pb-3 border-b border-white/10">
                <span style={{ color: selectedNode.accent }}>{selectedNode.code}</span>
                <span className="text-[#8A8780]">Pulse #{pulseCount}</span>
              </div>

              <h3 className="font-display text-2xl font-extrabold text-[#F4F1EA] mt-4">
                {selectedNode.title}
              </h3>

              <p className="mt-3 text-sm text-[#A7A3C7] leading-relaxed">{selectedNode.detail}</p>

              <div className="mt-5 p-3.5 rounded-xl glass-inset">
                <div className="font-mono text-[10px] uppercase text-[#8A8780]">Signal Spec</div>
                <div className="text-xs font-medium text-[#F4F1EA] mt-1">{selectedNode.spec}</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={onJumpToDemo}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-[#0B0A16] bg-[#F4F1EA] hover:bg-[#67E8F9] rounded-lg transition-colors cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Hear Soundcheck</span>
              </button>
              <button
                type="button"
                onClick={onStartRoom}
                className="px-4 py-2.5 text-xs font-bold text-white bg-[#FF4D1C] hover:bg-[#FF6438] rounded-lg transition-colors cursor-pointer"
              >
                Start Room
              </button>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
