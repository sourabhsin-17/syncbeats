import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import type {
  BuiltinBeatKey,
  ChatMessage,
  ClientWsMessage,
  ControlMode,
  MusicProvider,
  PublicRoomSummary,
  RoomDevice,
  RoomState,
  RoomVisibility,
  ServerWsMessage,
  Track,
} from './shared/types';

const PORT = Number(process.env.PORT || 3000);
const SCHEDULE_LEAD_MS = 260;
const DISCONNECT_GRACE_MS = 15_000;
const EMPTY_ROOM_TTL_MS = 30 * 60_000;
const MEDIA_TTL_MS = 2 * 60 * 60_000;
const MAX_MEDIA_BYTES = 150 * 1024 * 1024;
const MAX_CHAT_HISTORY = 120;

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

interface UploadedMedia {
  id: string;
  mimeType: string;
  buffer: Buffer;
  createdAt: number;
}

interface InternalRoomRecord {
  state: RoomState;
  passwordSalt: string | null;
  passwordHash: string | null;
  kickedDeviceIds: Set<string>;
  disconnectTimers: Map<string, ReturnType<typeof setTimeout>>;
  emptySince: number | null;
}

interface ConnectedSocket {
  ws: WebSocket;
  roomId: string | null;
  deviceId: string | null;
  ip: string;
  chatTimestamps: number[];
  actionTimestamps: number[];
}

const BUILTIN_CATALOG: Record<
  BuiltinBeatKey,
  Omit<Track, 'id' | 'addedBy' | 'addedByDeviceId' | 'votes' | 'addedAt'>
> = {
  afterhours: {
    title: '808 Afterhours',
    artist: 'Metro District · Trap 808s',
    durationSec: 40,
    bpm: 140,
    sourceType: 'builtin',
    provider: 'builtin',
    builtinKey: 'afterhours',
    artworkUrl: '/src/assets/images/cover_808_afterhours_1795418328427.jpg',
  },
  boombap: {
    title: '94 Boom Bap',
    artist: 'Crate Diggers · Classic East',
    durationSec: 40,
    bpm: 92,
    sourceType: 'builtin',
    provider: 'builtin',
    builtinKey: 'boombap',
    artworkUrl: '/src/assets/images/cover_boom_bap_1795418328317.jpg',
  },
  cypher: {
    title: 'Concrete Cypher',
    artist: 'Westside Bounce · G-Funk',
    durationSec: 40,
    bpm: 102,
    sourceType: 'builtin',
    provider: 'builtin',
    builtinKey: 'cypher',
    artworkUrl: '/src/assets/images/cover_concrete_cypher_1795418328402.jpg',
  },
  lofi: {
    title: 'Late Night Lo-Fi',
    artist: 'Tape Deck 404 · Chill Hop',
    durationSec: 40,
    bpm: 82,
    sourceType: 'builtin',
    provider: 'builtin',
    builtinKey: 'lofi',
    artworkUrl: '/src/assets/images/cover_lofi_tape_1795551465579.jpg',
  },
  drill: {
    title: 'Southside Stunt',
    artist: 'Block 808 · Heavy Drill',
    durationSec: 40,
    bpm: 144,
    sourceType: 'builtin',
    provider: 'builtin',
    builtinKey: 'drill',
    artworkUrl: '/src/assets/images/cover_southside_drill_1795551465534.jpg',
  },
  golden: {
    title: 'Golden Era Tape',
    artist: 'Rooftop Sessions · Neo-Soul',
    durationSec: 40,
    bpm: 96,
    sourceType: 'builtin',
    provider: 'builtin',
    builtinKey: 'golden',
    artworkUrl: '/src/assets/images/cover_golden_soul_1795551466591.jpg',
  },
};

function createDefaultQueue(): Track[] {
  const now = Date.now();
  return (Object.keys(BUILTIN_CATALOG) as Array<keyof typeof BUILTIN_CATALOG>).map((key, idx) => ({
    ...BUILTIN_CATALOG[key],
    slideUrls: BUILTIN_CATALOG[key].artworkUrl ? [BUILTIN_CATALOG[key].artworkUrl] : [],
    id: `builtin-${key}`,
    addedBy: 'Beat Crate',
    addedByDeviceId: 'system',
    votes: [],
    addedAt: now + idx,
  }));
}

const rooms = new Map<string, InternalRoomRecord>();
const uploadedMedia = new Map<string, UploadedMedia>();
const roomSockets = new Map<string, Set<WebSocket>>();
const socketMeta = new WeakMap<WebSocket, ConnectedSocket>();
const ipRateLimits = new Map<string, number[]>();

function safeDecode(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function normalizeRoomCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
}

function generateRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

function hashPassword(password: string): { salt: string; hash: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  try {
    const derived = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(expectedHash, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

function signRoomCookie(roomId: string, deviceId = '*'): string {
  const payload = `${roomId}:${deviceId}`;
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function verifyRoomCookie(token: string, roomId: string): boolean {
  const dotIdx = token.lastIndexOf('.');
  if (dotIdx <= 0) return false;
  const payload = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  const [tokenRoom] = payload.split(':');
  if (tokenRoom !== roomId) return false;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expectedSig, 'hex'));
  } catch {
    return false;
  }
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0) {
      const k = part.slice(0, eq).trim();
      const v = part.slice(eq + 1).trim();
      out[k] = safeDecode(v);
    }
  }
  return out;
}

function isRateLimited(bucket: number[], limit: number, windowMs: number, now = Date.now()): boolean {
  while (bucket.length > 0 && now - bucket[0] > windowMs) {
    bucket.shift();
  }
  if (bucket.length >= limit) {
    return true;
  }
  bucket.push(now);
  return false;
}

function checkIpRateLimit(ip: string, key: string, limit: number, windowMs: number): boolean {
  const composite = `${key}:${ip}`;
  let list = ipRateLimits.get(composite);
  if (!list) {
    list = [];
    ipRateLimits.set(composite, list);
  }
  return isRateLimited(list, limit, windowMs);
}

