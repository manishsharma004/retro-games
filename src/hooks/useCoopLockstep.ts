import { useCallback, useEffect, useRef, useState } from 'react'
import {
  advanceFrame,
  computeOutgoingHorizon,
  createLockstepState,
  estimateDisplayHz,
  flushInputQueues,
  getInputsForFrame,
  HARD_RESYNC_BEHIND_FRAMES,
  planStepsForFrame,
  queueRemoteInput,
  resetLockstepState,
  STALL_DISCONNECT_MS,
  STALL_UI_MS,
  STATE_HASH_INTERVAL_FRAMES,
  tagLocalInput,
  tickAdaptiveLookahead,
  type InputEdge,
  type LockstepState,
} from '../lib/coop/lockstep'
import { hashStateBytes } from '../lib/coop/stateHash'
import type { PeerSeat } from '../lib/peer'

const COOP_FRAME_MS = 1000 / 60

interface CoopInputHandlers {
  pressDown: (button: string, player: number) => void
  pressUp: (button: string, player: number) => void
}

export interface UseCoopLockstepOptions {
  enabled: boolean
  localSeat: PeerSeat | null
  lookaheadFrames: number
  connected: boolean
  handlers: CoopInputHandlers
  beginLockstep: () => void
  stopLockstep: () => void
  stepFrame: () => void
  exportStateBytes: () => Promise<Uint8Array | null>
  sendLockstepInput: (button: string, down: boolean, frame: number) => void
  sendInputHorizon: (f: number) => void
  sendLockstepPause: () => void
  sendLockstepResume: (at: number) => void
  sendStateHash: (hash: string, frame: number) => void
  onHashMismatch: () => void
  onHardResyncNeeded: () => void
}

