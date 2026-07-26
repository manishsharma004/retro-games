export type SystemId = 'nes' | 'snes'

export interface SystemInfo {
  id: SystemId
  label: string
  core: string
  extensions: string[]
  aspectRatio: string
}

export const SYSTEMS: Record<SystemId, SystemInfo> = {
  nes: {
    id: 'nes',
    label: 'NES',
    core: 'fceumm',
    extensions: ['.nes', '.unf', '.unif', '.fds'],
    aspectRatio: '4 / 3',
  },
  snes: {
    id: 'snes',
    label: 'SNES',
    core: 'snes9x',
    extensions: ['.sfc', '.smc', '.fig', '.swc'],
    aspectRatio: '4 / 3',
  },
}

export function detectSystem(fileName: string): SystemId | null {
  const lower = fileName.toLowerCase()
  const ext = lower.includes('.') ? `.${lower.split('.').pop()}` : ''
  for (const system of Object.values(SYSTEMS)) {
    if (system.extensions.includes(ext)) {
      return system.id
    }
  }
  return null
}

export function acceptAttribute(): string {
  return Object.values(SYSTEMS)
    .flatMap((s) => s.extensions)
    .join(',')
}
