/**
 * Isolated Nostalgist host — same layout recipe as the working smoke test.
 * Parent page posts launch/control messages; this frame owns the WASM lifecycle.
 */
import { Nostalgist } from 'nostalgist'

type ParentToFrame =
  | {
      type: 'launch'
      core: string
      rom: ArrayBuffer
      romName: string
      state?: ArrayBuffer
      startPaused?: boolean
      retroarchConfig?: Record<string, string | number | boolean>
      retroarchCoreConfig?: Record<string, string>
      shader?: string
      videoSmooth?: boolean
    }
  | { type: 'exit' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'restart' }
  | { type: 'fastforward' }
  | { type: 'press'; button: string; player: number }
  | { type: 'release'; button: string; player: number }
  | { type: 'save-state-request'; id: number }
  | { type: 'load-state'; state: ArrayBuffer }

type FrameToParent =
  | { type: 'ready' }
  | { type: 'status'; status: string; error?: string }
  | { type: 'save-state-response'; id: number; state?: ArrayBuffer; error?: string }

const canvas = document.getElementById('canvas') as HTMLCanvasElement
let nostalgist: Nostalgist | null = null
let status = 'idle'

function post(msg: FrameToParent) {
  parent.postMessage(msg, '*')
}

function setStatus(next: string, error?: string) {
  status = next
  post({ type: 'status', status: next, error })
}

function exitEmu() {
  if (!nostalgist) return
  try {
    nostalgist.exit({ removeCanvas: false })
  } catch {
    // ignore
  }
  nostalgist = null
}

async function launch(msg: Extract<ParentToFrame, { type: 'launch' }>) {
  exitEmu()
  setStatus('loading')
  canvas.style.width = '800px'
  canvas.style.height = '600px'
  canvas.style.display = 'block'
  canvas.style.backgroundColor = '#000'
  canvas.style.imageRendering = msg.videoSmooth ? 'auto' : 'pixelated'

  const rom = new File([msg.rom], msg.romName, { type: 'application/octet-stream' })
  const state = msg.state ? new Blob([msg.state]) : undefined

  try {
    nostalgist = await Nostalgist.launch({
      core: msg.core,
      rom,
      state,
      element: canvas,
      size: { width: 800, height: 600 },
      style: {
        width: '800px',
        height: '600px',
        display: 'block',
        backgroundColor: '#000',
      },
      shader: msg.shader || undefined,
      cache: { core: true, shader: true },
      retroarchConfig: {
        savestate_thumbnail_enable: false,
        menu_driver: 'null',
        video_font_enable: false,
        ...(msg.retroarchConfig ?? {}),
      },
      retroarchCoreConfig: msg.retroarchCoreConfig,
    })

    if (msg.startPaused) {
      nostalgist.pause()
      setStatus('paused')
    } else {
      setStatus('running')
    }
  } catch (err) {
    exitEmu()
    setStatus('error', err instanceof Error ? err.message : 'Failed to launch ROM')
  }
}

window.addEventListener('message', (event) => {
  const data = event.data as ParentToFrame
  if (!data || typeof data !== 'object' || !('type' in data)) return

  switch (data.type) {
    case 'launch':
      void launch(data)
      break
    case 'exit':
      exitEmu()
      setStatus('idle')
      break
    case 'pause':
      nostalgist?.pause()
      setStatus('paused')
      break
    case 'resume':
      nostalgist?.resume()
      setStatus('running')
      break
    case 'restart':
      nostalgist?.restart()
      setStatus('running')
      break
    case 'fastforward':
      nostalgist?.sendCommand('FAST_FORWARD')
      break
    case 'press':
      if (data.player === 1) nostalgist?.pressDown(data.button)
      else nostalgist?.pressDown({ button: data.button, player: data.player })
      break
    case 'release':
      if (data.player === 1) nostalgist?.pressUp(data.button)
      else nostalgist?.pressUp({ button: data.button, player: data.player })
      break
    case 'save-state-request':
      void (async () => {
        if (!nostalgist) {
          post({ type: 'save-state-response', id: data.id, error: 'no emu' })
          return
        }
        const wasRunning = status === 'running'
        try {
          if (wasRunning) nostalgist.pause()
          const { state } = await nostalgist.saveState()
          const buf = await state.arrayBuffer()
          post({ type: 'save-state-response', id: data.id, state: buf })
        } catch (err) {
          post({
            type: 'save-state-response',
            id: data.id,
            error: err instanceof Error ? err.message : 'save failed',
          })
        } finally {
          if (wasRunning && nostalgist) {
            nostalgist.resume()
            setStatus('running')
          }
        }
      })()
      break
    case 'load-state':
      void (async () => {
        if (!nostalgist) return
        const wasRunning = status === 'running'
        try {
          if (wasRunning) nostalgist.pause()
          await nostalgist.loadState(new Blob([data.state]))
        } finally {
          if (wasRunning && nostalgist) {
            nostalgist.resume()
            setStatus('running')
          }
        }
      })()
      break
    default:
      break
  }
})

post({ type: 'ready' })