export function useCoopLockstep({
  enabled,
  localSeat,
  lookaheadFrames,
  connected,
  handlers,
  beginLockstep,
  stopLockstep,
  stepFrame,
  exportStateBytes,
  sendLockstepInput,
  sendInputHorizon,
  sendLockstepPause,
  sendLockstepResume,
  sendStateHash,
  onHashMismatch,
  onHardResyncNeeded,
}: UseCoopLockstepOptions) {
  const stateRef = useRef<LockstepState>(createLockstepState(lookaheadFrames))
  const handlersRef = useRef(handlers)
  const rafRef = useRef(0)
  const lastRafMsRef = useRef(0)
  const startScheduledRef = useRef<number | null>(null)
  const [waitingForPeer, setWaitingForPeer] = useState(false)
  const [frame, setFrame] = useState(0)

  handlersRef.current = handlers

  useEffect(() => {
    stateRef.current.lookaheadFrames = lookaheadFrames
  }, [lookaheadFrames])

  const applyEdges = useCallback((edges: InputEdge[]) => {
    for (const edge of edges) {
      if (edge.down) handlersRef.current.pressDown(edge.button, edge.seat)
      else handlersRef.current.pressUp(edge.button, edge.seat)
    }
  }, [])

  const publishHorizon = useCallback(() => {
    const f = computeOutgoingHorizon(stateRef.current)
    sendInputHorizon(f)
  }, [sendInputHorizon])

  const runStepLoop = useCallback(() => {
    const state = stateRef.current
    if (!state.stepping) return

    const now = performance.now()
    const delta = lastRafMsRef.current ? now - lastRafMsRef.current : COOP_FRAME_MS
    lastRafMsRef.current = now
    state.displayHz = estimateDisplayHz(delta, state.displayHz)

    const { steps, stalled } = planStepsForFrame(state, delta, now)

    if (stalled) {
      const stallMs = state.stallStartMs ? now - state.stallStartMs : 0
      setWaitingForPeer(stallMs >= STALL_UI_MS)
      if (!connected && stallMs >= STALL_DISCONNECT_MS) {
        onHardResyncNeeded()
      }
    } else {
      setWaitingForPeer(false)
    }

    tickAdaptiveLookahead(state, Date.now())

    for (let i = 0; i < steps; i++) {
      const edges = getInputsForFrame(state, state.frame)
      applyEdges(edges)
      stepFrame()
      advanceFrame(state)
      publishHorizon()

      if (state.frame > 0 && state.frame % STATE_HASH_INTERVAL_FRAMES === 0) {
        void exportStateBytes().then((bytes) => {
          if (!bytes) return
          sendStateHash(hashStateBytes(bytes), state.frame)
        })
      }
    }

    if (state.catchUpDebt > HARD_RESYNC_BEHIND_FRAMES) {
      onHardResyncNeeded()
    }

    setFrame(state.frame)
    rafRef.current = requestAnimationFrame(runStepLoop)
  }, [
    applyEdges,
    connected,
    exportStateBytes,
    onHardResyncNeeded,
    publishHorizon,
    sendStateHash,
    stepFrame,
  ])

  const stopStepperInternal = useCallback(() => {
    stateRef.current.stepping = false
    cancelAnimationFrame(rafRef.current)
    rafRef.current = 0
    lastRafMsRef.current = 0
    stopLockstep()
    setWaitingForPeer(false)
  }, [stopLockstep])

  const startStepper = useCallback(
    (at?: number) => {
      const run = () => {
        resetLockstepState(stateRef.current, lookaheadFrames)
        flushInputQueues(stateRef.current)
        stateRef.current.stepping = true
        stateRef.current.coordinatedPause = false
        beginLockstep()
        setFrame(0)
        lastRafMsRef.current = 0
        publishHorizon()
        cancelAnimationFrame(rafRef.current)
        rafRef.current = requestAnimationFrame(runStepLoop)
      }

      if (!at) {
        run()
        return
      }
      const delay = at - Date.now()
      if (delay <= 0) run()
      else {
        startScheduledRef.current = window.setTimeout(run, delay)
      }
    },
    [beginLockstep, lookaheadFrames, publishHorizon, runStepLoop],
  )

  const resetAndStop = useCallback(() => {
    if (startScheduledRef.current !== null) {
      window.clearTimeout(startScheduledRef.current)
      startScheduledRef.current = null
    }
    stopStepperInternal()
    resetLockstepState(stateRef.current, lookaheadFrames)
    flushInputQueues(stateRef.current)
    setFrame(0)
  }, [lookaheadFrames, stopStepperInternal])

  useEffect(() => {
    if (!enabled) resetAndStop()
    return () => resetAndStop()
  }, [enabled, resetAndStop])

  const queueLocalInput = useCallback(
    (button: string, down: boolean) => {
      if (!enabled || localSeat === null || !stateRef.current.stepping) return
      const { tag } = tagLocalInput(stateRef.current, localSeat, button, down)
      sendLockstepInput(button, down, tag)
      publishHorizon()
    },
    [enabled, localSeat, publishHorizon, sendLockstepInput],
  )

  const applyRemoteInput = useCallback(
    (seat: PeerSeat, button: string, down: boolean, inputFrame: number) => {
      if (!enabled || localSeat === null || seat === localSeat) return
      queueRemoteInput(stateRef.current, seat, button, down, inputFrame)
    },
    [enabled, localSeat],
  )

  const applyRemoteHorizon = useCallback((f: number) => {
    const state = stateRef.current
    if (f > state.remoteHorizon) state.remoteHorizon = f
  }, [])

  const handleCoordinatedPause = useCallback(() => {
    stateRef.current.coordinatedPause = true
    stopStepperInternal()
  }, [stopStepperInternal])

  const handleCoordinatedResume = useCallback(
    (at: number) => {
      startStepper(at)
    },
    [startStepper],
  )

  const requestCoordinatedPause = useCallback(() => {
    sendLockstepPause()
    handleCoordinatedPause()
  }, [handleCoordinatedPause, sendLockstepPause])

  const requestCoordinatedResume = useCallback(() => {
    const at = Date.now() + 400
    sendLockstepResume(at)
    startStepper(at)
  }, [sendLockstepResume, startStepper])

  const handleRemoteStateHash = useCallback(
    (hash: string, atFrame: number) => {
      void exportStateBytes().then((bytes) => {
        if (!bytes) return
        const local = hashStateBytes(bytes)
        if (local !== hash && Math.abs(stateRef.current.frame - atFrame) < 5) {
          onHashMismatch()
        }
      })
    },
    [exportStateBytes, onHashMismatch],
  )

  return {
    queueLocalInput,
    applyRemoteInput,
    applyRemoteHorizon,
    startStepper,
    stopStepper: resetAndStop,
    handleCoordinatedPause,
    handleCoordinatedResume,
    requestCoordinatedPause,
    requestCoordinatedResume,
    handleRemoteStateHash,
    waitingForPeer,
    frame,
    getFrame: () => stateRef.current.frame,
  }
}
