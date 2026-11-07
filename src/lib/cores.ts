/**
 * ROM → core mapping for every libretro core shipped on Nostalgist's CDN.
 * @see https://nostalgist.js.org/apis/launch#core
 */

import { coreLabel, isNostalgistCore } from './nostalgistCores'

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
  | 's32x'
  | 'segacd'
  | 'sms'
  | 'gg'
  | 'sg1000'
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
  | 'quake2'
  | 'wolf3d'
  | 'c64'
  | 'c128'
  | 'vic20'
  | 'plus4'
  | 'pet'
  | 'cbm2'
  | 'vecx'
  | 'tic80'
  | 'wasm4'
  | 'nxengine'
  | 'lowresnx'
  | 'neocd'
  | 'o2em'
  | 'opera'
  | 'arduboy'
  | 'bk'
  | 'chailove'
  | 'channelf'
  | 'galaksija'
  | 'gme'
  | 'gw'
  | 'jaxe'
  | 'jumpnbump'
  | 'lutro'
  | 'mac'
  | 'palm'
  | 'pc88'
  | 'pico8'
  | 'thomson'
  | 'ti83'
  | 'uzebox'
  | 'x1'
  | 'xrick'
  | 'pcxt'
  | 'j2me'
  | 'cdg'
  | 'game2048'
  | 'craft'
  | 'gong'
  | 'mrboom'
  | 'uw8'
  | 'vaporspec'

/** Virtual on-screen pad layout family. */
export type ControllerLayout = 'nes' | 'snes' | 'arcade'

export type SystemGroup = 'console' | 'handheld' | 'computer' | 'arcade' | 'other'

export interface SystemInfo {
  id: SystemId
  label: string
  core: string
  /** Other Nostalgist cores that play the same files. */
  alternateCores?: string[]
  extensions: string[]
  aspectRatio: string
  controllerLayout: ControllerLayout
  group: SystemGroup
}