function createRoomRecord(options: {
  roomId?: string;
  roomName?: string;
  visibility?: RoomVisibility;
  password?: string;
  maxCapacity?: number;
  controlMode?: ControlMode;
}): InternalRoomRecord {
  const now = Date.now();
  const roomId = options.roomId ? normalizeRoomCode(options.roomId) : generateRoomCode();
  const cleanName = (options.roomName || '').trim().slice(0, 48) || `Room ${roomId}`;
  const visibility: RoomVisibility = options.visibility === 'private' ? 'private' : 'public';
  const controlMode: ControlMode = options.controlMode === 'host_only' ? 'host_only' : 'collaborative';
  const maxCapacity = Math.max(2, Math.min(50, Number(options.maxCapacity) || 16));
  const cleanPassword = (options.password || '').trim();
  const hashed = cleanPassword.length > 0 ? hashPassword(cleanPassword) : null;

  const state: RoomState = {
    roomId,
    roomName: cleanName,
    visibility,
    hasPassword: Boolean(hashed),
    maxCapacity,
    controlMode,
    hostDeviceId: '',
    queue: createDefaultQueue(),
    currentTrackIndex: 0,
    isPlaying: false,
    anchorServerTime: now,
    anchorPositionSec: 0,
    devices: [],
    chat: [
      {
        id: crypto.randomUUID(),
        deviceId: 'system',
        senderName: 'SyncBeats',
        text: `${cleanName} opened. Share code ${roomId} to sync additional speakers.`,
        timestamp: now,
        system: true,
      },
    ],
    updatedAt: now,
  };

  return {
    state,
    passwordSalt: hashed?.salt ?? null,
    passwordHash: hashed?.hash ?? null,
    kickedDeviceIds: new Set(),
    disconnectTimers: new Map(),
    emptySince: now,
  };
}

function appendSystemChat(room: RoomState, text: string) {
  room.chat.push({
    id: crypto.randomUUID(),
    deviceId: 'system',
    senderName: 'SyncBeats',
    text,
    timestamp: Date.now(),
    system: true,
  });
  if (room.chat.length > MAX_CHAT_HISTORY) {
    room.chat = room.chat.slice(-MAX_CHAT_HISTORY);
  }
}

function computeCurrentPositionSec(room: RoomState, now = Date.now()): number {
  const currentTrack = room.queue[room.currentTrackIndex];
  const duration = currentTrack ? currentTrack.durationSec : 0;
  if (!room.isPlaying) {
    return Math.max(0, Math.min(duration || room.anchorPositionSec, room.anchorPositionSec));
  }
  const elapsed = Math.max(0, (now - room.anchorServerTime) / 1000);
  const pos = room.anchorPositionSec + elapsed;
  if (duration > 0 && pos >= duration) {
    return pos % duration;
  }
  return Math.max(0, pos);
}

function reorderUpcomingByVotes(room: RoomState) {
  if (room.queue.length <= 1) return;
  const activeIdx = Math.max(0, Math.min(room.currentTrackIndex, room.queue.length - 1));
  const head = room.queue.slice(0, activeIdx + 1);
  const upcoming = room.queue.slice(activeIdx + 1);
  upcoming.sort((a, b) => {
    const voteDiff = b.votes.length - a.votes.length;
    if (voteDiff !== 0) return voteDiff;
    return a.addedAt - b.addedAt;
  });
  room.queue = [...head, ...upcoming];
}

function sanitizeExternalArtworkUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:') {
      parsed.protocol = 'https:';
    }
    if (parsed.protocol !== 'https:') return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs = 2500): Promise<T | null> {
  try {
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'SyncBeats/1.0',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resp.ok) return null;
    return (await resp.json()) as T;
  } catch {
    return null;
  }
}

