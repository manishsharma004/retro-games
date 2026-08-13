/** Every libretro core shipped on Nostalgist's default CDN. @see https://nostalgist.js.org/apis/launch#core */
export interface NostalgistCoreOption {
  id: string
  label: string
}

export const NOSTALGIST_CORES: NostalgistCoreOption[] = [
  { id: '2048', label: '2048' },
  { id: 'arduous', label: 'Arduous' },
  { id: 'bk', label: 'bk' },
  { id: 'bluemsx', label: 'blueMSX' },
  { id: 'chailove', label: 'ChaiLove' },
  { id: 'craft', label: 'Craft' },
  { id: 'ecwolf', label: 'ECWolf' },
  { id: 'fbalpha2012', label: 'FB Alpha 2012' },
  { id: 'fbalpha2012_cps1', label: 'FB Alpha 2012 CPS-1' },
  { id: 'fbalpha2012_cps2', label: 'FB Alpha 2012 CPS-2' },
  { id: 'fbalpha2012_neogeo', label: 'FB Alpha 2012 Neo Geo' },
  { id: 'fceumm', label: 'FCEUmm (NES)' },
  { id: 'freechaf', label: 'FreeChaF' },
  { id: 'galaksija', label: 'Galaksija' },
  { id: 'gambatte', label: 'Gambatte (GB/GBC)' },
  { id: 'gearboy', label: 'Gearboy' },
  { id: 'gearcoleco', label: 'Gearcoleco' },
  { id: 'gearsystem', label: 'Gearsystem (SMS/GG)' },
  { id: 'genesis_plus_gx', label: 'Genesis Plus GX' },
  { id: 'genesis_plus_gx_wide', label: 'Genesis Plus GX Wide' },
  { id: 'gme', label: 'Game Music Emu' },
  { id: 'gong', label: 'Gong' },
  { id: 'gw', label: 'GW' },
  { id: 'handy', label: 'Handy (Lynx)' },
  { id: 'jaxe', label: 'JAXE' },
  { id: 'jumpnbump', label: 'jumpnbump' },
  { id: 'lowresnx', label: 'LowRes NX' },
  { id: 'lutro', label: 'Lutro' },
  { id: 'mame2000', label: 'MAME 2000 (0.37b5)' },
  { id: 'mame2003', label: 'MAME 2003 (0.78)' },
  { id: 'mame2003_plus', label: 'MAME 2003-Plus' },
  { id: 'mednafen_lynx', label: 'Beetle Lynx' },
  { id: 'mednafen_ngp', label: 'Beetle NeoPop' },
  { id: 'mednafen_pce_fast', label: 'Beetle PCE Fast' },
  { id: 'mednafen_vb', label: 'Beetle VB' },
  { id: 'mednafen_wswan', label: 'Beetle WonderSwan' },
  { id: 'mgba', label: 'mGBA' },
  { id: 'minivmac', label: 'Minivmac II' },
  { id: 'mrboom', label: 'Mr.Boom' },
  { id: 'mu', label: 'Mu' },
  { id: 'neocd', label: 'NeoCD' },
  { id: 'nestopia', label: 'Nestopia (NES)' },
  { id: 'numero', label: 'Numero' },
  { id: 'nxengine', label: 'NXEngine' },
  { id: 'o2em', label: 'O2EM' },
  { id: 'opera', label: 'Opera (3DO)' },
  { id: 'pcsx_rearmed', label: 'PCSX-ReARMed (PSX)' },
  { id: 'picodrive', label: 'PicoDrive' },
  { id: 'pocketcdg', label: 'PocketCDG' },
  { id: 'prboom', label: 'PrBoom (Doom)' },
  { id: 'quasi88', label: 'QUASI88' },
  { id: 'quicknes', label: 'QuickNES' },
  { id: 'retro8', label: 'Retro8' },
  { id: 'snes9x', label: 'Snes9x' },
  { id: 'snes9x2002', label: 'Snes9x 2002' },
  { id: 'snes9x2005', label: 'Snes9x 2005' },
  { id: 'snes9x2010', label: 'Snes9x 2010' },
  { id: 'squirreljme', label: 'SquirrelJME' },
  { id: 'tgbdual', label: 'TGB Dual' },
  { id: 'theodore', label: 'Theodore' },
  { id: 'tic80', label: 'TIC-80' },
  { id: 'tyrquake', label: 'TyrQuake' },
  { id: 'uw8', label: 'MicroW8' },
  { id: 'uzem', label: 'Uzem' },
  { id: 'vaporspec', label: 'VaporSpec' },
  { id: 'vba_next', label: 'VBA Next' },
  { id: 'vecx', label: 'Vectrex' },
  { id: 'vice_x128', label: 'VICE C128' },
  { id: 'vice_x64', label: 'VICE C64' },
  { id: 'vice_x64sc', label: 'VICE C64SC' },
  { id: 'vice_xcbm2', label: 'VICE CBM-II' },
  { id: 'vice_xcbm5x0', label: 'VICE CBM 5x0' },
  { id: 'vice_xpet', label: 'VICE PET' },
  { id: 'vice_xplus4', label: 'VICE Plus/4' },
  { id: 'vice_xscpu64', label: 'VICE SCPU64' },
  { id: 'vice_xvic', label: 'VICE VIC-20' },
  { id: 'virtualxt', label: 'VirtualXT' },
  { id: 'vitaquake2', label: 'vitaQuake 2' },
  { id: 'vitaquake2-rogue', label: 'vitaQuake 2 Rogue' },
  { id: 'vitaquake2-xatrix', label: 'vitaQuake 2 Xatrix' },
  { id: 'vitaquake2-zaero', label: 'vitaQuake 2 Zaero' },
  { id: 'wasm4', label: 'WASM-4' },
  { id: 'x1', label: 'X1' },
  { id: 'xrick', label: 'XRick' },
]

const CORE_IDS = new Set(NOSTALGIST_CORES.map((c) => c.id))

export function isNostalgistCore(core: string): boolean {
  return CORE_IDS.has(core)
}

/** Short hint for cores commonly used with .zip arcade ROMs. */
const ARCADE_CORE_HINTS: Record<string, string> = {
  mame2003_plus: ' — recommended for MAME .zip',
  mame2003: ' — MAME 0.78',
  mame2000: ' — MAME 0.37 (older sets)',
  fbalpha2012: ' — PGM / KOV2 / IGS (not generic MAME .zip)',
  fbalpha2012_neogeo: ' — Neo Geo (+ neogeo.zip)',
  fbalpha2012_cps1: ' — CPS-1',
  fbalpha2012_cps2: ' — CPS-2',
}

export function coreLabel(coreId: string): string {
  return NOSTALGIST_CORES.find((c) => c.id === coreId)?.label ?? coreId
}

/** Dropdown label for .zip core picker — includes ROM-set guidance. */
export function arcadeCoreOptionLabel(core: NostalgistCoreOption): string {
  return `${core.label}${ARCADE_CORE_HINTS[core.id] ?? ''}`
}
