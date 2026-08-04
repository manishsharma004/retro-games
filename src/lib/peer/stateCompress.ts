import { deflateSync, inflateSync } from 'fflate'

const MIN_COMPRESS_BYTES = 24_000
const MIN_RATIO = 1.08

export interface CompressStateOptions {
  /** Level 1 is much faster than 6 with acceptable ratio for resync. */
  fast?: boolean
}

/** Compress save-state blob for co-op resync; falls back to raw on poor ratio. */
export function compressStateBlob(
  data: Uint8Array,
  options?: CompressStateOptions,
): {
  payload: Uint8Array
  compressed: boolean
} {
  if (data.byteLength < MIN_COMPRESS_BYTES) {
    return { payload: data, compressed: false }
  }
  try {
    const level = options?.fast === false ? 6 : 1
    const compressed = deflateSync(data, { level })
    const ratio = data.byteLength / compressed.byteLength
    if (ratio < MIN_RATIO) {
      return { payload: data, compressed: false }
    }
    return { payload: compressed, compressed: true }
  } catch {
    return { payload: data, compressed: false }
  }
}

export function decompressStateBlob(data: Uint8Array, compressed: boolean): Uint8Array {
  if (!compressed) return maybeDecompressStateBlob(data)
  try {
    return inflateSync(data)
  } catch {
    return data
  }
}

/** Auto-detect fflate/zlib header on state blobs. */
export function maybeDecompressStateBlob(data: Uint8Array): Uint8Array {
  if (data.byteLength < 2) return data
  if (data[0] === 0x78) {
    try {
      return inflateSync(data)
    } catch {
      return data
    }
  }
  return data
}
