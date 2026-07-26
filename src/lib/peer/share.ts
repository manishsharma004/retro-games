/** Share a compressed signal string via the OS share sheet (messaging apps) when available. */
export async function shareSignalString(
  signal: string,
  kind: 'offer' | 'answer',
): Promise<'shared' | 'copied' | 'unavailable'> {
  const title = kind === 'offer' ? 'Retro Games 2P offer' : 'Retro Games 2P answer'
  const text =
    kind === 'offer'
      ? `Retro Games 2-player offer (paste in Join):\n\n${signal}`
      : `Retro Games 2-player answer (paste on Host):\n\n${signal}`

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text })
      return 'shared'
    } catch (err) {
      // User cancel is fine; fall through to clipboard only on other errors.
      if (err instanceof DOMException && err.name === 'AbortError') return 'unavailable'
    }
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(signal)
      return 'copied'
    } catch {
      return 'unavailable'
    }
  }

  return 'unavailable'
}

export async function copySignalString(signal: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(signal)
      return true
    } catch {
      return false
    }
  }
  return false
}
