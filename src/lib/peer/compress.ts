import { deflateSync, inflateSync } from 'fflate'

const PREFIX = 'RG1.'

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBytes(text: string): Uint8Array {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/')
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
  const binary = atob(padded + pad)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

/** Compress a WebRTC SDP (offer or answer) into a portable string for QR / paste. */
export function compressSignal(sdp: string): string {
  const compressed = deflateSync(new TextEncoder().encode(sdp), { level: 9 })
  return PREFIX + bytesToBase64Url(compressed)
}

/** Decompress a signal string produced by {@link compressSignal}. */
export function decompressSignal(encoded: string): string {
  const trimmed = encoded.trim().replace(/\s+/g, '')
  if (!trimmed.startsWith(PREFIX)) {
    throw new Error('Unrecognized signal format (expected RG1.…)')
  }
  const bytes = base64UrlToBytes(trimmed.slice(PREFIX.length))
  return new TextDecoder().decode(inflateSync(bytes))
}
