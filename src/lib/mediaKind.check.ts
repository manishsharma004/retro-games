import { classifyMediaName } from './mediaKind'

function assert(cond: boolean, message: string) {
  if (!cond) throw new Error(message)
}

assert(classifyMediaName('song.mp3')?.kind === 'music', 'mp3 is music')
assert(classifyMediaName('clip.mp4')?.kind === 'video', 'mp4 is video')
assert(classifyMediaName('shot.JPEG')?.kind === 'photo', 'jpeg is a photo')
assert(classifyMediaName('game.nes')?.kind === 'game', 'nes is a game')
assert(classifyMediaName('game.nes')?.system === 'nes', 'nes system is detected')
assert(classifyMediaName('set.zip')?.kind === 'game', 'zip stays a game for the arcade path')
assert(classifyMediaName('notes.bin') === null, 'generic bin is not imported as a game')
assert(classifyMediaName('readme.txt') === null, 'unknown files are skipped')

console.log('media kind checks ok')
