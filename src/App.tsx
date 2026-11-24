import { useEffect, useState } from 'react';
import { LandingPage, type CreateRoomOptions } from './components/LandingPage';
import { RoomWorkspace } from './components/RoomWorkspace';

function getRoomCodeFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('room');
  if (!raw) return null;
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
  return cleaned.length >= 4 ? cleaned : null;
}

export default function App() {
  const [activeRoomId, setActiveRoomId] = useState<string | null>(() => getRoomCodeFromUrl());
  const [isCreating, setIsCreating] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    const handlePopState = () => {
      setActiveRoomId(getRoomCodeFromUrl());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateToRoom = (roomCode: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('room', roomCode);
    window.history.pushState({}, '', url.toString());
    setActiveRoomId(roomCode);
  };

  const handleCreateRoom = async (options: CreateRoomOptions) => {
    setIsCreating(true);
    setJoinError(null);
    try {
      const resp = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
      });
      if (!resp.ok) {
        const body = (await resp.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || 'Could not create listening room.');
      }
      const data = (await resp.json()) as { roomId: string };
      navigateToRoom(data.roomId);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Unable to reach room server.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = (roomCode: string) => {
    setJoinError(null);
    const cleaned = roomCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
    if (cleaned.length < 4) {
      setJoinError('Room code must be at least 4 characters.');
      return;
    }
    navigateToRoom(cleaned);
  };

  const handleLeaveRoom = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.pushState({}, '', url.toString());
    setActiveRoomId(null);
  };

  if (activeRoomId) {
    return <RoomWorkspace roomId={activeRoomId} onLeaveRoom={handleLeaveRoom} />;
  }

  return (
    <LandingPage
      onCreateRoom={handleCreateRoom}
      onJoinRoom={handleJoinRoom}
      isCreating={isCreating}
      joinError={joinError}
    />
  );
}
