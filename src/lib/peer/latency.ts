import type { ConnectionPath } from './connectivity'
import type { SessionMode } from './protocol'

/** How often each peer probes RTT while connected (5–10 s target). */
export const LATENCY_PING_INTERVAL_MS = 7000

/** After this long without a pong, latency is cleared and re-measured. */
export const LATENCY_STALE_MS = LATENCY_PING_INTERVAL_MS * 3

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
  /** Co-op: delay before resuming after a state sync completes. */
  coopResyncResumeDelayMs: number
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
  // One-way transit (RTT/2) plus ~2 frames at 60 Hz for jitter absorption.
  const oneWay = Math.ceil(rtt / 2)
  const frameBuffer = 34
  return Math.min(200, Math.max(50, oneWay + frameBuffer))
}

export function getCoopResyncResumeDelayMs(latencyMs: number | null): number {
  const tier = classifyLatency(latencyMs)
  if (tier === 'excellent') return 50
  if (tier === 'good') return 80
  if (tier === 'fair') return 120
  return 200
}

/** Wall-clock budget from resync start until both peers should resume. */
export function getCoopResyncLeadMs(latencyMs: number | null, stateBytes: number): number {
  const tier = classifyLatency(latencyMs)
  const base =
    tier === 'excellent' ? 100 : tier === 'good' ? 160 : tier === 'fair' ? 280 : tier === 'poor' ? 420 : 600
  const sizeSlack = Math.min(280, Math.ceil(stateBytes / 16_384) * 16)
  return base + sizeSlack
}

export function getLatencyProfile(
  ms: number | null,
  mode: SessionMode,
  path: ConnectionPath,
): LatencyProfile {
  const tier = classifyLatency(ms)

  const base: LatencyProfile = {
    tier,
    pingIntervalMs: LATENCY_PING_INTERVAL_MS,
    streamFps: 60,
    label: tier === 'unknown' ? 'Measuring…' : formatLatency(ms),
    advice: null,
    coopSyncIntervalMs: mode === 'coop' ? 15_000 : null,
    coopAutoSyncIntervalMs: mode === 'coop' ? 10_000 : null,
    coopResyncResumeDelayMs: getCoopResyncResumeDelayMs(ms),
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
        streamFps: 45,
        advice:
          mode === 'coop'
            ? 'Fair latency — sync game state if emulators drift apart.'
            : mode === 'remote'
              ? 'Fair latency — stream quality reduced slightly.'
              : 'Fair latency — controller input may feel slightly delayed.',
        coopSyncIntervalMs: 30_000,
        coopAutoSyncIntervalMs: 8_000,
        coopResyncResumeDelayMs: getCoopResyncResumeDelayMs(ms),
        coopInputDelayMs: getCoopInputDelayMs(ms),
        warnInputDelay: mode !== 'remote',
      }
    case 'poor':
      return {
        ...base,
        streamFps: 30,
        advice:
          mode === 'coop'
            ? 'High latency — sync game state regularly to stay aligned.'
            : mode === 'remote'
              ? 'High latency — stream capped at 30 FPS.'
              : 'High latency — inputs will feel delayed on the host.',
        coopSyncIntervalMs: 25_000,
        coopAutoSyncIntervalMs: 12_000,
        coopResyncResumeDelayMs: getCoopResyncResumeDelayMs(ms),
        coopInputDelayMs: getCoopInputDelayMs(ms),
        warnInputDelay: true,
      }
    case 'bad':
      return {
        ...base,
        streamFps: 24,
        advice:
          path === 'relay'
            ? 'Very high latency on relay — VPN or strict NAT may be involved. Same Wi‑Fi or disabling VPN works best.'
            : mode === 'coop'
              ? 'Very high latency — sync often; inputs are noticeably delayed.'
              : 'Very high latency — expect noticeable input and video delay.',
        coopSyncIntervalMs: 20_000,
        coopAutoSyncIntervalMs: 20_000,
        coopResyncResumeDelayMs: getCoopResyncResumeDelayMs(ms),
        coopInputDelayMs: getCoopInputDelayMs(ms),
        warnInputDelay: true,
      }
    default:
      return {
        ...base,
        label: 'Measuring…',
        coopInputDelayMs: getCoopInputDelayMs(ms),
      }
  }
}
