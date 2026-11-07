import {
  DEFAULT_CONTROLLER_BINDINGS,
  friendlyPadName,
  padProfile,
  readRetroButtons,
  resolveSeatPads,
  type PadSnapshot,
} from './gamepad'

function pad(partial: Partial<PadSnapshot> & Pick<PadSnapshot, 'id' | 'mapping'>): PadSnapshot {
  const buttons = partial.buttons ?? Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }))
  return {
    id: partial.id,
    mapping: partial.mapping,
    buttons,
    axes: partial.axes ?? [0, 0, 0, 0],
  }
}

function down(snapshot: PadSnapshot, index: number): PadSnapshot {
  const buttons = snapshot.buttons.map((button, i) =>
    i === index ? { pressed: true, value: 1 } : button,
  )
  return { ...snapshot, buttons }
}

function names(snapshot: PadSnapshot): string[] {
  return [...readRetroButtons(snapshot)].sort()
}

function assert(cond: boolean, message: string) {
  if (!cond) throw new Error(message)
}

const xboxStandard = pad({
  id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)',
  mapping: 'standard',
})
assert(padProfile(xboxStandard.id, xboxStandard.mapping) === 'standard', 'xbox standard profile')
assert(friendlyPadName(xboxStandard.id) === 'Xbox Series', 'xbox series name')
assert(names(down(xboxStandard, 0)).includes('b'), 'xbox A is B')
assert(names(down(xboxStandard, 1)).includes('a'), 'xbox B is A')
assert(names(down(xboxStandard, 2)).includes('y'), 'xbox X is Y')
assert(names(down(xboxStandard, 3)).includes('x'), 'xbox Y is X')
assert(names(down(xboxStandard, 8)).join() === 'select', 'xbox view is select')
assert(names(down(xboxStandard, 9)).join() === 'start', 'xbox menu is start')
assert(names(down(xboxStandard, 12)).join() === 'up', 'xbox dpad up')
assert(!names(down(xboxStandard, 16)).includes('select'), 'guide is ignored')

const dualsense = pad({
  id: 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)',
  mapping: 'standard',
})
assert(friendlyPadName(dualsense.id) === 'DualSense', 'dualsense name')
assert(names(down(dualsense, 0)).join() === 'b', 'cross is B')
assert(names(down(dualsense, 1)).join() === 'a', 'circle is A')
assert(names(down(dualsense, 2)).join() === 'y', 'square is Y')
assert(names(down(dualsense, 3)).join() === 'x', 'triangle is X')
assert(names(down(dualsense, 8)).join() === 'select', 'create is select')
assert(names(down(dualsense, 4)).join() === 'l', 'L1')
assert(names(down(dualsense, 5)).join() === 'r', 'R1')
assert(names({ ...dualsense, axes: [0.05, 0.05, 1, 1] }).length === 0, 'drift and right stick are ignored')
assert(names({ ...dualsense, axes: [0, -0.9, 1, -1] }).join() === 'up', 'left stick up, right stick ignored')
assert(names({ ...dualsense, axes: [-1, -1, 0, 0] }).join() === 'left,up', 'stick diagonal')

const restingTriggers = pad({
  id: 'Xbox 360 Controller',
  mapping: '',
  buttons: Array.from({ length: 11 }, () => ({ pressed: false, value: 0 })),
  axes: [0, 0, -1, 0, 0, -1, -1, -1],
})
assert(padProfile(restingTriggers.id, '') === 'xbox', 'raw xbox')
assert(names(restingTriggers).length === 0, 'resting triggers are not a direction')
assert(
  names({ ...restingTriggers, axes: [0, 0, -1, 0, 0, -1, 0, -1] }).join() === 'up',
  'raw xbox hat up',
)
assert(names(down(restingTriggers, 6)).join() === 'select', 'raw xbox back')
assert(names(down(restingTriggers, 7)).join() === 'start', 'raw xbox start')
assert(!names(down(restingTriggers, 8)).includes('select'), 'raw xbox guide ignored')

const ds4 = pad({
  id: '054c-09cc-Wireless Controller',
  mapping: '',
})
assert(padProfile(ds4.id, '') === 'playstation', 'raw ds4')
assert(friendlyPadName(ds4.id) === 'DualShock 4', 'ds4 name')
assert(names(down(ds4, 8)).join() === 'select', 'raw ds4 share')
assert(names(down(ds4, 9)).join() === 'start', 'raw ds4 options')

const seats = resolveSeatPads(
  { ...DEFAULT_CONTROLLER_BINDINGS, pad1: 1, pad2: 'auto' },
  [1, 2],
  [0, 1],
)
assert(seats.get(1) === 1, 'explicit pad wins')
assert(seats.get(2) === 0, 'auto skips the pinned pad')

const loneGuest = resolveSeatPads(DEFAULT_CONTROLLER_BINDINGS, [2], [0])
assert(loneGuest.get(2) === 0, 'a single pad still drives player 2')

console.log('gamepad checks ok')