async function fetchAppleMusicMeta(
  targetUrl: string,
  timeoutMs = 2500,
): Promise<{ title?: string; artist?: string; artworkUrl?: string }> {
  try {
    const resp = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        Accept: 'text/html',
        'User-Agent': 'Mozilla/5.0 (compatible; SyncBeats/1.0)',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resp.ok) return {};
    const html = (await resp.text()).slice(0, 131_072);

    const extractMeta = (prop: string): string | undefined => {
      const re1 = new RegExp(
        `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`,
        'i',
      );
      const re2 = new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`,
        'i',
      );
      const match = re1.exec(html) || re2.exec(html);
      return match?.[1] ? decodeHtmlEntities(match[1].trim()) : undefined;
    };

    const rawTitle = extractMeta('og:title') || extractMeta('twitter:title');
    const rawImage = extractMeta('og:image') || extractMeta('twitter:image');
    const artworkUrl = sanitizeExternalArtworkUrl(rawImage);

    let title = rawTitle;
    let artist: string | undefined;
    if (rawTitle && rawTitle.includes(' by ')) {
      const parts = rawTitle.split(' by ');
      title = parts[0]?.trim();
      artist = parts.slice(1).join(' by ').replace(/\s+on Apple Music$/i, '').trim();
    } else if (rawTitle) {
      title = rawTitle.replace(/\s+[-–|]\s*Apple Music$/i, '').trim();
    }

    return { title, artist, artworkUrl };
  } catch {
    return {};
  }
}

async function parseProviderTrackFromUrl(
  rawUrl: string,
  addedBy: string,
  addedByDeviceId: string,
  customTitle?: string,
  customArtist?: string,
): Promise<{ track?: Track; error?: string }> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { error: 'Enter a valid http:// or https:// track URL.' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { error: 'Only http:// and https:// URLs are supported.' };
  }

  const host = parsed.hostname.toLowerCase();
  const now = Date.now();
  const cleanCustomTitle = (customTitle || '').trim().slice(0, 80);
  const cleanCustomArtist = (customArtist || '').trim().slice(0, 80);

  // YouTube URL detection
  let youtubeId: string | null = null;
  if (host === 'youtu.be') {
    youtubeId = parsed.pathname.replace(/^\//, '').split('/')[0] || null;
  } else if (host.endsWith('youtube.com')) {
    if (parsed.pathname === '/watch') {
      youtubeId = parsed.searchParams.get('v');
    } else if (parsed.pathname.startsWith('/shorts/') || parsed.pathname.startsWith('/embed/')) {
      youtubeId = parsed.pathname.split('/')[2] || null;
    }
  }

  if (youtubeId && /^[A-Za-z0-9_-]{11}$/.test(youtubeId)) {
    const canonicalYoutubeUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
    const oembed = await fetchJsonWithTimeout<{
      title?: string;
      author_name?: string;
      thumbnail_url?: string;
    }>(`https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalYoutubeUrl)}&format=json`);

    const primaryThumb =
      sanitizeExternalArtworkUrl(oembed?.thumbnail_url) ||
      `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;

    const slideSet = Array.from(
      new Set([
        primaryThumb,
        `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
        `https://i.ytimg.com/vi/${youtubeId}/1.jpg`,
        `https://i.ytimg.com/vi/${youtubeId}/2.jpg`,
        `https://i.ytimg.com/vi/${youtubeId}/3.jpg`,
      ]),
    );

    const resolvedTitle =
      cleanCustomTitle ||
      (oembed?.title ? String(oembed.title).trim().slice(0, 80) : '') ||
      `YouTube Track (${youtubeId})`;
    const resolvedArtist =
      cleanCustomArtist ||
      (oembed?.author_name
        ? `${String(oembed.author_name).trim().slice(0, 52)} · YouTube`
        : 'YouTube Stream (Approx. Sync)');

    return {
      track: {
        id: `yt-${youtubeId}-${now}`,
        title: resolvedTitle,
        artist: resolvedArtist,
        durationSec: 210,
        bpm: 120,
        sourceType: 'external',
        provider: 'youtube',
        youtubeId,
        externalUrl: canonicalYoutubeUrl,
        artworkUrl: primaryThumb,
        slideUrls: slideSet,
        addedBy,
        addedByDeviceId,
        votes: [],
        addedAt: now,
      },
    };
  }

  // Spotify URL detection (tracks, albums, playlists, episodes, including localized paths)
  if (
    host === 'open.spotify.com' &&
    /\/(track|album|playlist|episode)\//i.test(parsed.pathname)
  ) {
    const spotifyOembed = await fetchJsonWithTimeout<{
      title?: string;
      author_name?: string;
      thumbnail_url?: string;
    }>(`https://open.spotify.com/oembed?url=${encodeURIComponent(parsed.toString())}`);

    const spotifyArt = sanitizeExternalArtworkUrl(spotifyOembed?.thumbnail_url);
    const fallbackArt = '/src/assets/images/cover_boom_bap_1795418328317.jpg';
    const artworkUrl = spotifyArt || fallbackArt;

    return {
      track: {
        id: `sp-${crypto.randomUUID()}`,
        title:
          cleanCustomTitle ||
          (spotifyOembed?.title ? String(spotifyOembed.title).trim().slice(0, 80) : '') ||
          'Spotify Track Cue',
        artist:
          cleanCustomArtist ||
          (spotifyOembed?.author_name
            ? `${String(spotifyOembed.author_name).trim().slice(0, 52)} · Spotify`
            : 'Spotify (Account / DRM Required)'),
        durationSec: 180,
        bpm: 120,
        sourceType: 'external',
        provider: 'spotify',
        externalUrl: parsed.toString(),
        artworkUrl,
        slideUrls: [artworkUrl],
        addedBy,
        addedByDeviceId,
        votes: [],
        addedAt: now,
      },
    };
  }

  // Apple Music URL detection
  if (host === 'music.apple.com') {
    const appleMeta = await fetchAppleMusicMeta(parsed.toString());
    const fallbackArt = '/src/assets/images/cover_boom_bap_1795418328317.jpg';
    const artworkUrl = appleMeta.artworkUrl || fallbackArt;

    return {
      track: {
        id: `am-${crypto.randomUUID()}`,
        title:
          cleanCustomTitle ||
          (appleMeta.title ? appleMeta.title.slice(0, 80) : '') ||
          'Apple Music Track Cue',
        artist:
          cleanCustomArtist ||
          (appleMeta.artist
            ? `${appleMeta.artist.slice(0, 52)} · Apple Music`
            : 'Apple Music (Subscription Required)'),
        durationSec: 180,
        bpm: 120,
        sourceType: 'external',
        provider: 'apple_music',
        externalUrl: parsed.toString(),
        artworkUrl,
        slideUrls: [artworkUrl],
        addedBy,
        addedByDeviceId,
        votes: [],
        addedAt: now,
      },
    };
  }

  // SoundCloud oEmbed metadata resolution on trusted host
  let soundcloudArt: string | undefined;
  let soundcloudTitle: string | undefined;
  let soundcloudArtist: string | undefined;
  if (host === 'soundcloud.com' || host === 'www.soundcloud.com') {
    const scOembed = await fetchJsonWithTimeout<{
      title?: string;
      author_name?: string;
      thumbnail_url?: string;
    }>(`https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(parsed.toString())}`);
    soundcloudArt = sanitizeExternalArtworkUrl(scOembed?.thumbnail_url);
    soundcloudTitle = scOembed?.title ? String(scOembed.title).trim().slice(0, 80) : undefined;
    soundcloudArtist = scOembed?.author_name
      ? String(scOembed.author_name).trim().slice(0, 80)
      : undefined;
  }

  // Direct audio URL
  const fileLeaf = decodeURIComponent(parsed.pathname.split('/').pop() || '').replace(/\.[^/.]+$/, '');
  const provider: MusicProvider = 'direct_url';
  const directArt = soundcloudArt || '/src/assets/images/cover_808_afterhours_1795418328427.jpg';
  return {
    track: {
      id: `url-${crypto.randomUUID()}`,
      title: cleanCustomTitle || soundcloudTitle || fileLeaf.slice(0, 80) || 'Direct Audio Stream',
      artist: cleanCustomArtist || soundcloudArtist || host,
      durationSec: 180,
      bpm: 120,
      sourceType: 'external',
      provider,
      mediaUrl: parsed.toString(),
      externalUrl: parsed.toString(),
      artworkUrl: directArt,
      slideUrls: [directArt],
      addedBy,
      addedByDeviceId,
      votes: [],
      addedAt: now,
    },
  };
}

