import type { PeerSeat } from '../peer/protocol'

export const COOP_FRAME_MS = 1000 / 60
export const MIN_LOOKAHEAD_FRAMES = 3
export const MAX_LOOKAHEAD_FRAMES = 15
export const STALL_UI_MS = 250
export const MAX_CATCHUP_STEPS_PER_RAF = 2
export const HARD_RESYNC_BEHIND_FRAMES = 90
export const STALL_DISCONNECT_MS = 5000
export const STATE_HASH_INTERVAL_FRAMES = 600

export interface InputEdge {
  seat: PeerSeat
  button: string
  down: boolean
}

export interface LockstepState {
  frame: number
  remoteHorizon: number
  lastSentTag: number
  lookaheadFrames: number
  stepping: boolean
  coordinatedPause: boolean
  stallStartMs: number | null
  /** frame index -> input edges to apply before stepping that frame */
  inputQueues: Map<number, InputEdge[]>
  /** adaptive lookahead telemetry (10 s window) */
  stallCount: number
  minSlack: number
  adaptiveWindowStartMs: number
  /** smoothed catch-up debt in frames */
  catchUpDebt: number
  /** display refresh rate estimate */
  displayHz: number
  rafSkip: number
}

export function msToLookaheadFrames(delayMs: number): number {
  return Math.min(
    MAX_LOOKAHEAD_FRAMES,
    Math.max(MIN_LOOKAHEAD_FRAMES, Math.ceil(delayMs / COOP_FRAME_MS)),
  )
}

export function createLockstepState(lookaheadFrames: number, displayHz = 60): LockstepState {
  return {
    frame: 0,
    remoteHorizon: -1,
    lastSentTag: -1,
    lookaheadFrames,
    stepping: false,
    coordinatedPause: false,
    stallStartMs: null,
    inputQueues: new Map(),
    stallCount: 0,
    minSlack: Number.POSITIVE_INFINITY,
    adaptiveWindowStartMs: Date.now(),
    catchUpDebt: 0,
    displayHz,
    rafSkip: 0,
  }
}

export function resetLockstepState(state: LockstepState, lookaheadFrames?: number): void {
  state.frame = 0
  state.remoteHorizon = -1
  state.lastSentTag = -1
  if (lookaheadFrames !== undefined) state.lookaheadFrames = lookaheadFrames
  state.stallStartMs = null
  state.inputQueues.clear()
  state.stallCount = 0
  state.minSlack = Number.POSITIVE_INFINITY
  state.adaptiveWindowStartMs = Date.now()
  state.catchUpDebt = 0
}

export function flushInputQueues(state: LockstepState): void {
  state.inputQueues.clear()
  state.lastSentTag = -1
}

function queueEdge(state: LockstepState, frame: number, edge: InputEdge): void {
  const list = state.inputQueues.get(frame)
  if (list) list.push(edge)
  else state.inputQueues.set(frame, [edge])
}

export function tagLocalInput(
  state: LockstepState,
  seat: PeerSeat,
  button: string,
  down: boolean,
): { tag: number; edge: InputEdge } {
  const raw = state.frame + state.lookaheadFrames
  const tag = Math.max(raw, state.lastSentTag + 1)
  state.lastSentTag = tag
  const edge: InputEdge = { seat, button, down }
  queueEdge(state, tag, edge)
  return { tag, edge }
}

export function queueRemoteInput(
  state: LockstepState,
  seat: PeerSeat,
  button: string,
  down: boolean,
  frame: number,
): void {
  queueEdge(state, frame, { seat, button, down })
}

export function computeOutgoingHorizon(state: LockstepState): number {
  return Math.max(state.lastSentTag, state.frame + state.lookaheadFrames - 1)
}

export function canAdvance(state: LockstepState): boolean {
  if (!state.stepping || state.coordinatedPause) return false
  return state.remoteHorizon >= state.frame
}

export function getInputsForFrame(state: LockstepState, frame: number): InputEdge[] {
  const edges = state.inputQueues.get(frame)
  if (edges) state.inputQueues.delete(frame)
  return edges ?? []
}

export function advanceFrame(state: LockstepState): void {
  state.frame += 1
  state.stallStartMs = null
}

export function recordStall(state: LockstepState, now: number): void {
  state.stallCount += 1
  if (state.stallStartMs === null) state.stallStartMs = now
}

export function recordSlack(state: LockstepState): void {
  const slack = state.remoteHorizon - state.frame
  if (slack < state.minSlack) state.minSlack = slack
}

/** Returns new lookahead if changed, else null. Call once per ~10 s. */
export function tickAdaptiveLookahead(state: LockstepState, now: number): number | null {
  const elapsed = now - state.adaptiveWindowStartMs
  if (elapsed < 10_000) return null

  let next = state.lookaheadFrames
  if (state.stallCount >= 2 && next < MAX_LOOKAHEAD_FRAMES) {
    next += 1
  } else if (state.minSlack > 3 && next > MIN_LOOKAHEAD_FRAMES && elapsed >= 30_000) {
    next -= 1
  }

  state.stallCount = 0
  state.minSlack = Number.POSITIVE_INFINITY
  state.adaptiveWindowStartMs = now

  if (next !== state.lookaheadFrames) {
    state.lookaheadFrames = next
    return next
  }
  return null
}

/** Steps to attempt this rAF (vsync-aligned on ~60 Hz). */
export function planStepsForFrame(
  state: LockstepState,
  deltaMs: number,
  now: number,
): { steps: number; stalled: boolean } {
  if (!state.stepping || state.coordinatedPause) return { steps: 0, stalled: false }

  // Vsync-aligned: ~60 Hz displays step once per rAF
  const near60 = state.displayHz >= 55 && state.displayHz <= 65
  if (near60) {
    state.rafSkip = (state.rafSkip + 1) % 1
    if (!canAdvance(state)) {
      recordStall(state, now)
      return { steps: 0, stalled: true }
    }
    recordSlack(state)
    return { steps: 1, stalled: false }
  }

  // 120 Hz: every other frame
  if (state.displayHz >= 110 && state.displayHz <= 130) {
    state.rafSkip = (state.rafSkip + 1) % 2
    if (state.rafSkip !== 0) return { steps: 0, stalled: false }
    if (!canAdvance(state)) {
      recordStall(state, now)
      return { steps: 0, stalled: true }
    }
    recordSlack(state)
    return { steps: 1, stalled: false }
  }

  // Accumulator for other refresh rates + catch-up
  state.catchUpDebt += (deltaMs / 1000) * 60
  let steps = Math.floor(state.catchUpDebt)
  if (steps <= 0) return { steps: 0, stalled: false }

  steps = Math.min(steps, MAX_CATCHUP_STEPS_PER_RAF)
  let actual = 0
  let stalled = false
  for (let i = 0; i < steps; i++) {
    if (!canAdvance(state)) {
      recordStall(state, now)
      stalled = true
      break
    }
    recordSlack(state)
    actual += 1
  }
  state.catchUpDebt -= actual
  return { steps: actual, stalled }
}

export function estimateDisplayHz(deltaMs: number, prevHz: number): number {
  if (deltaMs <= 0 || !Number.isFinite(deltaMs)) return prevHz
  const instant = 1000 / deltaMs
  if (!Number.isFinite(instant) || instant < 30 || instant > 240) return prevHz
  return prevHz * 0.85 + instant * 0.15
}
