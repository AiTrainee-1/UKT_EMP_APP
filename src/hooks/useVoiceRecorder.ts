import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  RecordingPresets,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type RecordingOptions,
} from 'expo-audio';
import { File } from 'expo-file-system';

import { meteringToLevel, VOICE_MAX_MS } from '../lib/chatMedia';

/**
 * Records one Team Chat voice message at a time (owner 2026-11-25) with expo-audio: AAC in an .m4a file, mono at
 * 64 kbit/s (about half a megabyte a minute), with loudness readings for the waveform. It stops by itself at two
 * minutes (`onLimit`). The microphone is only used while a message is being recorded.
 */

const VOICE_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  numberOfChannels: 1,
  bitRate: 64_000,
  isMeteringEnabled: true,
};

const TICK_MS = 80;
/** Live bars kept for the recording strip. */
const LIVE_BARS = 40;

export type StartOutcome = 'started' | 'permission-asked' | 'denied' | 'blocked' | 'failed';

export interface Recording {
  uri: string;
  durationMs: number;
  /** Every loudness reading (0..1), oldest first. */
  levels: number[];
}

export function useVoiceRecorder({ onLimit }: { onLimit: () => void }) {
  const recorder = useAudioRecorder(VOICE_OPTIONS);
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [liveLevels, setLiveLevels] = useState<number[]>([]);
  const levels = useRef<number[]>([]);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const active = useRef(false);
  const limitHit = useRef(false);
  const onLimitRef = useRef(onLimit);
  onLimitRef.current = onLimit;

  const clearTimer = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  /**
   * Starts recording. The first time, the phone asks for the microphone instead ("permission-asked": the employee
   * then presses the mic again), so a hold never turns into an accidental recording behind the permission dialog.
   */
  const start = useCallback(async (): Promise<StartOutcome> => {
    if (active.current) return 'started';
    try {
      let perm = await getRecordingPermissionsAsync();
      if (!perm.granted) {
        if (!perm.canAskAgain) return 'blocked';
        perm = await requestRecordingPermissionsAsync();
        return perm.granted ? 'permission-asked' : perm.canAskAgain ? 'denied' : 'blocked';
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      active.current = true;
      limitHit.current = false;
      startedAt.current = Date.now();
      levels.current = [];
      setLiveLevels([]);
      setElapsedMs(0);
      setRecording(true);
      clearTimer();
      timer.current = setInterval(() => {
        if (!active.current) return;
        let status: ReturnType<typeof recorder.getStatus> | null = null;
        try {
          status = recorder.getStatus();
        } catch {
          status = null;
        }
        const level = meteringToLevel(status?.metering);
        levels.current.push(level);
        const ms = Math.max(status?.durationMillis ?? 0, Date.now() - startedAt.current);
        setElapsedMs(ms);
        setLiveLevels((cur) => {
          const next = cur.length >= LIVE_BARS ? cur.slice(cur.length - LIVE_BARS + 1) : cur.slice();
          next.push(level);
          return next;
        });
        if (ms >= VOICE_MAX_MS && !limitHit.current) {
          limitHit.current = true;
          onLimitRef.current();
        }
      }, TICK_MS);
      return 'started';
    } catch {
      active.current = false;
      setRecording(false);
      clearTimer();
      void resetAudioMode();
      return 'failed';
    }
  }, [recorder]);

  /** Stops and returns the recording (null when nothing was recording or the file is missing). */
  const stop = useCallback(async (): Promise<Recording | null> => {
    if (!active.current) return null;
    active.current = false;
    clearTimer();
    const measured = Date.now() - startedAt.current;
    let statusMs = 0;
    try {
      statusMs = recorder.getStatus().durationMillis ?? 0;
    } catch {
      statusMs = 0;
    }
    try {
      await recorder.stop();
    } catch {
      // a recorder that already stopped still leaves its file
    }
    setRecording(false);
    void resetAudioMode();
    const uri = recorder.uri;
    if (!uri) return null;
    return { uri, durationMs: Math.min(VOICE_MAX_MS, statusMs > 0 ? statusMs : measured), levels: levels.current.slice() };
  }, [recorder]);

  /** Stops and throws the recording away. */
  const cancel = useCallback(async () => {
    const rec = await stop();
    if (rec) deleteRecording(rec.uri);
  }, [stop]);

  // leaving the chat while recording: stop and throw it away
  useEffect(
    () => () => {
      clearTimer();
      if (active.current) {
        active.current = false;
        try {
          recorder.stop().catch(() => undefined);
        } catch {
          // already released with the screen
        }
        void resetAudioMode();
      }
    },
    [recorder],
  );

  return { recording, elapsedMs, liveLevels, start, stop, cancel };
}

async function resetAudioMode() {
  try {
    // back to the loudspeaker for playback (iOS routes audio differently while recording is allowed)
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
  } catch {
    // nothing to undo
  }
}

export function deleteRecording(uri: string | null | undefined) {
  if (!uri || Platform.OS === 'web') return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // the system clears the cache folder anyway
  }
}
