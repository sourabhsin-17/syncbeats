import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  BuiltinBeatKey,
  ClientWsMessage,
  ControlMode,
  RoomState,
  ServerWsMessage,
} from '../../shared/types';

interface ClockSample {
  rtt: number;
  offset: number;
}

function detectPlatformLabel(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS Safari';
  if (/Android/i.test(ua)) return 'Android';
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macOS';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'Web Browser';
}

function getDefaultDeviceName(): string {
  const stored = sessionStorage.getItem('syncbeats_device_name');
  if (stored) return stored;
  const platform = detectPlatformLabel();
  const suffix = Math.floor(10 + Math.random() * 89);
  const name = `${platform} Speaker ${suffix}`;
  sessionStorage.setItem('syncbeats_device_name', name);
  return name;
}

function getSessionDeviceId(): string {
  const existing = sessionStorage.getItem('syncbeats_device_id');
  if (existing) return existing;
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  sessionStorage.setItem('syncbeats_device_id', id);
  return id;
}

export function useSyncRoom(roomId: string) {
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [kickedReason, setKickedReason] = useState<string | null>(null);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [rttMs, setRttMs] = useState(14);
  const [deviceId] = useState<string>(() => getSessionDeviceId());
  const [localDeviceName, setLocalDeviceName] = useState<string>(() => getDefaultDeviceName());
  const [uploadToken, setUploadToken] = useState<string>('');

  const wsRef = useRef<WebSocket | null>(null);
  const samplesRef = useRef<ClockSample[]>([]);
  const reconnectTimerRef = useRef<number | null>(null);
  const pingIntervalRef = useRef<number | null>(null);
  const unmountedRef = useRef(false);
  const stopReconnectRef = useRef(false);
  const pendingPasswordRef = useRef<string | undefined>(undefined);
  const localDeviceNameRef = useRef(localDeviceName);

  useEffect(() => {
    localDeviceNameRef.current = localDeviceName;
  }, [localDeviceName]);

  const sendMessage = useCallback((msg: ClientWsMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const connect = useCallback(() => {
    if (unmountedRef.current || stopReconnectRef.current || !roomId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (unmountedRef.current) {
        ws.close();
        return;
      }
      setConnected(true);
      samplesRef.current = [];

      for (let i = 0; i < 5; i += 1) {
        window.setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'sync:ping', clientTime: Date.now() }));
          }
        }, i * 80);
      }

      ws.send(
        JSON.stringify({
          type: 'room:join',
          roomId,
          deviceId,
          deviceName: localDeviceNameRef.current,
          platform: detectPlatformLabel(),
          password: pendingPasswordRef.current,
        } satisfies ClientWsMessage),
      );

      if (pingIntervalRef.current !== null) {
        clearInterval(pingIntervalRef.current);
      }
      pingIntervalRef.current = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'sync:ping', clientTime: Date.now() }));
        }
      }, 4000);
    };

    ws.onmessage = (event) => {
      let msg: ServerWsMessage;
      try {
        msg = JSON.parse(event.data as string) as ServerWsMessage;
      } catch {
        return;
      }

      if (msg.type === 'sync:pong') {
        const now = Date.now();
        const rtt = Math.max(0, now - msg.clientTime);
        const offset = msg.serverTime - (msg.clientTime + rtt / 2);

        const next = [...samplesRef.current, { rtt, offset }].slice(-8);
        samplesRef.current = next;

        const sortedByRtt = [...next].sort((a, b) => a.rtt - b.rtt);
        const bestSlice = sortedByRtt.slice(0, Math.min(3, sortedByRtt.length));
        const avgOffset = bestSlice.reduce((acc, s) => acc + s.offset, 0) / bestSlice.length;
        const bestRtt = sortedByRtt[0]?.rtt ?? rtt;

        setClockOffsetMs(Math.round(avgOffset));
        setRttMs(Math.round(bestRtt));
        return;
      }

      if (msg.type === 'room:state') {
        setRoomState(msg.state);
        if (typeof msg.yourUploadToken === 'string') {
          setUploadToken(msg.yourUploadToken);
        }
        setPasswordRequired(false);
        setError(null);
        setErrorCode(null);
        pendingPasswordRef.current = undefined;
        return;
      }

      if (msg.type === 'room:kicked') {
        stopReconnectRef.current = true;
        setKickedReason(msg.reason);
        setRoomState(null);
        setUploadToken('');
        ws.close();
        return;
      }

      if (msg.type === 'room:error') {
        setError(msg.message);
        setErrorCode(msg.code ?? null);
        if (msg.code === 'PASSWORD_REQUIRED') {
          setPasswordRequired(true);
          stopReconnectRef.current = true;
        }
        if (msg.code === 'ROOM_NOT_FOUND' || msg.code === 'INVALID_ROOM' || msg.code === 'ROOM_FULL') {
          stopReconnectRef.current = true;
        }
      }
    };

    ws.onclose = () => {
      setConnected(false);
      if (pingIntervalRef.current !== null) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      if (!unmountedRef.current && !stopReconnectRef.current) {
        reconnectTimerRef.current = window.setTimeout(() => {
          connect();
        }, 1500);
      }
    };
  }, [deviceId, roomId]);

  useEffect(() => {
    unmountedRef.current = false;
    stopReconnectRef.current = false;
    connect();
    return () => {
      unmountedRef.current = true;
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (pingIntervalRef.current !== null) {
        clearInterval(pingIntervalRef.current);
      }
      wsRef.current?.close();
    };
  }, [connect]);

  const submitRoomPassword = useCallback(
    async (password: string): Promise<string | null> => {
      try {
        const resp = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
        });
        if (!resp.ok) {
          const data = (await resp.json().catch(() => ({}))) as { error?: string };
          return data.error || 'Incorrect password.';
        }
        pendingPasswordRef.current = password;
        setPasswordRequired(false);
        setError(null);
        stopReconnectRef.current = false;

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          sendMessage({
            type: 'room:join',
            roomId,
            deviceId,
            deviceName: localDeviceName,
            platform: detectPlatformLabel(),
            password,
          });
        } else {
          connect();
        }
        return null;
      } catch {
        return 'Unable to verify room password.';
      }
    },
    [connect, deviceId, localDeviceName, roomId, sendMessage],
  );

  const leaveRoomExplicitly = useCallback(() => {
    stopReconnectRef.current = true;
    sendMessage({ type: 'room:leave' });
    wsRef.current?.close();
  }, [sendMessage]);

  const play = useCallback(
    (positionSec?: number) => sendMessage({ type: 'playback:play', positionSec }),
    [sendMessage],
  );

  const pause = useCallback(
    (positionSec: number) => sendMessage({ type: 'playback:pause', positionSec }),
    [sendMessage],
  );

  const seek = useCallback(
    (positionSec: number) => sendMessage({ type: 'playback:seek', positionSec }),
    [sendMessage],
  );

  const selectTrack = useCallback(
    (index: number, autoPlay = true) => sendMessage({ type: 'queue:select', index, autoPlay }),
    [sendMessage],
  );

  const addBuiltinTrack = useCallback(
    (builtinKey: BuiltinBeatKey) =>
      sendMessage({ type: 'queue:add_builtin', builtinKey }),
    [sendMessage],
  );

  const addUrlTrack = useCallback(
    (url: string, title?: string, artist?: string) =>
      sendMessage({ type: 'queue:add_url', url, title, artist }),
    [sendMessage],
  );

  const voteTrack = useCallback(
    (trackId: string) => sendMessage({ type: 'queue:vote', trackId }),
    [sendMessage],
  );

  const removeTrack = useCallback(
    (trackId: string) => sendMessage({ type: 'queue:remove', trackId }),
    [sendMessage],
  );

  const renameDevice = useCallback(
    (name: string) => {
      const clean = name.trim().slice(0, 40);
      if (!clean) return;
      sessionStorage.setItem('syncbeats_device_name', clean);
      setLocalDeviceName(clean);
      sendMessage({ type: 'device:rename', name: clean });
    },
    [sendMessage],
  );

  const reportTelemetry = useCallback(
    (driftMs: number, audioReady: boolean) => {
      sendMessage({
        type: 'device:telemetry',
        rttMs,
        offsetMs: clockOffsetMs,
        driftMs,
        audioReady,
      });
    },
    [clockOffsetMs, rttMs, sendMessage],
  );

  const sendChat = useCallback(
    (text: string) => {
      const clean = text.trim();
      if (!clean) return;
      sendMessage({ type: 'chat:send', text: clean });
    },
    [sendMessage],
  );

  const transferHost = useCallback(
    (targetDeviceId: string) => sendMessage({ type: 'host:transfer', targetDeviceId }),
    [sendMessage],
  );

  const kickMember = useCallback(
    (targetDeviceId: string) => sendMessage({ type: 'member:kick', targetDeviceId }),
    [sendMessage],
  );

  const updateRoomSettings = useCallback(
    (settings: { controlMode?: ControlMode; maxCapacity?: number; roomName?: string }) =>
      sendMessage({ type: 'room:settings', ...settings }),
    [sendMessage],
  );

  const reportTrackDuration = useCallback(
    (trackId: string, durationSec: number) =>
      sendMessage({ type: 'track:duration', trackId, durationSec }),
    [sendMessage],
  );

  const clearError = useCallback(() => {
    setError(null);
    setErrorCode(null);
  }, []);

  return {
    roomState,
    connected,
    error,
    errorCode,
    passwordRequired,
    kickedReason,
    deviceId,
    uploadToken,
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
  };
}
