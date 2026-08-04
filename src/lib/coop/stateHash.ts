/** Fast 32-bit FNV-1a hash for save-state byte comparison. */
export function hashStateBytes(data: Uint8Array): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < data.byteLength; i++) {
    hash ^= data[i]!
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}
