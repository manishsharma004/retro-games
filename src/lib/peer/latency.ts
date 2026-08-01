import type { ConnectionPath } from './connectivity'
import type { SessionMode } from './protocol'

export type LatencyTier = 'excellent' | 'good' | 'fair' | 'poor' | 'bad' | 'unknown'

export interface LatencyProfile {
  tier: LatencyTier
  /** How often to send ping probes. */
  pingIntervalMs: number
  /** Suggested canvas capture FPS for remote stream host. */
  streamFps: number
  /** Short label for UI badges. */
  label: string
  /** User-facing guidance; null when connection is healthy. */
  advice: string | null
  /** Co-op: suggest manual state sync after this many ms of play without sync. */
  coopSyncIntervalMs: number | null
  /** Co-op: automatic background state sync interval. */
  coopAutoSyncIntervalMs: number | null
  /** Co-op: symmetric input buffer before applying local or remote inputs (ms). */
  coopInputDelayMs: number
  /** Show input-delay warning in the lobby/toolbar. */
  warnInputDelay: boolean
}

export function classifyLatency(ms: number | null): LatencyTier {
  if (ms === null || !Number.isFinite(ms)) return 'unknown'
  if (ms < 30) return 'excellent'
  if (ms < 80) return 'good'
  if (ms < 150) return 'fair'
  if (ms < 300) return 'poor'
  return 'bad'
}

/** Exponential moving average — smooths jitter without hiding spikes. */
export function smoothLatency(prev: number | null, sample: number): number {
  if (prev === null) return sample
  return Math.round(prev * 0.7 + sample * 0.3)
}

export function formatLatency(ms: number | null): string {
  if (ms === null) return '…'
  return `${ms} ms`
}

export function getCoopInputDelayMs(latencyMs: number | null): number {
  const rtt = latencyMs ?? 80
  // One-way transit (RTT/2) plus ~3 frames at 60 Hz so both peers land on the same frame.
  const oneWay = Math.ceil(rtt / 2)
  const frameBuffer = 50
  return Math.min(250, Math.max(80, oneWay + frameBuffer))
}

export function getLatencyProfile(
  ms: number | null,
  mode: SessionMode,
  path: ConnectionPath,
): LatencyProfile {
  const tier = classifyLatency(ms)

  const base: LatencyProfile = {
    tier,
    pingIntervalMs: 3000,
    streamFps: 60,
    label: tier === 'unknown' ? 'Measuring…' : formatLatency(ms),
    advice: null,
    coopSyncIntervalMs: null,
    coopAutoSyncIntervalMs: mode === 'coop' ? 90_000 : null,
    coopInputDelayMs: getCoopInputDelayMs(ms),
    warnInputDelay: false,
  }

  switch (tier) {
    case 'excellent':
    case 'good':
      return base
    case 'fair':
      return {
        ...base,
        pingIntervalMs: 2000,
        streamFps: 45,
        advice:
          mode === 'coop'
            ? 'Fair latency — sync game state if emulators drift apart.'
            : mode === 'remote'
              ? 'Fair latency — stream quality reduced slightly.'
              : 'Fair latency — controller input may feel slightly delayed.',
        coopSyncIntervalMs: 120_000,
        coopAutoSyncIntervalMs: 60_000,
        coopInputDelayMs: getCoopInputDelayMs(ms),
        warnInputDelay: mode !== 'remote',
      }
    case 'poor':
      return {
        ...base,
        pingIntervalMs: 2000,
        streamFps: 30,
        advice:
          mode === 'coop'
            ? 'High latency — sync game state regularly to stay aligned.'
            : mode === 'remote'
              ? 'High latency — stream capped at 30 FPS.'
              : 'High latency — inputs will feel delayed on the host.',
        coopSyncIntervalMs: 60_000,
        coopAutoSyncIntervalMs: 45_000,
        coopInputDelayMs: getCoopInputDelayMs(ms),
        warnInputDelay: true,
      }
    case 'bad':
      return {
        ...base,
        pingIntervalMs: 5000,
        streamFps: 24,
        advice:
          path === 'relay'
            ? 'Very high latency on relay — same Wi‑Fi or a closer network works best.'
            : mode === 'coop'
              ? 'Very high latency — sync often; inputs are noticeably delayed.'
              : 'Very high latency — expect noticeable input and video delay.',
        coopSyncIntervalMs: 30_000,
        coopAutoSyncIntervalMs: 30_000,
        coopInputDelayMs: getCoopInputDelayMs(ms),
        warnInputDelay: true,
      }
    default:
      return {
        ...base,
        pingIntervalMs: 2500,
        label: 'Measuring…',
        coopInputDelayMs: getCoopInputDelayMs(ms),
      }
  }
}
