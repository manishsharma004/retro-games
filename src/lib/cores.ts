/**
 * ROM → core mapping for every libretro core shipped on Nostalgist's CDN.
 * @see https://nostalgist.js.org/apis/launch#core
 */

import { isNostalgistCore } from './nostalgistCores'

export {
  NOSTALGIST_CORES,
  NOSTALGIST_CORES as ARCADE_CORES,
  isNostalgistCore,
  isNostalgistCore as isArcadeCore,
  coreLabel,
  arcadeCoreOptionLabel,
} from './nostalgistCores'

export type SystemId =
  | 'nes'
  | 'snes'
  | 'gb'
  | 'gbc'
  | 'gba'
  | 'genesis'
  | 'sms'
  | 'gg'
  | 'pce'
  | 'lynx'
  | 'ngp'
  | 'wswan'
  | 'vb'
  | 'psx'
  | 'arcade'
  | 'msx'
  | 'coleco'
  | 'doom'
  | 'quake'
  | 'c64'
  | 'c128'
  | 'vic20'
  | 'plus4'
  | 'pet'
  | 'vecx'
  | 'tic80'
  | 'wasm4'
  | 'nxengine'
  | 'lowresnx'
  | 'neocd'
  | 'o2em'
  | 'opera'
  | 'pokemini'

/** Virtual on-screen pad layout family. */
export type ControllerLayout = 'nes' | 'snes' | 'arcade'

export interface SystemInfo {
  id: SystemId
  label: string
  core: string
  extensions: string[]
  aspectRatio: string
  controllerLayout: ControllerLayout
}

