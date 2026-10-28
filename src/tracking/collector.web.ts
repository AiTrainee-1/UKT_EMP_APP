// The browser has no background location: a stub engine so anything that asks for one finds it, and so expo-location's
// background task machinery stays out of the web bundle.
import { registerEngine } from './engineRegistry.ts';
import type { EngineStartResult, EngineStatus, TrackerEngine } from './types.ts';

const expoEngine: TrackerEngine = {
  async start(): Promise<EngineStartResult> {
    return { ok: false, reason: 'unavailable', message: 'Background location is not available in a browser.' };
  },
  async stop(): Promise<void> {},
  async status(): Promise<EngineStatus> {
    return { running: false, trackId: null, sessionId: null, mode: null, startedAt: null, lastPointAt: null, lastHeartbeatAt: null, lastError: null };
  },
  async enqueue(): Promise<number> {
    return 0;
  },
};

registerEngine(expoEngine);

export { expoEngine };
