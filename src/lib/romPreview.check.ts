import { previewRomFiles, resolveArcadeCoreForFiles } from './cores'

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

console.log('rom preview checks ok')