export const SYSTEMS: Record<SystemId, SystemInfo> = {
  nes: {
    id: 'nes',
    label: 'NES',
    core: 'fceumm',
    alternateCores: ['nestopia', 'quicknes'],
    extensions: ['.nes', '.unf', '.unif', '.fds'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
    group: 'console',
  },
  snes: {
    id: 'snes',
    label: 'SNES',
    core: 'snes9x',
    alternateCores: ['snes9x2010', 'snes9x2005', 'snes9x2002'],
    extensions: ['.sfc', '.smc', '.fig', '.swc'],
    aspectRatio: '4 / 3',
    controllerLayout: 'snes',
    group: 'console',
  },
  gb: {
    id: 'gb',
    label: 'Game Boy',
    core: 'gambatte',
    alternateCores: ['gearboy', 'tgbdual'],
    extensions: ['.gb', '.dmg'],
    aspectRatio: '10 / 9',
    controllerLayout: 'nes',
    group: 'handheld',
  },
  gbc: {
    id: 'gbc',
    label: 'Game Boy Color',
    core: 'gambatte',
    alternateCores: ['gearboy', 'tgbdual'],
    extensions: ['.gbc'],
    aspectRatio: '10 / 9',
    controllerLayout: 'nes',
    group: 'handheld',
  },
  gba: {
    id: 'gba',
    label: 'Game Boy Advance',
    core: 'mgba',
    alternateCores: ['vba_next'],
    extensions: ['.gba'],
    aspectRatio: '3 / 2',
    controllerLayout: 'snes',
    group: 'handheld',
  },
  genesis: {
    id: 'genesis',
    label: 'Genesis / Mega Drive',
    core: 'genesis_plus_gx',
    alternateCores: ['picodrive', 'genesis_plus_gx_wide'],
    extensions: ['.md', '.gen', '.smd', '.bin'],
    aspectRatio: '4 / 3',
    controllerLayout: 'snes',
    group: 'console',
  },
  sms: {
    id: 'sms',
    label: 'Master System',
    core: 'gearsystem',
    extensions: ['.sms'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
    group: 'console',
  },
  gg: {
    id: 'gg',
    label: 'Game Gear',
    core: 'gearsystem',
    extensions: ['.gg'],
    aspectRatio: '10 / 9',
    controllerLayout: 'nes',
    group: 'handheld',
  },
  pce: {
    id: 'pce',
    label: 'PC Engine / TurboGrafx',
    core: 'mednafen_pce_fast',
    extensions: ['.pce', '.sgx'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
    group: 'console',
  },
  lynx: {
    id: 'lynx',
    label: 'Atari Lynx',
    core: 'mednafen_lynx',
    alternateCores: ['handy'],
    extensions: ['.lnx'],
    aspectRatio: '16 / 10',
    controllerLayout: 'nes',
    group: 'handheld',
  },
  ngp: {
    id: 'ngp',
    label: 'Neo Geo Pocket',
    core: 'mednafen_ngp',
    extensions: ['.ngp', '.ngc'],
    aspectRatio: '96 / 64',
    controllerLayout: 'nes',
    group: 'handheld',
  },
  wswan: {
    id: 'wswan',
    label: 'WonderSwan',
    core: 'mednafen_wswan',
    extensions: ['.ws', '.wsc'],
    aspectRatio: '14 / 9',
    controllerLayout: 'nes',
    group: 'handheld',
  },
  vb: {
    id: 'vb',
    label: 'Virtual Boy',
    core: 'mednafen_vb',
    extensions: ['.vb', '.vboy'],
    aspectRatio: '14 / 9',
    controllerLayout: 'nes',
    group: 'handheld',
  },
  psx: {
    id: 'psx',
    label: 'PlayStation',
    core: 'pcsx_rearmed',
    extensions: ['.cue', '.img', '.mdf', '.pbp', '.toc', '.cbn', '.m3u', '.ccd', '.chd', '.iso'],
    aspectRatio: '4 / 3',
    controllerLayout: 'snes',
    group: 'console',
  },
  arcade: {
    id: 'arcade',
    label: 'Arcade / MAME',
    core: 'mame2003_plus',
    extensions: ['.zip'],
    aspectRatio: '4 / 3',
    controllerLayout: 'arcade',
    group: 'arcade',
  },
  msx: {
    id: 'msx',
    label: 'MSX',
    core: 'bluemsx',
    extensions: ['.rom', '.mx1', '.mx2', '.dsk'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
    group: 'computer',
  },
  coleco: {
    id: 'coleco',
    label: 'ColecoVision',
    core: 'gearcoleco',
    extensions: ['.col', '.cv'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
    group: 'console',
  },
  doom: {
    id: 'doom',
    label: 'Doom',
    core: 'prboom',
    extensions: ['.wad', '.iwad', '.pwad'],
    aspectRatio: '4 / 3',
    controllerLayout: 'snes',
    group: 'other',
  },
  quake: {
    id: 'quake',
    label: 'Quake',
    core: 'tyrquake',
    extensions: ['.pak'],
    aspectRatio: '4 / 3',
    controllerLayout: 'snes',
    group: 'other',
  },
  c64: {
    id: 'c64',
    label: 'Commodore 64',
    core: 'vice_x64',
    alternateCores: ['vice_x64sc', 'vice_xscpu64'],
    extensions: ['.d64', '.t64', '.prg', '.crt', '.tap', '.nib', '.d71', '.d81', '.g64'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
    group: 'computer',
  },
  c128: {
    id: 'c128',
    label: 'Commodore 128',
    core: 'vice_x128',
    extensions: ['.d128'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
    group: 'computer',
  },
  vic20: {
    id: 'vic20',
    label: 'VIC-20',
    core: 'vice_xvic',
    extensions: ['.20', '.40', '.60', '.a0'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
    group: 'computer',
  },
  plus4: {
    id: 'plus4',
    label: 'Commodore Plus/4',
    core: 'vice_xplus4',
    extensions: ['.d4', '.d6', '.d7'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
    group: 'computer',
  },
  pet: {
    id: 'pet',
    label: 'Commodore PET',
    core: 'vice_xpet',
    extensions: ['.pet'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
    group: 'computer',
  },
  vecx: {
    id: 'vecx',
    label: 'Vectrex',
    core: 'vecx',
    extensions: ['.vec'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
    group: 'console',
  },
  tic80: {
    id: 'tic80',
    label: 'TIC-80',
    core: 'tic80',
    extensions: ['.tic'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
    group: 'other',
  },
  wasm4: {
    id: 'wasm4',
    label: 'WASM-4',
    core: 'wasm4',
    extensions: ['.wasm'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
    group: 'other',
  },
  nxengine: {
    id: 'nxengine',
    label: 'Cave Story',
    core: 'nxengine',
    extensions: ['.nx'],
    aspectRatio: '4 / 3',
    controllerLayout: 'snes',
    group: 'other',
  },
  lowresnx: {
    id: 'lowresnx',
    label: 'LowRes NX',
    core: 'lowresnx',
    extensions: ['.lrx'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
    group: 'other',
  },
  neocd: {
    id: 'neocd',
    label: 'Neo Geo CD',
    core: 'neocd',
    extensions: [],
    aspectRatio: '4 / 3',
    controllerLayout: 'snes',
    group: 'console',
  },
  o2em: {
    id: 'o2em',
    label: 'Odyssey 2',
    core: 'o2em',
    extensions: ['.o2'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
    group: 'console',
  },
  opera: {
    id: 'opera',
    label: '3DO',
    core: 'opera',
    extensions: ['.3do'],
    aspectRatio: '4 / 3',
    controllerLayout: 'snes',
    group: 'console',
  },
  s32x: {
    id: 's32x',
    label: 'Sega 32X',
    core: 'picodrive',
    extensions: ['.32x'],
    aspectRatio: '4 / 3',
    controllerLayout: 'snes',
    group: 'console',
  },
  segacd: {
    id: 'segacd',
    label: 'Sega CD',
    core: 'genesis_plus_gx',
    alternateCores: ['picodrive'],
    extensions: ['.scd'],
    aspectRatio: '4 / 3',
    controllerLayout: 'snes',
    group: 'console',
  },
  sg1000: {
    id: 'sg1000',
    label: 'SG-1000',
    core: 'gearsystem',
    extensions: ['.sg'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
    group: 'console',
  },
  quake2: {
    id: 'quake2',
    label: 'Quake II',
    core: 'vitaquake2',
    alternateCores: ['vitaquake2-rogue', 'vitaquake2-xatrix', 'vitaquake2-zaero'],
    extensions: ['.pk3'],
    aspectRatio: '4 / 3',
    controllerLayout: 'snes',
    group: 'other',
  },
  wolf3d: {
    id: 'wolf3d',
    label: 'Wolfenstein 3D',
    core: 'ecwolf',
    extensions: ['.wl6', '.wl1', '.sod', '.sdm', '.sd2', '.sd3', '.n3d'],
    aspectRatio: '4 / 3',
    controllerLayout: 'snes',
    group: 'other',
  },
  cbm2: {
    id: 'cbm2',
    label: 'Commodore CBM-II',
    core: 'vice_xcbm2',
    alternateCores: ['vice_xcbm5x0'],
    extensions: ['.d80', '.d82'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
    group: 'computer',
  },
  arduboy: {
    id: 'arduboy',
    label: 'Arduboy',
    core: 'arduous',
    extensions: ['.hex'],
    aspectRatio: '1 / 1',
    controllerLayout: 'nes',
    group: 'handheld',
  },
  bk: {
    id: 'bk',
    label: 'Elektronika BK',
    core: 'bk',
    extensions: [],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
    group: 'computer',
  },
  chailove: {
    id: 'chailove',
    label: 'ChaiLove',
    core: 'chailove',
    extensions: ['.love'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
    group: 'other',
  },
  channelf: {
    id: 'channelf',
    label: 'Channel F',
    core: 'freechaf',
    extensions: ['.chf'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
    group: 'console',
  },
  galaksija: {
    id: 'galaksija',
    label: 'Galaksija',
    core: 'galaksija',
    extensions: ['.gal'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
    group: 'computer',
  },
  gme: {
    id: 'gme',
    label: 'Game music',
    core: 'gme',
    extensions: ['.nsf', '.nsfe', '.spc', '.vgm', '.vgz', '.gym', '.gbs', '.ay', '.hes', '.kss', '.sap'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
    group: 'other',
  },
  gw: {
    id: 'gw',
    label: 'Game & Watch',
    core: 'gw',
    extensions: ['.mgw'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
    group: 'handheld',
  },
  jaxe: {
    id: 'jaxe',
    label: 'JAXE',
    core: 'jaxe',
    extensions: ['.jax'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
    group: 'other',
  },
  jumpnbump: {
    id: 'jumpnbump',
    label: 'Jump ’n Bump',
    core: 'jumpnbump',
    extensions: ['.dat'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
    group: 'other',
  },
  lutro: {
    id: 'lutro',
    label: 'Lutro',
    core: 'lutro',
    extensions: ['.lutro'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
    group: 'other',
  },
  mac: {
    id: 'mac',
    label: 'Macintosh',
    core: 'minivmac',
    extensions: ['.hfs'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
    group: 'computer',
  },
  palm: {
    id: 'palm',
    label: 'Palm OS',
    core: 'mu',
    extensions: ['.prc', '.pdb'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
    group: 'handheld',
  },
  pc88: {
    id: 'pc88',
    label: 'PC-88',
    core: 'quasi88',
    extensions: ['.d88', '.t88', '.88d'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
    group: 'computer',
  },
  pico8: {
    id: 'pico8',
    label: 'PICO-8',
    core: 'retro8',
    extensions: ['.p8'],
    aspectRatio: '1 / 1',
    controllerLayout: 'nes',
    group: 'other',
  },
  thomson: {
    id: 'thomson',
    label: 'Thomson MO/TO',
    core: 'theodore',
    extensions: ['.k7', '.m7', '.m5'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
    group: 'computer',
  },
  ti83: {
    id: 'ti83',
    label: 'TI-83',
    core: 'numero',
    extensions: ['.8xp', '.83p', '.82p', '.8xk'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
    group: 'computer',
  },
  uzebox: {
    id: 'uzebox',
    label: 'Uzebox',
    core: 'uzem',
    extensions: ['.uze'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
    group: 'console',
  },
  x1: {
    id: 'x1',
    label: 'Sharp X1',
    core: 'x1',
    extensions: ['.dx1', '.2d', '.tfd'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
    group: 'computer',
  },
  xrick: {
    id: 'xrick',
    label: 'XRick',
    core: 'xrick',
    extensions: [],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
    group: 'other',
  },
  pcxt: {
    id: 'pcxt',
    label: 'PC XT',
    core: 'virtualxt',
    extensions: ['.ima', '.vfd'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
    group: 'computer',
  },
  j2me: {
    id: 'j2me',
    label: 'J2ME',
    core: 'squirreljme',
    extensions: ['.jar', '.jad'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
    group: 'handheld',
  },
  cdg: {
    id: 'cdg',
    label: 'CD+G',
    core: 'pocketcdg',
    extensions: ['.cdg'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
    group: 'other',
  },
  game2048: {
    id: 'game2048',
    label: '2048',
    core: '2048',
    extensions: [],
    aspectRatio: '1 / 1',
    controllerLayout: 'nes',
    group: 'other',
  },
  craft: {
    id: 'craft',
    label: 'Craft',
    core: 'craft',
    extensions: [],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
    group: 'other',
  },
  gong: {
    id: 'gong',
    label: 'Gong',
    core: 'gong',
    extensions: [],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
    group: 'other',
  },
  mrboom: {
    id: 'mrboom',
    label: 'Mr.Boom',
    core: 'mrboom',
    extensions: [],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
    group: 'other',
  },
  uw8: {
    id: 'uw8',
    label: 'MicroW8',
    core: 'uw8',
    extensions: ['.uw8'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
    group: 'other',
  },
  vaporspec: {
    id: 'vaporspec',
    label: 'VaporSpec',
    core: 'vaporspec',
    extensions: ['.vapor'],
    aspectRatio: '4 / 3',
    controllerLayout: 'nes',
    group: 'other',
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

/** Settings value: pick core from ROM name on each .zip launch. */
export const ARCADE_CORE_AUTO = 'auto'

export function isArcadeCoreAuto(coreSetting: string): boolean {
  return coreSetting === ARCADE_CORE_AUTO
}

export function resolveArcadeCore(core?: string | null): string {
  if (core && isArcadeCoreAuto(core)) return DEFAULT_ARCADE_CORE
  if (core && isNostalgistCore(core)) return core
  return DEFAULT_ARCADE_CORE
}

export interface ResolvedArcadeCore {
  core: string
  /** True when coreSetting was Auto (or inferred during auto retry). */
  auto: boolean
  sourceRom?: string
}

/** Resolve the libretro core for .zip arcade files from settings + ROM names. */
export function resolveArcadeCoreForFiles(
  files: File[],
  coreSetting: string,
): ResolvedArcadeCore {
  const zipGame =
    files.find((file) => {
      if (getExtension(file.name) !== '.zip') return false
      return !BIOS_NAME_RE.test(file.name)
    }) ?? files.find((file) => getExtension(file.name) === '.zip')

  const romName = zipGame?.name

  if (!isArcadeCoreAuto(coreSetting) && isNostalgistCore(coreSetting)) {
    return { core: coreSetting, auto: false, sourceRom: romName }
  }

  if (romName) {
    const companions = files.map((file) => file.name).filter((name) => name !== romName)
    const inferred = inferArcadeCoreForRom(romName, companions)
    if (inferred) return { core: inferred, auto: true, sourceRom: romName }
  }

  return { core: DEFAULT_ARCADE_CORE, auto: true, sourceRom: romName }
}

/** ROM basename without extension (lowercase). */
export function arcadeRomBasename(fileName: string): string {
  const lower = normalizeArcadeFileName(fileName)
  return lower.endsWith('.zip') ? lower.slice(0, -4) : lower
}

/**
 * Pick a better core for known arcade zips. KOV2/sequels and many PGM titles are
 * in FB Alpha 2012 but not MAME 2003-Plus (which only has KOV1-era drivers).
 */
export function inferArcadeCoreForRom(fileName: string, companions: string[] = []): string | null {
  const base = arcadeRomBasename(fileName)
  const bases = [base, ...companions.map((name) => arcadeRomBasename(name))]
  const hasNeoGeoBios = bases.some((name) => name === 'neogeo' || name === 'neogeo_bios')
  const hasGame = bases.some((name) => name !== 'neogeo' && name !== 'neogeo_bios' && name !== 'pgm')
  if (hasNeoGeoBios && hasGame) return 'fbalpha2012_neogeo'
  if (base.startsWith('kov2')) return 'fbalpha2012'
  const fbAlpha2012Only = [
    'ddp2',
    'ddp3',
    'photoy2k',
    'orlegend',
    'olds',
    'martmast',
    'puzzli2',
    'killbld',
    'dmnfrnt',
    'svg',
    'kovshp',
    'kovytzy',
  ]
  for (const id of fbAlpha2012Only) {
    if (base === id || base.startsWith(id)) return 'fbalpha2012'
  }
  return null
}

/** Arcade emulators a person can choose without seeing every core on the CDN. */
export const ARCADE_CORE_CHOICES: Array<{ id: string; title: string; detail: string }> = [
  { id: 'mame2003_plus', title: 'MAME 2003-Plus', detail: 'Most arcade zip sets' },
  { id: 'mame2003', title: 'MAME 2003', detail: 'Older MAME 0.78 sets' },
  { id: 'mame2000', title: 'MAME 2000', detail: 'MAME 0.37b5 and 0.37b11 sets' },
  { id: 'fbalpha2012', title: 'FB Alpha 2012', detail: 'PGM games, including Knights of Valour 2' },
  { id: 'fbalpha2012_neogeo', title: 'Neo Geo', detail: 'Also select neogeo.zip' },
  { id: 'fbalpha2012_cps1', title: 'Capcom CPS-1', detail: 'Street Fighter II era boards' },
  { id: 'fbalpha2012_cps2', title: 'Capcom CPS-2', detail: 'Later Capcom arcade boards' },
]

/** Systems shown first when confirming a file. */
export const PRIMARY_ROM_SYSTEMS: SystemId[] = [
  'nes',
  'snes',
  'gb',
  'gbc',
  'gba',
  'genesis',
  'psx',
  'arcade',
]

export interface RomPreview {
  fileNames: string[]
  system: SystemId | null
  systemReason: string
  core: string
  coreReason: string
}

export function coresForSystem(system: SystemId): string[] {
  const info = SYSTEMS[system]
  return [info.core, ...(info.alternateCores ?? [])]
}

export function resolveSystemCore(system: SystemId, requested?: string | null): string {
  const allowed = coresForSystem(system)
  if (requested && allowed.includes(requested)) return requested
  return SYSTEMS[system].core
}

/** ROMs Games categories with no core on the Nostalgist CDN. */
export const UNSUPPORTED_BROWSER_SYSTEMS = [
  'Nintendo 64',
  'Nintendo DS',
  'GameCube',
  'Wii',
  'PlayStation 2',
  'PlayStation Portable',
  'Dreamcast',
  'Saturn',
  'Xbox',
  'Atari 2600',
  'Atari 7800',
  'Atari 800',
  'ZX Spectrum',
  'Amiga 500',
  'Amstrad CPC',
  'Apple II',
  'Sharp X68000',
  'Nokia N-Gage',
] as const

export const SYSTEM_GROUP_ORDER: SystemGroup[] = ['console', 'handheld', 'computer', 'arcade', 'other']

export const SYSTEM_GROUP_LABELS: Record<SystemGroup, string> = {
  console: 'Consoles',
  handheld: 'Handhelds',
  computer: 'Computers',
  arcade: 'Arcade',
  other: 'Other',
}

const GENERIC_EXTENSIONS = new Set(['.bin', '.rom', '.zip', '.iso', '.img', '.dsk', '.dat'])

export function previewRomFiles(
  files: File[],
  arcadeCoreSetting: string,
  systemOverride?: SystemId | null,
  coreOverride?: string | null,
): RomPreview {
  const fileNames = files.map((file) => file.name)
  const detected = detectSystemFromFiles(files)
  const system = systemOverride ?? detected
  let systemReason = 'This file type is not recognized. Choose the system it belongs to.'
  if (!detected && system) {
    systemReason = `The extension is not tied to one system. This will load as ${SYSTEMS[system].label}.`
  } else if (detected && system && system !== detected) {
    systemReason = `The extension looks like ${SYSTEMS[detected].label}. This will load as ${SYSTEMS[system].label}.`
  } else if (detected === 'arcade') {
    const game = files.find(
      (file) => getExtension(file.name) === '.zip' && !BIOS_NAME_RE.test(file.name),
    )
    systemReason = game
      ? `${game.name} is a zip, so it is treated as an arcade ROM.`
      : 'Zip files are treated as arcade ROMs.'
  } else if (detected && system) {
    const primary = files.find((file) => detectSystem(file.name) === detected)
    systemReason = primary
      ? `${primary.name} matches ${SYSTEMS[detected].label}.`
      : `Detected ${SYSTEMS[detected].label}.`
  }

  if (!system) {
    return { fileNames, system: null, systemReason, core: '', coreReason: '' }
  }

  if (system !== 'arcade') {
    const core = resolveSystemCore(system, coreOverride)
    return {
      fileNames,
      system,
      systemReason,
      core,
      coreReason: `${SYSTEMS[system].label} uses ${coreLabel(core)}.`,
    }
  }

  const resolved = resolveArcadeCoreForFiles(files, arcadeCoreSetting)
  return {
    fileNames,
    system,
    systemReason,
    core: resolved.core,
    coreReason: arcadeCoreReason(arcadeCoreSetting, resolved.core),
  }
}

function arcadeCoreReason(coreSetting: string, core: string): string {
  if (!isArcadeCoreAuto(coreSetting)) {
    return `${coreLabel(core)} is the emulator you chose for arcade zips.`
  }
  if (core === 'fbalpha2012_neogeo') {
    return 'neogeo.zip is included, so the Neo Geo emulator is selected.'
  }
  if (core === 'fbalpha2012') {
    return 'This name is a PGM set. FB Alpha 2012 plays it. MAME 2003-Plus does not.'
  }
  return 'Nothing special in the file name. MAME 2003-Plus plays most arcade zips. A set marked MAME 0.37b11 needs MAME 2000 instead.'
}

/** Label for the settings / dropdown value (includes Auto). */
export function arcadeCoreSettingLabel(coreSetting: string): string {
  if (isArcadeCoreAuto(coreSetting)) return 'Automatic'
  const choice = ARCADE_CORE_CHOICES.find((item) => item.id === coreSetting)
  if (choice) return choice.title
  return coreLabel(coreSetting)
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
  let best: { system: SystemId; score: number } | null = null
  for (const file of files) {
    const system = detectSystem(file.name)
    if (!system) continue
    const ext = getExtension(file.name)
    const score = (GENERIC_EXTENSIONS.has(ext) ? 0 : 100) + ext.length
    if (!best || score > best.score) best = { system, score }
  }
  return best?.system ?? null
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
