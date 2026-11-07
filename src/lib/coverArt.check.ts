import { coverSeed, shelfTitle } from './coverArt'

function assert(cond: boolean, message: string) {
  if (!cond) throw new Error(message)
}

assert(shelfTitle('Super_Mario_Bros.nes') === 'Super Mario Bros', 'underscores become spaces')
assert(shelfTitle('kov2.zip') === 'kov2', 'short names stay')
assert(coverSeed('nes:flappy') === coverSeed('nes:flappy'), 'seed is stable')
assert(coverSeed('nes:flappy') !== coverSeed('snes:flappy'), 'system changes the seed')

console.log('cover art checks ok')
