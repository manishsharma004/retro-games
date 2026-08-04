/** Exponential moving average for clock-offset samples (ms). */
export function smoothClockOffset(prev: number | null, sample: number): number {
  if (prev === null) return sample
  return Math.round(prev * 0.8 + sample * 0.2)
}

/**
 * Cristian's algorithm: estimate how far the remote clock is ahead of local.
 * remoteClock ≈ localClock + offset
 * Convert a remote timestamp to local wall time via: local = remote - offset
 */
export function estimateClockOffset(
  pingSentAt: number,
  pongRecvAt: number,
  peerRecvAt: number,
): number {
  return Math.round(peerRecvAt - (pingSentAt + pongRecvAt) / 2)
}
