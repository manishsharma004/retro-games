import { readMenuCommands } from './useMenuPad'
import type { PadSnapshot } from '../lib/gamepad'

function assert(cond: boolean, message: string) {
  if (!cond) throw new Error(message)
}

function pad(pressed: number[]): PadSnapshot {
  const buttons = Array.from({ length: 16 }, (_, index) => ({
    pressed: pressed.includes(index),
    value: pressed.includes(index) ? 1 : 0,
  }))
  return {
    id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)',
    mapping: 'standard',
    buttons,
    axes: [0, 0, 0, 0],
  }
}

const south = readMenuCommands(pad([0]))
assert(south.has('confirm') && !south.has('back'), 'south button confirms')
const east = readMenuCommands(pad([1]))
assert(east.has('back') && !east.has('confirm'), 'east button goes back')
const dpad = readMenuCommands(pad([12, 15]))
assert(dpad.has('up') && dpad.has('right'), 'd-pad reaches up and right')

console.log('menu pad checks ok')
