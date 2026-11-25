import React, { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';

/**
 * One audio player for the whole chat (owner 2026-11-25): only one voice message plays at a time, as in WhatsApp, and
 * a long thread of voice messages does not hold a native player per bubble. A bubble reads only ITS OWN progress
 * (useVoiceTrack), so the 150 ms progress updates re-draw the playing bubble and nothing else.
 */

export interface VoiceTrack {
  playing: boolean;
  positionMs: number;
  durationMs: number;
  loading: boolean;
}

const IDLE: VoiceTrack = { playing: false, positionMs: 0, durationMs: 0, loading: false };

interface Controls {
  /** Play / pause this message's local file (a different message stops the current one first). */
  toggle: (id: number, uri: string) => void;
  seek: (id: number, ms: number) => void;
  stop: () => void;
  subscribe: (cb: () => void) => () => void;
  trackFor: (id: number) => VoiceTrack;
}

const VoiceContext = createContext<Controls | null>(null);

export function VoicePlaybackProvider({ children }: { children: React.ReactNode }) {
  const player = useAudioPlayer(null, { updateInterval: 150 });
  const status = useAudioPlayerStatus(player);
  const activeId = useRef<number | null>(null);
  const track = useRef<VoiceTrack>(IDLE);
  const listeners = useRef(new Set<() => void>());
  const pendingSeekMs = useRef<number | null>(null);

  const publish = (next: VoiceTrack) => {
    const cur = track.current;
    if (
      cur.playing === next.playing &&
      cur.loading === next.loading &&
      cur.durationMs === next.durationMs &&
      Math.abs(cur.positionMs - next.positionMs) < 1
    ) {
      return;
    }
    track.current = next;
    listeners.current.forEach((l) => l());
  };

  useEffect(() => {
    // a voice message plays even with the ringer off, through the loudspeaker
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (activeId.current == null) return;
    if (status.didJustFinish) {
      player.pause();
      void player.seekTo(0).catch(() => undefined);
      publish({ playing: false, positionMs: 0, durationMs: Math.round((status.duration || 0) * 1000), loading: false });
      return;
    }
    if (status.isLoaded && pendingSeekMs.current != null) {
      const ms = pendingSeekMs.current;
      pendingSeekMs.current = null;
      void player.seekTo(ms / 1000).catch(() => undefined);
    }
    publish({
      playing: status.playing,
      positionMs: Math.round((status.currentTime || 0) * 1000),
      durationMs: Math.round((status.duration || 0) * 1000),
      loading: !status.isLoaded || (status.isBuffering && !status.playing),
    });
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  const controls = useMemo<Controls>(
    () => ({
      toggle: (id, uri) => {
        if (activeId.current === id) {
          if (player.playing) {
            player.pause();
          } else {
            if (player.duration > 0 && player.currentTime >= player.duration - 0.05) void player.seekTo(0).catch(() => undefined);
            player.play();
          }
          return;
        }
        activeId.current = id;
        pendingSeekMs.current = null;
        track.current = { ...IDLE, loading: true };
        listeners.current.forEach((l) => l());
        player.replace({ uri });
        player.play();
      },
      seek: (id, ms) => {
        if (activeId.current !== id) return;
        if (player.isLoaded) void player.seekTo(ms / 1000).catch(() => undefined);
        else pendingSeekMs.current = ms;
        publish({ ...track.current, positionMs: ms });
      },
      stop: () => {
        if (activeId.current == null) return;
        try {
          player.pause();
        } catch {
          // released with the screen
        }
        activeId.current = null;
        track.current = IDLE;
        listeners.current.forEach((l) => l());
      },
      subscribe: (cb) => {
        listeners.current.add(cb);
        return () => listeners.current.delete(cb);
      },
      trackFor: (id) => (activeId.current === id ? track.current : IDLE),
    }),
    [player],
  );

  return <VoiceContext.Provider value={controls}>{children}</VoiceContext.Provider>;
}

/** This message's playback state (IDLE unless it is the one playing) and the controls. */
export function useVoiceTrack(id: number): { track: VoiceTrack; controls: Controls | null } {
  const controls = useContext(VoiceContext);
  const track = useSyncExternalStore(
    controls ? controls.subscribe : noopSubscribe,
    () => (controls ? controls.trackFor(id) : IDLE),
  );
  return { track, controls };
}

/** The controls only (the composer pauses playback when a recording starts). */
export function useVoiceControls(): Controls | null {
  return useContext(VoiceContext);
}

const noopSubscribe = () => () => undefined;
