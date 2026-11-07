import { zipSync } from 'fflate'
import { prepareRomFiles } from './zipRoms'

function assert(cond: boolean, message: string) {
  if (!cond) throw new Error(message)
}

function zipped(name: string, contents: Uint8Array, zipName: string): File {
  const archive = zipSync({ [name]: contents })
  return new File([archive], zipName, { type: 'application/zip' })
}

const wrapped = await prepareRomFiles([
  zipped('Tiny Toon Adventures (USA).nes', new Uint8Array([0x4e, 0x45, 0x53]), 'Tiny Toon Adventures.zip'),
])
assert(wrapped.length === 1, 'wrapped zip becomes one file')
assert(wrapped[0].name.endsWith('.nes'), `expected the nes inside, got ${wrapped[0].name}`)

const arcade = await prepareRomFiles([
  zipped('btoons.1', new Uint8Array([1, 2, 3]), 'btoons.zip'),
])
assert(arcade.length === 1 && arcade[0].name === 'btoons.zip', 'chip zip stays an arcade zip')

const plain = await prepareRomFiles([new File([new Uint8Array([1])], 'game.nes')])
assert(plain[0].name === 'game.nes', 'plain roms pass through')

console.log('zip rom checks ok')