function sendJson(ws: WebSocket, payload: ServerWsMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastRoomState(room: RoomState) {
  const sockets = roomSockets.get(room.roomId);
  if (!sockets) return;
  for (const client of sockets) {
    const meta = socketMeta.get(client);
    sendJson(client, {
      type: 'room:state',
      state: room,
      yourDeviceId: meta?.deviceId ?? '',
    });
  }
}

function finalizeDeviceRemoval(record: InternalRoomRecord, deviceId: string, reasonText: string) {
  const room = record.state;
  const target = room.devices.find((d) => d.id === deviceId);
  if (!target) return;

  room.devices = room.devices.filter((d) => d.id !== deviceId);
  if (room.hostDeviceId === deviceId) {
    const nextHost = room.devices.find((d) => d.online) ?? room.devices[0];
    room.hostDeviceId = nextHost?.id ?? '';
    room.devices = room.devices.map((d) => ({
      ...d,
      isHost: d.id === room.hostDeviceId,
    }));
    if (nextHost) {
      appendSystemChat(room, `${target.name} ${reasonText}. Host transferred to ${nextHost.name}.`);
    } else {
      appendSystemChat(room, `${target.name} ${reasonText}.`);
    }
  } else {
    appendSystemChat(room, `${target.name} ${reasonText}.`);
  }

  if (room.devices.length === 0) {
    record.emptySince = Date.now();
    room.isPlaying = false;
  }

  room.updatedAt = Date.now();
  broadcastRoomState(room);
}

function handleSocketDisconnect(ws: WebSocket, explicitLeave: boolean) {
  const meta = socketMeta.get(ws);
  if (!meta || !meta.roomId || !meta.deviceId) return;

  const { roomId, deviceId } = meta;
  const sockets = roomSockets.get(roomId);
  if (sockets) {
    sockets.delete(ws);
    if (sockets.size === 0) {
      roomSockets.delete(roomId);
    }
  }

  meta.roomId = null;
  meta.deviceId = null;

  const record = rooms.get(roomId);
  if (!record) return;
  const room = record.state;

  // Check if another active socket already replaced this deviceId (e.g., quick reconnect)
  const stillConnectedElsewhere = Array.from(roomSockets.get(roomId) ?? []).some(
    (other) => socketMeta.get(other)?.deviceId === deviceId,
  );
  if (stillConnectedElsewhere) return;

  if (explicitLeave) {
    const existingTimer = record.disconnectTimers.get(deviceId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      record.disconnectTimers.delete(deviceId);
    }
    finalizeDeviceRemoval(record, deviceId, 'left the room');
    return;
  }

  const device = room.devices.find((d) => d.id === deviceId);
  if (device) {
    device.online = false;
    device.lastSeenAt = Date.now();
    room.updatedAt = Date.now();
    broadcastRoomState(room);

    const existingTimer = record.disconnectTimers.get(deviceId);
    if (existingTimer) clearTimeout(existingTimer);

    const timer = setTimeout(() => {
      record.disconnectTimers.delete(deviceId);
      const currentRecord = rooms.get(roomId);
      if (!currentRecord) return;
      const dev = currentRecord.state.devices.find((d) => d.id === deviceId);
      if (dev && !dev.online) {
        finalizeDeviceRemoval(currentRecord, deviceId, 'disconnected');
      }
    }, DISCONNECT_GRACE_MS);

    record.disconnectTimers.set(deviceId, timer);
  }
}

export const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '256kb' }));

