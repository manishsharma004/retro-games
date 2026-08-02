/** Short stable id for pairing an SDP offer with its answer (avoids stale answers). */
export function offerFingerprint(compressedOrSdp: string): string {
  const trimmed = compressedOrSdp.trim()
  let hash = 2166136261
  for (let i = 0; i < trimmed.length; i++) {
    hash ^= trimmed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

export function isMlineOrderError(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    (err.message.includes("order of m-lines") ||
      err.message.includes('m-lines in answer'))
  )
}