export const SYSTEMS: Record<SystemId, SystemInfo> = {
  nes: {
    id: 'nes',
    label: 'NES',
    core: 'fceumm',
    extensions: ['.nes', '.unf', '.unif', '.fds'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
  },
  snes: {
    id: 'snes',
    label: 'SNES',
    core: 'snes9x',
    extensions: ['.sfc', '.smc', '.fig', '.swc'],
    aspectRatio: '4 / 3',
    controllerLayout: 'snes',
  },
  gb: {
    id: 'gb',
    label: 'Game Boy',
    core: 'gambatte',
    extensions: ['.gb', '.dmg'],
    aspectRatio: '10 / 9',
    controllerLayout: 'nes',
  },
  gbc: {
    id: 'gbc',
    label: 'Game Boy Color',
    core: 'gambatte',
    extensions: ['.gbc'],
    aspectRatio: '10 / 9',
    controllerLayout: 'nes',
  },
  gba: {
    id: 'gba',
    label: 'Game Boy Advance',
    core: 'mgba',
    extensions: ['.gba'],
    aspectRatio: '3 / 2',
    controllerLayout: 'snes',
  },
  genesis: {
    id: 'genesis',
    label: 'Genesis / Mega Drive',
    core: 'genesis_plus_gx',
    extensions: ['.md', '.gen', '.smd', '.bin', '.32x'],
    aspectRatio: '4 / 3',
    controllerLayout: 'snes',
  },
  sms: {
    id: 'sms',
    label: 'Master System',
    core: 'gearsystem',
    extensions: ['.sms'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
  },
  gg: {
    id: 'gg',
    label: 'Game Gear',
    core: 'gearsystem',
    extensions: ['.gg'],
    aspectRatio: '10 / 9',
    controllerLayout: 'nes',
  },
  pce: {
    id: 'pce',
    label: 'PC Engine / TurboGrafx',
    core: 'mednafen_pce_fast',
    extensions: ['.pce', '.sgx'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
  },
  lynx: {
    id: 'lynx',
    label: 'Atari Lynx',
    core: 'mednafen_lynx',
    extensions: ['.lnx'],
    aspectRatio: '16 / 10',
    controllerLayout: 'nes',
  },
  ngp: {
    id: 'ngp',
    label: 'Neo Geo Pocket',
    core: 'mednafen_ngp',
    extensions: ['.ngp', '.ngc'],
    aspectRatio: '96 / 64',
    controllerLayout: 'nes',
  },
  wswan: {
    id: 'wswan',
    label: 'WonderSwan',
    core: 'mednafen_wswan',
    extensions: ['.ws', '.wsc'],
    aspectRatio: '14 / 9',
    controllerLayout: 'nes',
  },
  vb: {
    id: 'vb',
    label: 'Virtual Boy',
    core: 'mednafen_vb',
    extensions: ['.vb', '.vboy'],
    aspectRatio: '14 / 9',
    controllerLayout: 'nes',
  },
  psx: {
    id: 'psx',
    label: 'PlayStation',
    core: 'pcsx_rearmed',
    extensions: ['.cue', '.img', '.mdf', '.pbp', '.toc', '.cbn', '.m3u', '.ccd', '.chd', '.iso'],
    aspectRatio: '4 / 3',
    controllerLayout: 'snes',
  },
  arcade: {
    id: 'arcade',
    label: 'Arcade / MAME',
    core: 'mame2003_plus',
    extensions: ['.zip'],
    aspectRatio: '4 / 3',
    controllerLayout: 'arcade',
  },
  msx: {
    id: 'msx',
    label: 'MSX',
    core: 'bluemsx',
    extensions: ['.rom', '.mx1', '.mx2', '.dsk'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
  },
  coleco: {
    id: 'coleco',
    label: 'ColecoVision',
    core: 'gearcoleco',
    extensions: ['.col', '.cv'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
  },
  doom: {
    id: 'doom',
    label: 'Doom',
    core: 'prboom',
    extensions: ['.wad', '.iwad', '.pwad'],
    aspectRatio: '4 / 3',
    controllerLayout: 'snes',
  },
  quake: {
    id: 'quake',
    label: 'Quake',
    core: 'tyrquake',
    extensions: ['.pak'],
    aspectRatio: '4 / 3',
    controllerLayout: 'snes',
  },
  c64: {
    id: 'c64',
    label: 'Commodore 64',
    core: 'vice_x64',
    extensions: ['.d64', '.t64', '.prg', '.crt', '.tap', '.nib', '.d71', '.d81', '.g64'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
  },
  c128: {
    id: 'c128',
    label: 'Commodore 128',
    core: 'vice_x128',
    extensions: ['.d128'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
  },
  vic20: {
    id: 'vic20',
    label: 'VIC-20',
    core: 'vice_xvic',
    extensions: ['.20', '.40', '.60', '.a0'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
  },
  plus4: {
    id: 'plus4',
    label: 'Commodore Plus/4',
    core: 'vice_xplus4',
    extensions: ['.d4', '.d6', '.d7'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
  },
  pet: {
    id: 'pet',
    label: 'Commodore PET',
    core: 'vice_xpet',
    extensions: ['.pet'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
  },
  vecx: {
    id: 'vecx',
    label: 'Vectrex',
    core: 'vecx',
    extensions: ['.vec'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
  },
  tic80: {
    id: 'tic80',
    label: 'TIC-80',
    core: 'tic80',
    extensions: ['.tic'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
  },
  wasm4: {
    id: 'wasm4',
    label: 'WASM-4',
    core: 'wasm4',
    extensions: ['.wasm'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
  },
  nxengine: {
    id: 'nxengine',
    label: 'Cave Story',
    core: 'nxengine',
    extensions: ['.nx'],
    aspectRatio: '4 / 3',
    controllerLayout: 'snes',
  },
  lowresnx: {
    id: 'lowresnx',
    label: 'LowRes NX',
    core: 'lowresnx',
    extensions: ['.lrx'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
  },
  neocd: {
    id: 'neocd',
    label: 'Neo Geo CD',
    core: 'neocd',
    extensions: [],
    aspectRatio: '4 / 3',
    controllerLayout: 'snes',
  },
  o2em: {
    id: 'o2em',
    label: 'Odyssey 2',
    core: 'o2em',
    extensions: ['.o2'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
  },
  opera: {
    id: 'opera',
    label: '3DO',
    core: 'opera',
    extensions: ['.3do'],
    aspectRatio: '4 / 3',
    controllerLayout: 'snes',
  },
  pokemini: {
    id: 'pokemini',
    label: 'Pokemon Mini',
    core: 'gearsystem',
    extensions: ['.min'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
  },
}

/** Ordered extension → system lookup (longer / more specific extensions first). */
const EXTENSION_LOOKUP: { ext: string; system: SystemId }[] = Object.values(SYSTEMS)
  .flatMap((system) => system.extensions.map((ext) => ({ ext, system: system.id })))
  .sort((a, b) => b.ext.length - a.ext.length)

const SYSTEM_IDS = new Set<SystemId>(Object.keys(SYSTEMS) as SystemId[])

/** Common arcade BIOS / device ROM filenames (case-insensitive). */
const BIOS_NAME_RE =
  /^(neogeo|neogeo_bios|pgm|bios|devices|skns|dec|isgsm|vsb|awbios)(\.zip|\.7z)?$/i

export const DEFAULT_ARCADE_CORE = 'mame2003_plus'

export function resolveArcadeCore(core?: string | null): string {
  if (core && isNostalgistCore(core)) return core
  return DEFAULT_ARCADE_CORE
}

/** FBNeo-family cores load BIOS zips from the system folder. */
export function coreUsesBiosFolder(core: string): boolean {
  return core.startsWith('fbalpha')
}

/** MAME/FBNeo identify games by zip basename; RetroArch FS is case-sensitive. */
export function normalizeArcadeFileName(fileName: string): string {
  return fileName.toLowerCase()
}

export function filesIncludeZip(files: File[]): boolean {
  return files.some((file) => getExtension(file.name) === '.zip')
}

export function isValidSystemId(value: string): value is SystemId {
  return SYSTEM_IDS.has(value as SystemId)
}

export function getExtension(fileName: string): string {
  const lower = fileName.toLowerCase()
  return lower.includes('.') ? `.${lower.split('.').pop()}` : ''
}

export function detectSystem(fileName: string): SystemId | null {
  const ext = getExtension(fileName)
  for (const { ext: candidate, system } of EXTENSION_LOOKUP) {
    if (ext === candidate) return system
  }
  return null
}

/** Pick the primary ROM system when multiple files are selected. */
export function detectSystemFromFiles(files: File[]): SystemId | null {
  const primary = files.find((file) => detectSystem(file.name)) ?? files[0]
  if (!primary) return null
  return detectSystem(primary.name)
}

/** Nostalgist drops raw File names; MAME/PSX multi-file sets need the real filename. */
export type NostalgistRomInput =
  | string
  | File
  | { fileName: string; fileContent: File | Blob }
  | Array<string | File | { fileName: string; fileContent: File | Blob }>

function preserveRomName(file: File, system: SystemId): File | { fileName: string; fileContent: File } {
  const ext = getExtension(file.name)
  const needsName =
    system === 'arcade' ||
    ext === '.zip' ||
    ext === '.cue' ||
    ext === '.m3u' ||
    ext === '.chd' ||
    ext === '.iso'
  if (!needsName || !file.name) return file
  const fileName = system === 'arcade' ? normalizeArcadeFileName(file.name) : file.name
  return { fileName, fileContent: file }
}

/** Normalize ROM payloads for Nostalgist.launch while preserving arcade filenames. */
export function toNostalgistRom(
  input: File | string | File[],
  system: SystemId,
): NostalgistRomInput {
  if (typeof input === 'string') return input

  const files = Array.isArray(input) ? input : [input]
  const mapped = files.map((file) => preserveRomName(file, system))
  return mapped.length === 1 ? mapped[0] : mapped
}

export interface RomFilePartition {
  rom: File[]
  bios: File[]
}

/** Split ROMs for launch. MAME keeps all zips in content/; FBNeo sends BIOS zips to system/. */
export function partitionRomFiles(
  files: File[],
  system?: SystemId,
  core?: string,
): RomFilePartition {
  if (system === 'arcade') {
    const resolvedCore = resolveArcadeCore(core)
    const fbNeo = coreUsesBiosFolder(resolvedCore)
    if (!fbNeo) {
      return { rom: files, bios: [] }
    }
    const rom: File[] = []
    const bios: File[] = []
    for (const file of files) {
      if (BIOS_NAME_RE.test(file.name)) {
        bios.push(file)
      } else {
        rom.push(file)
      }
    }
    return { rom: rom.length > 0 ? rom : files, bios }
  }

  const rom: File[] = []
  const bios: File[] = []
  for (const file of files) {
    if (BIOS_NAME_RE.test(file.name)) {
      bios.push(file)
    } else {
      rom.push(file)
    }
  }
  return { rom, bios }
}

export function controllerLayout(system: SystemId): ControllerLayout {
  return SYSTEMS[system].controllerLayout
}

export function acceptAttribute(): string {
  const exts = [...new Set(Object.values(SYSTEMS).flatMap((s) => s.extensions))]
  return exts.join(',')
}

export function formatExtensionsHint(max = 12): string {
  const exts = [...new Set(Object.values(SYSTEMS).flatMap((s) => s.extensions))]
    .filter((e) => e !== '.wasm')
    .slice(0, max)
  const more = exts.length < Object.values(SYSTEMS).flatMap((s) => s.extensions).length ? '…' : ''
  return `${exts.join(' · ')}${more} — files stay in your browser`
}

/** Default file extension for peer/co-op transfers when the original name is unknown. */
export function defaultExtensionForSystem(system: SystemId): string {
  const info = SYSTEMS[system]
  return info.extensions[0]?.slice(1) ?? 'bin'
}