async function startServer() {

  // Periodic cleanup of expired empty rooms & old uploaded media buffers
  setInterval(() => {
    const now = Date.now();
    for (const [roomId, record] of rooms.entries()) {
      if (record.state.devices.length === 0 && record.emptySince && now - record.emptySince > EMPTY_ROOM_TTL_MS) {
        for (const t of record.disconnectTimers.values()) clearTimeout(t);
        rooms.delete(roomId);
      }
    }
    for (const [mediaId, media] of uploadedMedia.entries()) {
      if (now - media.createdAt > MEDIA_TTL_MS) {
        uploadedMedia.delete(mediaId);
      }
    }
  }, 60_000).unref();

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, activeRooms: rooms.size });
  });

  // Public room directory (never exposes private rooms or secrets)
  app.get('/api/rooms', (_req, res) => {
    const list: PublicRoomSummary[] = [];
    for (const record of rooms.values()) {
      const r = record.state;
      if (r.visibility !== 'public') continue;
      const activeTrack = r.queue[r.currentTrackIndex];
      list.push({
        roomId: r.roomId,
        roomName: r.roomName,
        visibility: r.visibility,
        hasPassword: r.hasPassword,
        memberCount: r.devices.filter((d) => d.online).length,
        maxCapacity: r.maxCapacity,
        isPlaying: r.isPlaying,
        currentTrackTitle: activeTrack?.title ?? 'No Track',
        controlMode: r.controlMode,
      });
    }
    list.sort((a, b) => b.memberCount - a.memberCount);
    res.json({ rooms: list.slice(0, 24) });
  });

  app.post('/api/rooms', (req, res) => {
    const clientIp = req.ip || 'unknown';
    if (checkIpRateLimit(clientIp, 'create_room', 12, 60_000)) {
      res.status(429).json({ error: 'Too many rooms created. Please wait a minute.' });
      return;
    }

    const body = (req.body ?? {}) as {
      roomName?: unknown;
      visibility?: unknown;
      password?: unknown;
      maxCapacity?: unknown;
      controlMode?: unknown;
    };

    const roomName = typeof body.roomName === 'string' ? body.roomName : '';
    const visibility: RoomVisibility = body.visibility === 'private' ? 'private' : 'public';
    const password = typeof body.password === 'string' ? body.password.slice(0, 64) : '';
    const maxCapacity = Number(body.maxCapacity);
    const controlMode: ControlMode = body.controlMode === 'host_only' ? 'host_only' : 'collaborative';

    const record = createRoomRecord({
      roomName,
      visibility,
      password,
      maxCapacity: Number.isFinite(maxCapacity) ? maxCapacity : 16,
      controlMode,
    });
    rooms.set(record.state.roomId, record);

    if (record.state.hasPassword) {
      const cookieVal = signRoomCookie(record.state.roomId);
      res.cookie(`sb_auth_${record.state.roomId}`, cookieVal, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        partitioned: true,
        maxAge: 12 * 60 * 60 * 1000,
      });
    }

    res.status(201).json({
      roomId: record.state.roomId,
      roomName: record.state.roomName,
      visibility: record.state.visibility,
      hasPassword: record.state.hasPassword,
      maxCapacity: record.state.maxCapacity,
      controlMode: record.state.controlMode,
    });
  });

  app.get('/api/rooms/:roomId', (req, res) => {
    const code = normalizeRoomCode(req.params.roomId);
    if (code.length < 4) {
      res.status(400).json({ error: 'Room code must be 4–10 alphanumeric characters.' });
      return;
    }
    const record = rooms.get(code);
    if (!record) {
      res.status(404).json({ error: `Room "${code}" was not found or has expired.`, roomId: code });
      return;
    }
    const r = record.state;
    const cookies = parseCookies(req.headers.cookie);
    const authToken = cookies[`sb_auth_${code}`];
    const authorized = !r.hasPassword || (authToken ? verifyRoomCookie(authToken, code) : false);

    res.json({
      roomId: r.roomId,
      roomName: r.roomName,
      visibility: r.visibility,
      hasPassword: r.hasPassword,
      authorized,
      memberCount: r.devices.length,
      maxCapacity: r.maxCapacity,
      isPlaying: r.isPlaying,
      controlMode: r.controlMode,
    });
  });

  app.post('/api/rooms/:roomId/verify', (req, res) => {
    const clientIp = req.ip || 'unknown';
    if (checkIpRateLimit(clientIp, 'verify_room', 12, 60_000)) {
      res.status(429).json({ error: 'Too many password attempts. Please wait a minute.' });
      return;
    }

    const code = normalizeRoomCode(req.params.roomId);
    const record = rooms.get(code);
    if (!record) {
      res.status(404).json({ error: `Room "${code}" was not found or has expired.` });
      return;
    }

    if (record.state.devices.length >= record.state.maxCapacity) {
      res.status(403).json({ error: `Room "${code}" is at full capacity (${record.state.maxCapacity} speakers).` });
      return;
    }

    if (record.state.hasPassword && record.passwordSalt && record.passwordHash) {
      const provided = typeof req.body?.password === 'string' ? req.body.password : '';
      if (!verifyPassword(provided, record.passwordSalt, record.passwordHash)) {
        res.status(401).json({ error: 'Incorrect room password.' });
        return;
      }
    }

    const cookieVal = signRoomCookie(code);
    res.cookie(`sb_auth_${code}`, cookieVal, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      partitioned: true,
      maxAge: 12 * 60 * 60 * 1000,
    });

    res.json({ authorized: true, roomId: code });
  });

  app.post(
    '/api/rooms/:roomId/upload',
    express.raw({
      type: ['audio/*', 'application/octet-stream'],
      limit: '25mb',
    }),
    (req, res) => {
      const code = normalizeRoomCode(req.params.roomId);
      const record = rooms.get(code);
      if (!record) {
        res.status(404).json({ error: 'Room not found.' });
        return;
      }
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        res.status(400).json({ error: 'Empty audio payload.' });
        return;
      }

      const rawMime = String(req.header('content-type') || 'audio/mpeg').split(';')[0].trim().toLowerCase();
      if (!rawMime.startsWith('audio/') && rawMime !== 'application/octet-stream') {
        res.status(400).json({ error: 'Only audio file uploads are permitted.' });
        return;
      }

      const uploaderDeviceId = String(req.header('x-device-id') || '').slice(0, 64);
      const isMember = record.state.devices.some((d) => d.id === uploaderDeviceId);
      if (!isMember) {
        res.status(403).json({ error: 'Only joined room members can upload tracks.' });
        return;
      }

      if (record.state.controlMode === 'host_only' && record.state.hostDeviceId !== uploaderDeviceId) {
        res.status(403).json({ error: 'Host-only playback mode is active for this room.' });
        return;
      }

      // Enforce total media buffer cap
      let totalBytes = 0;
      for (const m of uploadedMedia.values()) totalBytes += m.buffer.length;
      while (totalBytes + req.body.length > MAX_MEDIA_BYTES && uploadedMedia.size > 0) {
        const oldestKey = uploadedMedia.keys().next().value;
        if (!oldestKey) break;
        const removed = uploadedMedia.get(oldestKey);
        if (removed) totalBytes -= removed.buffer.length;
        uploadedMedia.delete(oldestKey);
      }

      const rawTitle = safeDecode(String(req.header('x-track-title') || 'Uploaded Track')).trim().slice(0, 80);
      const rawArtist = safeDecode(String(req.header('x-track-artist') || 'Room Upload')).trim().slice(0, 80);
      const rawAddedBy = safeDecode(String(req.header('x-added-by') || 'Participant')).trim().slice(0, 40);
      const rawDuration = Number(req.header('x-track-duration') || 180);
      const durationSec = Number.isFinite(rawDuration) && rawDuration > 0 ? Math.round(rawDuration) : 180;

      const mediaId = crypto.randomUUID();
      uploadedMedia.set(mediaId, {
        id: mediaId,
        mimeType: rawMime === 'application/octet-stream' ? 'audio/mpeg' : rawMime,
        buffer: req.body,
        createdAt: Date.now(),
      });

      const uploadArtwork = '/src/assets/images/cover_808_afterhours_1795418328427.jpg';
      const newTrack: Track = {
        id: `upload-${mediaId}`,
        title: rawTitle || 'Uploaded Track',
        artist: rawArtist || 'Room Upload',
        durationSec,
        bpm: 120,
        sourceType: 'uploaded',
        provider: 'uploaded',
        mediaUrl: `/api/media/${mediaId}`,
        artworkUrl: uploadArtwork,
        slideUrls: [uploadArtwork],
        addedBy: rawAddedBy || 'Participant',
        addedByDeviceId: uploaderDeviceId,
        votes: [],
        addedAt: Date.now(),
      };

      record.state.queue.push(newTrack);
      record.state.updatedAt = Date.now();
      appendSystemChat(record.state, `${newTrack.addedBy} uploaded "${newTrack.title}".`);
      broadcastRoomState(record.state);

      res.status(201).json({ track: newTrack });
    },
  );

  app.get('/api/media/:mediaId', (req, res) => {
    const media = uploadedMedia.get(req.params.mediaId);
    if (!media) {
      res.status(404).json({ error: 'Audio track expired or not found.' });
      return;
    }

    const total = media.buffer.length;
    const range = req.headers.range;
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', media.mimeType);
    res.setHeader('Cache-Control', 'public, max-age=3600');

    if (range) {
      const match = /bytes=(\d+)-(\d*)/.exec(range);
      if (match) {
        const start = Number(match[1]);
        const end = match[2] ? Math.min(Number(match[2]), total - 1) : total - 1;
        if (start >= total || start > end) {
          res.status(416).setHeader('Content-Range', `bytes */${total}`).end();
          return;
        }
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
        res.setHeader('Content-Length', String(end - start + 1));
        res.end(media.buffer.subarray(start, end + 1));
        return;
      }
    }

    res.setHeader('Content-Length', String(total));
    res.end(media.buffer);
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const cookies = parseCookies(req.headers.cookie);
    const clientIp = req.socket.remoteAddress || 'unknown';
    socketMeta.set(ws, {
      ws,
      roomId: null,
      deviceId: null,
      ip: clientIp,
      chatTimestamps: [],
      actionTimestamps: [],
    });

    ws.on('message', async (rawData) => {
      try {
        if (Buffer.byteLength(rawData as Buffer) > 16_384) {
          sendJson(ws, { type: 'room:error', message: 'Payload too large.' });
          return;
        }

      let msg: ClientWsMessage;
      try {
        msg = JSON.parse(rawData.toString()) as ClientWsMessage;
      } catch {
        return;
      }

      if (msg.type === 'sync:ping') {
        sendJson(ws, {
          type: 'sync:pong',
          clientTime: msg.clientTime,
          serverTime: Date.now(),
        });
        return;
      }

      const meta = socketMeta.get(ws);
      if (!meta) return;

      if (msg.type === 'room:join') {
        const code = normalizeRoomCode(msg.roomId);
        if (code.length < 4) {
          sendJson(ws, {
            type: 'room:error',
            code: 'INVALID_ROOM',
            message: 'Room code must be 4–10 alphanumeric characters.',
          });
          return;
        }

        const record = rooms.get(code);
        if (!record) {
          sendJson(ws, {
            type: 'room:error',
            code: 'ROOM_NOT_FOUND',
            message: `Room "${code}" does not exist or has expired.`,
          });
          return;
        }

        const deviceId = String(msg.deviceId || '').trim().slice(0, 64) || crypto.randomUUID();

        if (record.kickedDeviceIds.has(deviceId)) {
          sendJson(ws, {
            type: 'room:kicked',
            reason: 'You were removed from this room by the host.',
          });
          return;
        }

        // Verify password if room requires one (either via HttpOnly cookie or explicit password payload)
        if (record.state.hasPassword && record.passwordSalt && record.passwordHash) {
          const cookieVal = cookies[`sb_auth_${code}`];
          const cookieOk = cookieVal ? verifyRoomCookie(cookieVal, code) : false;
          const passwordOk =
            typeof msg.password === 'string' &&
            verifyPassword(msg.password, record.passwordSalt, record.passwordHash);

          if (!cookieOk && !passwordOk) {
            sendJson(ws, {
              type: 'room:error',
              code: 'PASSWORD_REQUIRED',
              message: 'This room is password-protected.',
            });
            return;
          }
        }

        const room = record.state;
        const existingIdx = room.devices.findIndex((d) => d.id === deviceId);

        if (existingIdx === -1 && room.devices.length >= room.maxCapacity) {
          sendJson(ws, {
            type: 'room:error',
            code: 'ROOM_FULL',
            message: `Room "${code}" is at full capacity (${room.maxCapacity} speakers).`,
          });
          return;
        }

        if (meta.roomId && meta.roomId !== code) {
          handleSocketDisconnect(ws, true);
        }

        const pendingTimer = record.disconnectTimers.get(deviceId);
        if (pendingTimer) {
          clearTimeout(pendingTimer);
          record.disconnectTimers.delete(deviceId);
        }

        record.emptySince = null;

        if (!room.hostDeviceId || room.devices.length === 0) {
          room.hostDeviceId = deviceId;
        }

        const cleanName = String(msg.deviceName || '').trim().slice(0, 40) || 'Browser Speaker';
        const cleanPlatform = String(msg.platform || '').trim().slice(0, 32) || 'Web';
        const now = Date.now();

        const deviceEntry: RoomDevice = {
          id: deviceId,
          name: cleanName,
          platform: cleanPlatform,
          rttMs: existingIdx >= 0 ? room.devices[existingIdx].rttMs : 14,
          offsetMs: existingIdx >= 0 ? room.devices[existingIdx].offsetMs : 0,
          driftMs: existingIdx >= 0 ? room.devices[existingIdx].driftMs : 0,
          audioReady: false,
          isHost: room.hostDeviceId === deviceId,
          online: true,
          joinedAt: existingIdx >= 0 ? room.devices[existingIdx].joinedAt : now,
          lastSeenAt: now,
        };

        if (existingIdx >= 0) {
          room.devices[existingIdx] = deviceEntry;
        } else {
          room.devices.push(deviceEntry);
          appendSystemChat(room, `${cleanName} joined the room.`);
        }

        meta.roomId = code;
        meta.deviceId = deviceId;
        let sockets = roomSockets.get(code);
        if (!sockets) {
          sockets = new Set();
          roomSockets.set(code, sockets);
        }
        sockets.add(ws);

        room.updatedAt = now;
        broadcastRoomState(room);
        return;
      }

      // Every subsequent message requires active verified room membership
      if (!meta.roomId || !meta.deviceId) {
        sendJson(ws, {
          type: 'room:error',
          message: 'Join a room before sending room actions.',
        });
        return;
      }

      const record = rooms.get(meta.roomId);
      if (!record) return;
      const room = record.state;
      const member = room.devices.find((d) => d.id === meta.deviceId);
      if (!member) {
        sendJson(ws, { type: 'room:error', message: 'Session expired. Rejoining...' });
        return;
      }

      if (msg.type === 'room:leave') {
        handleSocketDisconnect(ws, true);
        return;
      }

      if (msg.type === 'device:telemetry') {
        member.rttMs = Math.max(0, Math.min(5000, Math.round(Number(msg.rttMs) || 0)));
        member.offsetMs = Math.max(-60000, Math.min(60000, Math.round(Number(msg.offsetMs) || 0)));
        member.driftMs = Math.round((Number(msg.driftMs) || 0) * 10) / 10;
        member.audioReady = Boolean(msg.audioReady);
        member.lastSeenAt = Date.now();
        room.updatedAt = Date.now();
        broadcastRoomState(room);
        return;
      }

      // Rate-limit chat & state mutations
      if (msg.type === 'chat:send') {
        if (isRateLimited(meta.chatTimestamps, 6, 5000)) {
          sendJson(ws, { type: 'room:error', message: 'Slow down — too many chat messages.' });
          return;
        }
        const cleanText = String(msg.text || '').trim().slice(0, 400);
        if (!cleanText) return;
        const chatEntry: ChatMessage = {
          id: crypto.randomUUID(),
          deviceId: member.id,
          senderName: member.name,
          text: cleanText,
          timestamp: Date.now(),
        };
        room.chat.push(chatEntry);
        if (room.chat.length > MAX_CHAT_HISTORY) {
          room.chat = room.chat.slice(-MAX_CHAT_HISTORY);
        }
        room.updatedAt = Date.now();
        broadcastRoomState(room);
        return;
      }

      if (isRateLimited(meta.actionTimestamps, 20, 5000)) {
        sendJson(ws, { type: 'room:error', message: 'Rate limit exceeded. Wait a moment.' });
        return;
      }

      const isHost = room.hostDeviceId === member.id;
      const canControlPlayback = room.controlMode === 'collaborative' || isHost;
      const now = Date.now();

      switch (msg.type) {
        case 'playback:play': {
          if (!canControlPlayback) {
            sendJson(ws, { type: 'room:error', message: 'Only the host can control playback in this room.' });
            return;
          }
          if (room.queue.length === 0) {
            sendJson(ws, { type: 'room:error', message: 'Add a track to the playlist first.' });
            return;
          }
          const currentPos =
            typeof msg.positionSec === 'number' && Number.isFinite(msg.positionSec)
              ? Math.max(0, msg.positionSec)
              : computeCurrentPositionSec(room, now);
          room.isPlaying = true;
          room.anchorPositionSec = currentPos;
          room.anchorServerTime = now + SCHEDULE_LEAD_MS;
          room.updatedAt = now;
          broadcastRoomState(room);
          break;
        }
        case 'playback:pause': {
          if (!canControlPlayback) {
            sendJson(ws, { type: 'room:error', message: 'Only the host can pause playback in this room.' });
            return;
          }
          const pos = Number.isFinite(msg.positionSec)
            ? Math.max(0, msg.positionSec)
            : computeCurrentPositionSec(room, now);
          room.isPlaying = false;
          room.anchorPositionSec = pos;
          room.anchorServerTime = now;
          room.updatedAt = now;
          broadcastRoomState(room);
          break;
        }
        case 'playback:seek': {
          if (!canControlPlayback) {
            sendJson(ws, { type: 'room:error', message: 'Only the host can seek in this room.' });
            return;
          }
          const currentTrack = room.queue[room.currentTrackIndex];
          const maxDuration = currentTrack ? currentTrack.durationSec : 1000;
          const targetPos = Math.max(0, Math.min(maxDuration, Number(msg.positionSec) || 0));
          room.anchorPositionSec = targetPos;
          room.anchorServerTime = room.isPlaying ? now + SCHEDULE_LEAD_MS : now;
          room.updatedAt = now;
          broadcastRoomState(room);
          break;
        }
        case 'queue:select': {
          if (!canControlPlayback) {
            sendJson(ws, { type: 'room:error', message: 'Only the host can switch tracks in this room.' });
            return;
          }
          if (msg.index < 0 || msg.index >= room.queue.length) return;
          room.currentTrackIndex = msg.index;
          room.anchorPositionSec = 0;
          room.isPlaying = msg.autoPlay ?? true;
          room.anchorServerTime = room.isPlaying ? now + SCHEDULE_LEAD_MS : now;
          room.updatedAt = now;
          broadcastRoomState(room);
          break;
        }
        case 'queue:add_builtin': {
          if (room.controlMode === 'host_only' && !isHost) {
            sendJson(ws, { type: 'room:error', message: 'Only the host can add tracks in host-only mode.' });
            return;
          }
          const preset = BUILTIN_CATALOG[msg.builtinKey];
          if (!preset) return;
          const dup = room.queue.some((t) => t.builtinKey === msg.builtinKey);
          if (dup) {
            sendJson(ws, { type: 'room:error', message: `"${preset.title}" is already in the playlist.` });
            return;
          }
          const newTrack: Track = {
            ...preset,
            slideUrls: preset.artworkUrl ? [preset.artworkUrl] : [],
            id: `builtin-${msg.builtinKey}-${now}`,
            addedBy: member.name,
            addedByDeviceId: member.id,
            votes: [],
            addedAt: now,
          };
          room.queue.push(newTrack);
          reorderUpcomingByVotes(room);
          appendSystemChat(room, `${member.name} added "${newTrack.title}".`);
          room.updatedAt = now;
          broadcastRoomState(room);
          break;
        }
        case 'queue:add_url': {
          if (room.controlMode === 'host_only' && !isHost) {
            sendJson(ws, { type: 'room:error', message: 'Only the host can add tracks in host-only mode.' });
            return;
          }
          const targetRoomId = meta.roomId;
          const memberId = member.id;
          const memberName = member.name;
          const result = await parseProviderTrackFromUrl(
            msg.url,
            memberName,
            memberId,
            msg.title,
            msg.artist,
          );
          if (ws.readyState !== WebSocket.OPEN) return;
          const latestRecord = rooms.get(targetRoomId);
          if (!latestRecord) return;
          const latestRoom = latestRecord.state;
          if (!latestRoom.devices.some((d) => d.id === memberId)) return;

          if (result.error || !result.track) {
            sendJson(ws, { type: 'room:error', message: result.error || 'Unsupported track URL.' });
            return;
          }
          const candidate = result.track;
          const isDup = latestRoom.queue.some(
            (t) =>
              (candidate.youtubeId && t.youtubeId === candidate.youtubeId) ||
              (candidate.externalUrl && t.externalUrl === candidate.externalUrl),
          );
          if (isDup) {
            sendJson(ws, { type: 'room:error', message: 'That track is already in the playlist.' });
            return;
          }
          latestRoom.queue.push(candidate);
          reorderUpcomingByVotes(latestRoom);
          appendSystemChat(latestRoom, `${memberName} added "${candidate.title}".`);
          latestRoom.updatedAt = Date.now();
          broadcastRoomState(latestRoom);
          break;
        }
        case 'queue:vote': {
          const idx = room.queue.findIndex((t) => t.id === msg.trackId);
          if (idx === -1) return;
          const track = room.queue[idx];
          const existingVote = track.votes.indexOf(member.id);
          if (existingVote >= 0) {
            track.votes.splice(existingVote, 1);
          } else {
            track.votes.push(member.id);
          }
          reorderUpcomingByVotes(room);
          room.updatedAt = now;
          broadcastRoomState(room);
          break;
        }
        case 'queue:remove': {
          const idx = room.queue.findIndex((t) => t.id === msg.trackId);
          if (idx === -1) return;
          const targetTrack = room.queue[idx];
          const canRemove = isHost || (room.controlMode === 'collaborative' && targetTrack.addedByDeviceId === member.id);
          if (!canRemove) {
            sendJson(ws, {
              type: 'room:error',
              message: 'You can only remove songs you added (or ask the host).',
            });
            return;
          }

          room.queue.splice(idx, 1);
          if (room.queue.length === 0) {
            room.currentTrackIndex = 0;
            room.isPlaying = false;
            room.anchorPositionSec = 0;
            room.anchorServerTime = now;
          } else if (idx === room.currentTrackIndex) {
            room.currentTrackIndex = Math.min(idx, room.queue.length - 1);
            room.anchorPositionSec = 0;
            room.anchorServerTime = room.isPlaying ? now + SCHEDULE_LEAD_MS : now;
          } else if (idx < room.currentTrackIndex) {
            room.currentTrackIndex -= 1;
          }
          room.updatedAt = now;
          broadcastRoomState(room);
          break;
        }
        case 'device:rename': {
          const clean = String(msg.name || '').trim().slice(0, 40);
          if (!clean) return;
          member.name = clean;
          room.updatedAt = now;
          broadcastRoomState(room);
          break;
        }
        case 'host:transfer': {
          if (!isHost) {
            sendJson(ws, { type: 'room:error', message: 'Only the current host can transfer host role.' });
            return;
          }
          const target = room.devices.find((d) => d.id === msg.targetDeviceId);
          if (!target || target.id === member.id) return;
          room.hostDeviceId = target.id;
          room.devices = room.devices.map((d) => ({ ...d, isHost: d.id === target.id }));
          appendSystemChat(room, `${member.name} transferred host permissions to ${target.name}.`);
          room.updatedAt = now;
          broadcastRoomState(room);
          break;
        }
        case 'member:kick': {
          if (!isHost) {
            sendJson(ws, { type: 'room:error', message: 'Only the host can remove members.' });
            return;
          }
          if (msg.targetDeviceId === member.id) return;
          const target = room.devices.find((d) => d.id === msg.targetDeviceId);
          if (!target) return;

          record.kickedDeviceIds.add(target.id);
          const sockets = roomSockets.get(room.roomId);
          if (sockets) {
            for (const client of sockets) {
              const clientMeta = socketMeta.get(client);
              if (clientMeta?.deviceId === target.id) {
                sendJson(client, {
                  type: 'room:kicked',
                  reason: `You were removed from ${room.roomName} by the host.`,
                });
                clientMeta.roomId = null;
                clientMeta.deviceId = null;
                sockets.delete(client);
              }
            }
          }
          finalizeDeviceRemoval(record, target.id, 'was removed by the host');
          break;
        }
        case 'room:settings': {
          if (!isHost) {
            sendJson(ws, { type: 'room:error', message: 'Only the host can change room settings.' });
            return;
          }
          if (msg.controlMode === 'collaborative' || msg.controlMode === 'host_only') {
            room.controlMode = msg.controlMode;
            appendSystemChat(
              room,
              `Control mode set to ${msg.controlMode === 'host_only' ? 'Host-Only' : 'Collaborative'}.`,
            );
          }
          if (typeof msg.maxCapacity === 'number' && Number.isFinite(msg.maxCapacity)) {
            room.maxCapacity = Math.max(room.devices.length, Math.min(50, Math.round(msg.maxCapacity)));
          }
          if (typeof msg.roomName === 'string' && msg.roomName.trim()) {
            room.roomName = msg.roomName.trim().slice(0, 48);
          }
          room.updatedAt = now;
          broadcastRoomState(room);
          break;
        }
      }
      } catch (err) {
        console.error('WebSocket message error:', err);
        sendJson(ws, { type: 'room:error', message: 'Unable to process room action.' });
      }
    });

    ws.on('close', () => {
      handleSocketDisconnect(ws, false);
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  if (!process.env.VERCEL) {
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`SyncBeats server listening on http://localhost:${PORT}`);
    });
  }
}

if (!process.env.VERCEL) {
  startServer().catch((err) => {
    console.error('Failed to start SyncBeats server:', err);
    process.exit(1);
  });
} else {
  void startServer();
}

export default app;
