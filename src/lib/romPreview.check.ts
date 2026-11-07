import { ARCADE_CORE_CHOICES, NOSTALGIST_CORES, SYSTEMS, coresForSystem, previewRomFiles, resolveArcadeCoreForFiles } from './cores'

function file(name: string): File {
  return new File([new Uint8Array([1])], name)
}

function assert(cond: boolean, message: string) {
  if (!cond) throw new Error(message)
}

const nes = previewRomFiles([file('game.nes')], 'auto')
assert(nes.system === 'nes', 'nes extension')
assert(nes.systemReason.includes('game.nes'), 'nes reason names the file')
assert(nes.core === 'fceumm', 'nes core')

const zip = previewRomFiles([file('pacman.zip')], 'auto')
assert(zip.system === 'arcade', 'zip is arcade')
assert(zip.core === 'mame2003_plus', 'default arcade core')
assert(zip.coreReason.includes('MAME 2003-Plus'), 'default reason')

const kov = resolveArcadeCoreForFiles([file('kov2.zip'), file('pgm.zip')], 'auto')
assert(kov.core === 'fbalpha2012', 'kov2 uses fb alpha')

const neo = previewRomFiles([file('mslug.zip'), file('neogeo.zip')], 'auto')
assert(neo.core === 'fbalpha2012_neogeo', 'neogeo bios selects neo geo')
assert(neo.coreReason.includes('neogeo.zip'), 'neo reason')

const forced = previewRomFiles([file('pacman.zip')], 'auto', 'nes')
assert(forced.system === 'nes', 'override system')
assert(forced.systemReason.includes('Arcade'), 'override explains the extension')

assert(previewRomFiles([file('game.32x')], 'auto').system === 's32x', '32x')
assert(previewRomFiles([file('game.sg')], 'auto').system === 'sg1000', 'sg-1000')
assert(previewRomFiles([file('game.fds')], 'auto').system === 'nes', 'fds')
assert(previewRomFiles([file('game.ws')], 'auto').system === 'wswan', 'wonderswan')
assert(previewRomFiles([file('game.vb')], 'auto').system === 'vb', 'virtual boy')
assert(previewRomFiles([file('game.chf')], 'auto').system === 'channelf', 'channel f')
assert(previewRomFiles([file('disc.cue'), file('disc.bin')], 'auto').system === 'psx', 'cue beats bin')
assert(previewRomFiles([file('game.nes')], 'auto', null, 'nestopia').core === 'nestopia', 'nes alternate')

const covered = new Set<string>([
  ...Object.values(SYSTEMS).flatMap((system) => coresForSystem(system.id)),
  ...ARCADE_CORE_CHOICES.map((choice) => choice.id),
])
const missing = NOSTALGIST_CORES.map((core) => core.id).filter((id) => !covered.has(id))
assert(missing.length === 0, `cores missing a system: ${missing.join(', ')}`)

console.log('rom preview checks ok')
