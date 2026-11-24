import type { BuiltinBeatKey } from '../../shared/types';

// Synthesizes 6 distinct, punchy Hip-Hop, Trap, Boom-Bap, Lo-Fi, Drill, and Neo-Soul
// stereo WAV beats offline via Web Audio API for frame-accurate room synchronization
// and instant auditioning on the SyncBeats landing page.

const cachedTrackUrls = new Map<string, string>();

interface BeatRecipe {
  style: 'trap' | 'boombap' | 'westcoast' | 'lofi' | 'drill' | 'neosoul';
  bpm: number;
  rootMidi: number;
  chordProg: number[][];
  bassNotes: number[];
  melodyNotes: number[];
  swing: number;
  cutoffHz: number;
}

const BEAT_RECIPES: Record<BuiltinBeatKey, BeatRecipe> = {
  afterhours: {
    style: 'trap',
    bpm: 140,
    rootMidi: 36, // C2
    chordProg: [
      [0, 3, 7, 10],
      [0, 3, 7, 10],
      [-4, 0, 3, 7],
      [-5, -1, 2, 7],
    ],
    bassNotes: [0, 0, -4, -5],
    melodyNotes: [12, 15, 19, 15, 14, 15, 12, 10],
    swing: 0.0,
    cutoffHz: 2400,
  },
  boombap: {
    style: 'boombap',
    bpm: 92,
    rootMidi: 40, // E2
    chordProg: [
      [0, 3, 7, 10, 14],
      [-2, 2, 5, 9, 12],
      [-5, -2, 2, 5, 9],
      [-4, 0, 3, 7, 10],
    ],
    bassNotes: [0, -2, -5, -4],
    melodyNotes: [12, 14, 15, 19, 15, 14, 12, 7],
    swing: 0.14,
    cutoffHz: 1850,
  },
  cypher: {
    style: 'westcoast',
    bpm: 102,
    rootMidi: 38, // D2
    chordProg: [
      [0, 3, 7, 10],
      [5, 8, 12, 15],
      [0, 3, 7, 10],
      [-2, 2, 5, 9],
    ],
    bassNotes: [0, 5, 0, -2],
    melodyNotes: [24, 27, 31, 29, 27, 24, 22, 24],
    swing: 0.08,
    cutoffHz: 2800,
  },
  lofi: {
    style: 'lofi',
    bpm: 82,
    rootMidi: 41, // F2
    chordProg: [
      [0, 4, 7, 11, 14],
      [2, 5, 9, 12, 16],
      [-5, -1, 2, 5, 9],
      [0, 4, 7, 11, 14],
    ],
    bassNotes: [0, 2, -5, 0],
    melodyNotes: [12, 16, 19, 23, 19, 16, 14, 12],
    swing: 0.18,
    cutoffHz: 1350,
  },
  drill: {
    style: 'drill',
    bpm: 144,
    rootMidi: 37, // C#2
    chordProg: [
      [0, 3, 7],
      [1, 5, 8],
      [0, 3, 7],
      [-4, 0, 3],
    ],
    bassNotes: [0, 1, 0, -4],
    melodyNotes: [12, 13, 19, 15, 12, 13, 15, 19],
    swing: 0.0,
    cutoffHz: 2600,
  },
  golden: {
    style: 'neosoul',
    bpm: 96,
    rootMidi: 43, // G2
    chordProg: [
      [0, 3, 7, 10, 14],
      [5, 9, 12, 16, 19],
      [3, 7, 10, 14, 17],
      [-2, 2, 5, 9, 12],
    ],
    bassNotes: [0, 5, 3, -2],
    melodyNotes: [12, 15, 19, 22, 19, 15, 14, 12],
    swing: 0.11,
    cutoffHz: 1950,
  },
};

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function encodeWavFromAudioBuffer(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const bytesPerSample = 2;
  const dataSize = length * numChannels * bytesPerSample;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i += 1) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  const channels = [];
  for (let c = 0; c < numChannels; c += 1) {
    channels.push(buffer.getChannelData(c));
  }

  let offset = 44;
  for (let i = 0; i < length; i += 1) {
    for (let c = 0; c < numChannels; c += 1) {
      const sample = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function createSoftClipCurve(): Float32Array<ArrayBuffer> {
  const samples = 1024;
  const buffer = new ArrayBuffer(samples * 4);
  const curve = new Float32Array(buffer);
  for (let i = 0; i < samples; i += 1) {
    const x = (i * 2) / samples - 1;
    curve[i] = Math.tanh(x * 1.8);
  }
  return curve;
}

export async function getBuiltinTrackUrl(key: BuiltinBeatKey): Promise<string> {
  const cached = cachedTrackUrls.get(key);
  if (cached) return cached;

  const recipe = BEAT_RECIPES[key];
  const sampleRate = 44100;
  const durationSec = 40;
  const offline = new OfflineAudioContext(2, sampleRate * durationSec, sampleRate);

  const masterComp = offline.createDynamicsCompressor();
  masterComp.threshold.value = -10;
  masterComp.ratio.value = 4;
  masterComp.attack.value = 0.004;
  masterComp.release.value = 0.14;

  const masterGain = offline.createGain();
  masterGain.gain.value = 0.82;

  const musicBus = offline.createBiquadFilter();
  musicBus.type = 'lowpass';
  musicBus.frequency.value = recipe.cutoffHz;
  musicBus.Q.value = 0.8;

  musicBus.connect(masterComp);
  masterComp.connect(masterGain);
  masterGain.connect(offline.destination);

  const beatSec = 60 / recipe.bpm;
  const sixteenthSec = beatSec / 4;
  const totalSixteenths = Math.floor(durationSec / sixteenthSec);

  const noiseBuffer = offline.createBuffer(1, sampleRate * 0.35, sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < noiseData.length; i += 1) {
    noiseData[i] = Math.random() * 2 - 1;
  }

  const saturator = offline.createWaveShaper();
  saturator.curve = createSoftClipCurve();
  saturator.connect(masterComp);

  // Subtle vinyl warmth on Boom Bap & Lo-Fi
  if (recipe.style === 'boombap' || recipe.style === 'lofi') {
    const crackleBuf = offline.createBuffer(1, sampleRate * durationSec, sampleRate);
    const cd = crackleBuf.getChannelData(0);
    for (let i = 0; i < cd.length; i += 1) {
      cd[i] = Math.random() < 0.0008 ? (Math.random() * 2 - 1) * 0.45 : (Math.random() * 2 - 1) * 0.006;
    }
    const crackleSrc = offline.createBufferSource();
    crackleSrc.buffer = crackleBuf;
    const crackleHp = offline.createBiquadFilter();
    crackleHp.type = 'bandpass';
    crackleHp.frequency.value = 2600;
    const crackleGain = offline.createGain();
    crackleGain.gain.value = 0.15;
    crackleSrc.connect(crackleHp);
    crackleHp.connect(crackleGain);
    crackleGain.connect(masterGain);
    crackleSrc.start(0);
  }

  const trigger808OrKick = (t: number, noteMidi: number, slideToMidi?: number) => {
    const osc = offline.createOscillator();
    const gain = offline.createGain();
    const is808 = recipe.style === 'trap' || recipe.style === 'drill';

    osc.type = 'sine';
    const baseFreq = midiToFreq(noteMidi);
    osc.frequency.setValueAtTime(is808 ? 145 : 138, t);
    osc.frequency.exponentialRampToValueAtTime(baseFreq, t + 0.055);
    if (slideToMidi !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(midiToFreq(slideToMidi), t + beatSec * 0.65);
    }

    const sustain = is808 ? beatSec * 0.95 : 0.24;
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(is808 ? 0.62 : 0.56, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.001, Math.min(durationSec, t + sustain));

    osc.connect(gain);
    gain.connect(is808 ? saturator : masterComp);
    osc.start(t);
    osc.stop(Math.min(durationSec, t + sustain + 0.02));
  };

  const triggerSnareClap = (t: number, snappy: boolean) => {
    // Body tone
    const body = offline.createOscillator();
    const bodyGain = offline.createGain();
    body.type = 'triangle';
    body.frequency.setValueAtTime(snappy ? 210 : 185, t);
    body.frequency.exponentialRampToValueAtTime(110, t + 0.06);
    bodyGain.gain.setValueAtTime(0.28, t);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    body.connect(bodyGain);
    bodyGain.connect(masterComp);
    body.start(t);
    body.stop(t + 0.12);

    // Crisp noise snap
    const noise = offline.createBufferSource();
    noise.buffer = noiseBuffer;
    const bp = offline.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = snappy ? 2300 : 1650;
    bp.Q.value = 1.1;
    const nGain = offline.createGain();
    nGain.gain.setValueAtTime(snappy ? 0.34 : 0.28, t);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + (snappy ? 0.14 : 0.16));
    noise.connect(bp);
    bp.connect(nGain);
    nGain.connect(masterComp);
    noise.start(t);
    noise.stop(t + 0.17);
  };

  const triggerHat = (t: number, level: number, open = false) => {
    const hat = offline.createBufferSource();
    hat.buffer = noiseBuffer;
    const hp = offline.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7200;
    const gain = offline.createGain();
    gain.gain.setValueAtTime(level, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + (open ? 0.16 : 0.045));
    hat.connect(hp);
    hp.connect(gain);
    gain.connect(masterComp);
    hat.start(t);
    hat.stop(t + (open ? 0.17 : 0.05));
  };

  // Schedule chord stabs per bar
  const totalBars = Math.floor(totalSixteenths / 16);
  for (let bar = 0; bar < totalBars; bar += 1) {
    const barStart = bar * 16 * sixteenthSec;
    if (barStart >= durationSec - 0.3) break;
    const chord = recipe.chordProg[bar % recipe.chordProg.length];
    const bassInterval = recipe.bassNotes[bar % recipe.bassNotes.length];

    // Warm chord stab on bar start (and chopped stab on beat 2.5 for boom bap / neo-soul)
    const chordHits =
      recipe.style === 'boombap' || recipe.style === 'neosoul'
        ? [barStart, barStart + 10 * sixteenthSec]
        : [barStart];

    for (const hitTime of chordHits) {
      if (hitTime >= durationSec - 0.2) continue;
      chord.forEach((iv, vIdx) => {
        const osc = offline.createOscillator();
        const pan = offline.createStereoPanner();
        const g = offline.createGain();
        osc.type = recipe.style === 'trap' || recipe.style === 'drill' ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(midiToFreq(recipe.rootMidi + 24 + iv), hitTime);
        pan.pan.value = (vIdx - 1.5) * 0.25;

        const len = recipe.style === 'boombap' ? beatSec * 1.4 : beatSec * 3.4;
        g.gain.setValueAtTime(0.001, hitTime);
        g.gain.linearRampToValueAtTime(0.085, hitTime + 0.015);
        g.gain.exponentialRampToValueAtTime(0.001, Math.min(durationSec, hitTime + len));
        osc.connect(pan);
        pan.connect(g);
        g.connect(musicBus);
        osc.start(hitTime);
        osc.stop(Math.min(durationSec, hitTime + len + 0.02));
      });
    }

    // West Coast / Boom Bap bass pocket
    if (recipe.style === 'westcoast' || recipe.style === 'boombap' || recipe.style === 'lofi' || recipe.style === 'neosoul') {
      const bassSteps = recipe.style === 'westcoast' ? [0, 3, 6, 10, 14] : [0, 6, 10];
      for (const bs of bassSteps) {
        const bt = barStart + bs * sixteenthSec;
        if (bt >= durationSec - 0.15) continue;
        const osc = offline.createOscillator();
        const g = offline.createGain();
        osc.type = recipe.style === 'westcoast' ? 'sawtooth' : 'triangle';
        osc.frequency.setValueAtTime(midiToFreq(recipe.rootMidi + bassInterval), bt);
        g.gain.setValueAtTime(0.001, bt);
        g.gain.linearRampToValueAtTime(0.26, bt + 0.012);
        g.gain.exponentialRampToValueAtTime(0.001, Math.min(durationSec, bt + beatSec * 0.9));
        osc.connect(g);
        g.connect(musicBus);
        osc.start(bt);
        osc.stop(Math.min(durationSec, bt + beatSec * 0.95));
      }
    }
  }

  // Schedule 16th-note drum & melodic grooves
  for (let step = 0; step < totalSixteenths; step += 1) {
    const isOff16th = step % 2 === 1;
    const t = step * sixteenthSec + (isOff16th ? recipe.swing * sixteenthSec : 0);
    if (t >= durationSec - 0.12) break;

    const s = step % 16;
    const bar = Math.floor(step / 16);
    const bassInterval = recipe.bassNotes[bar % recipe.bassNotes.length];

    if (recipe.style === 'trap') {
      // Heavy 808 on 0, 6, 10; snappy clap on 8 (half-time 140 BPM feel!)
      if (s === 0 || s === 6 || s === 10) {
        trigger808OrKick(t, recipe.rootMidi + bassInterval, s === 10 && bar % 2 === 1 ? recipe.rootMidi + bassInterval + 12 : undefined);
      }
      if (s === 8) triggerSnareClap(t, true);
      if (step % 2 === 0) triggerHat(t, 0.08);
      // Trap hi-hat 1/32 triplet rolls on beat 3.5 & 4
      if (s === 13 || s === 14) {
        triggerHat(t, 0.075);
        triggerHat(t + sixteenthSec * 0.5, 0.055);
      }
    } else if (recipe.style === 'drill') {
      // Drill 808 glides + signature snare on 6 and 12 (half-time 144 BPM)
      if (s === 0 || s === 3 || s === 10) {
        trigger808OrKick(t, recipe.rootMidi + bassInterval, s === 10 ? recipe.rootMidi + bassInterval + 7 : undefined);
      }
      if (s === 6 || s === 12) triggerSnareClap(t, true);
      if (s % 3 === 0 || s === 14) triggerHat(t, 0.085);
      if (s === 15) triggerHat(t + sixteenthSec * 0.5, 0.06);
    } else if (recipe.style === 'boombap' || recipe.style === 'lofi' || recipe.style === 'neosoul') {
      // Classic pocket kick (0, 7, 10) + heavy snare on 4 & 12
      if (s === 0 || s === 7 || s === 10 || (bar % 2 === 1 && s === 15)) {
        trigger808OrKick(t, recipe.rootMidi);
      }
      if (s === 4 || s === 12) triggerSnareClap(t, false);
      if (step % 2 === 0) triggerHat(t, s % 4 === 2 ? 0.065 : 0.04, s === 14);
    } else {
      // West Coast Bounce
      if (s === 0 || s === 6 || s === 10) trigger808OrKick(t, recipe.rootMidi);
      if (s === 4 || s === 12) triggerSnareClap(t, true);
      if (step % 2 === 0) triggerHat(t, 0.07, s === 14);
    }

    // Melodic hook motif (bells / G-funk lead / Rhodes pluck)
    if (s % 2 === 0 && (recipe.style === 'trap' || recipe.style === 'drill' || recipe.style === 'westcoast')) {
      const mIdx = (step / 2) % recipe.melodyNotes.length;
      const freq = midiToFreq(recipe.rootMidi + 12 + recipe.melodyNotes[mIdx]);
      const osc = offline.createOscillator();
      const pan = offline.createStereoPanner();
      const g = offline.createGain();
      osc.type = recipe.style === 'westcoast' ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      pan.pan.value = Math.sin(step * 0.5) * 0.35;
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.075, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
      osc.connect(pan);
      pan.connect(g);
      g.connect(musicBus);
      osc.start(t);
      osc.stop(t + 0.26);
    }
  }

  masterGain.gain.setValueAtTime(0.82, durationSec - 1.0);
  masterGain.gain.linearRampToValueAtTime(0.001, durationSec);

  const rendered = await offline.startRendering();
  const wavBlob = encodeWavFromAudioBuffer(rendered);
  const url = URL.createObjectURL(wavBlob);
  cachedTrackUrls.set(key, url);
  return url;
}

// Plays an authentic 808 + clap rhythmic groove across 3 virtual phone speakers
// on the landing page so users hear echo skew vs tight clock-locked drop.
export class LandingSyncDemoAudio {
  private ctx: AudioContext | null = null;
  private timerId: number | null = null;
  private step = 0;
  private synced = true;
  private running = false;

  public start(synced: boolean, onStep?: (step: number) => void) {
    this.synced = synced;
    if (this.running) return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!this.ctx) {
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    this.running = true;
    this.step = 0;

    const tick = () => {
      if (!this.running || !this.ctx) return;
      const now = this.ctx.currentTime;
      const currentStep = this.step;
      this.step += 1;

      onStep?.(currentStep);

      this.triggerBeatHit(now, currentStep, -0.3, 1.0);
      const delay2 = this.synced ? 0.007 : 0.074;
      this.triggerBeatHit(now + delay2, currentStep, 0.35, 0.7);
      const delay3 = this.synced ? 0.011 : 0.148;
      this.triggerBeatHit(now + delay3, currentStep, 0.0, 0.58);
    };

    tick();
    this.timerId = window.setInterval(tick, 220);
  }

  public setSynced(synced: boolean) {
    this.synced = synced;
  }

  public stop() {
    this.running = false;
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  private triggerBeatHit(when: number, step: number, pan: number, gainAmount: number) {
    if (!this.ctx) return;
    const s = step % 8;
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = pan;
    panner.connect(this.ctx.destination);

    // 808 kick on steps 0, 3, 6
    if (s === 0 || s === 3 || s === 6) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(140, when);
      osc.frequency.exponentialRampToValueAtTime(48, when + 0.06);
      g.gain.setValueAtTime(0.001, when);
      g.gain.linearRampToValueAtTime(0.22 * gainAmount, when + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, when + 0.19);
      osc.connect(g);
      g.connect(panner);
      osc.start(when);
      osc.stop(when + 0.2);
    }

    // Crisp trap rim/clap on 2 and 4 / 7
    if (s === 2 || s === 5) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(s === 2 ? 330 : 293.66, when);
      g.gain.setValueAtTime(0.001, when);
      g.gain.linearRampToValueAtTime(0.11 * gainAmount, when + 0.004);
      g.gain.exponentialRampToValueAtTime(0.001, when + 0.1);
      osc.connect(g);
      g.connect(panner);
      osc.start(when);
      osc.stop(when + 0.11);
    }
  }
}
