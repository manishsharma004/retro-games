import type { UsePeerSessionResult } from '../usePeerSession'
import type { ModeHookBase } from './types'

export interface UseCoopSessionOptions extends ModeHookBase {
  peer: UsePeerSessionResult
}

/**
 * Dual-emulator co-op (experimental): each peer runs its own WASM core and loads
 * the same ROM locally. Only controller inputs are exchanged — no ROM or save-state sync.
 */
export function useCoopSession({ enabled }: UseCoopSessionOptions) {
  return {
    enabled,
    inputOnly: true as const,
  }
}
