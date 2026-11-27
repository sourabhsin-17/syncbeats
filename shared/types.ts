export type MusicProvider =
  | 'builtin'
  | 'uploaded'
  | 'direct_url'
  | 'youtube'
  | 'spotify'
  | 'apple_music';

export type BuiltinBeatKey =
  | 'afterhours'
  | 'boombap'
  | 'cypher'
  | 'lofi'
  | 'drill'
  | 'golden';

export type RoomVisibility = 'public' | 'private';
export type ControlMode = 'collaborative' | 'host_only';

export interface Track {
  id: string;
  title: string;
  artist: string;
  durationSec: number;
  bpm: number;
  sourceType: 'builtin' | 'uploaded' | 'external';
  provider: MusicProvider;
  builtinKey?: BuiltinBeatKey;
  mediaUrl?: string;
  externalUrl?: string;
  youtubeId?: string;
  artworkUrl?: string;
  slideUrls?: string[];
  addedBy: string;
  addedByDeviceId: string;
  votes: string[];
  addedAt: number;
}

export interface RoomDevice {
  id: string;
  name: string;
  platform: string;
  rttMs: number;
  offsetMs: number;
  driftMs: number;
  audioReady: boolean;
  isHost: boolean;
  online: boolean;
  joinedAt: number;
  lastSeenAt: number;
}

export interface ChatMessage {
  id: string;
  deviceId: string;
  senderName: string;
  text: string;
  timestamp: number;
  system?: boolean;
}

export interface RoomState {
  roomId: string;
  roomName: string;
  visibility: RoomVisibility;
  hasPassword: boolean;
  maxCapacity: number;
  controlMode: ControlMode;
  hostDeviceId: string;
  queue: Track[];
  currentTrackIndex: number;
  isPlaying: boolean;
  anchorServerTime: number;
  anchorPositionSec: number;
  devices: RoomDevice[];
  chat: ChatMessage[];
  updatedAt: number;
}

export interface PublicRoomSummary {
  roomId: string;
  roomName: string;
  visibility: RoomVisibility;
  hasPassword: boolean;
  memberCount: number;
  maxCapacity: number;
  isPlaying: boolean;
  currentTrackTitle: string;
  controlMode: ControlMode;
}

export type ClientWsMessage =
  | { type: 'sync:ping'; clientTime: number }
  | {
      type: 'room:join';
      roomId: string;
      deviceId: string;
      deviceName: string;
      platform: string;
      password?: string;
    }
  | { type: 'room:leave' }
  | { type: 'playback:play'; positionSec?: number }
  | { type: 'playback:pause'; positionSec: number }
  | { type: 'playback:seek'; positionSec: number }
  | { type: 'queue:select'; index: number; autoPlay?: boolean }
  | { type: 'queue:add_builtin'; builtinKey: BuiltinBeatKey }
  | { type: 'queue:add_url'; url: string; title?: string; artist?: string }
  | { type: 'queue:vote'; trackId: string }
  | { type: 'queue:remove'; trackId: string }
  | { type: 'track:duration'; trackId: string; durationSec: number }
  | { type: 'device:rename'; name: string }
  | {
      type: 'device:telemetry';
      rttMs: number;
      offsetMs: number;
      driftMs: number;
      audioReady: boolean;
    }
  | { type: 'chat:send'; text: string }
  | { type: 'host:transfer'; targetDeviceId: string }
  | { type: 'member:kick'; targetDeviceId: string }
  | { type: 'room:settings'; controlMode?: ControlMode; maxCapacity?: number; roomName?: string };

export type ServerWsMessage =
  | { type: 'sync:pong'; clientTime: number; serverTime: number }
  | { type: 'room:state'; state: RoomState; yourDeviceId: string }
  | { type: 'room:error'; message: string; code?: string }
  | { type: 'room:kicked'; reason: string };
