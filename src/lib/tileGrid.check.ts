import { stepWrappedTile } from './tileGrid'

function assert(cond: boolean, message: string) {
  if (!cond) throw new Error(message)
}

const right = stepWrappedTile(0, 6, 3, 'right')
assert(typeof right === 'object' && right.index === 1, 'right moves to the next tile')
const down = stepWrappedTile(1, 6, 3, 'down')
assert(typeof down === 'object' && down.index === 4, 'down moves to the tile in the next row')
assert(stepWrappedTile(1, 6, 3, 'up') === 'out-up', 'up from the first row leaves the grid')
assert(stepWrappedTile(4, 6, 3, 'down') === 'out-down', 'down from the last row leaves the grid')
const up = stepWrappedTile(4, 6, 3, 'up')
assert(typeof up === 'object' && up.index === 1, 'up returns to the tile above')

console.log('tile grid checks ok')
