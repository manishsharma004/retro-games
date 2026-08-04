import type { Nostalgist } from 'nostalgist'

type EmscriptenModule = {
  _cmd_save_state?: () => void
  _cmd_load_state?: () => void
  FS?: {
    readFile: (path: string, opts: { encoding: 'binary' }) => Uint8Array
    writeFile: (path: string, data: Uint8Array, opts?: { encoding?: 'binary' }) => void
    unlink: (path: string) => void
  }
}

/** Nostalgist's Emulator.stateFilePath is private in types but exists at runtime. */
function getStateFilePath(nostalgist: Nostalgist): string | null {
  try {
    const emulator = nostalgist.getEmulator() as unknown as { stateFilePath: string }
    return emulator.stateFilePath
  } catch {
    return null
  }
}

function getModule(nostalgist: Nostalgist): EmscriptenModule | null {
  try {
    return nostalgist.getEmscriptenModule() as EmscriptenModule
  } catch {
    return null
  }
}

/**
 * Fast save-state export using RetroArch's `_cmd_save_state` + synchronous FS read.
 *
 * libretro's `retro_serialize` / `retro_unserialize` are not exported to JS in
 * the RetroArch WASM build Nostalgist uses — only `_cmd_save_state` /
 * `_cmd_load_state` are. Nostalgist's `saveState()` wraps those commands but
 * polls the virtual FS with 50ms+ exponential backoff (`waitForFile`), which
 * dominates co-op resync latency. This path skips that polling.
 */
export function fastExportStateBlob(nostalgist: Nostalgist): Blob | null {
  const mod = getModule(nostalgist)
  const path = getStateFilePath(nostalgist)
  if (!mod?._cmd_save_state || !mod.FS || !path) return null

  try {
    try {
      mod.FS.unlink(path)
    } catch {
      // ignore missing prior state
    }
    mod._cmd_save_state()
    const data = mod.FS.readFile(path, { encoding: 'binary' })
    if (!data?.byteLength) return null
    return new Blob([new Uint8Array(data)], {
      type: 'application/octet-stream',
    })
  } catch {
    return null
  }
}

export async function fastImportStateBlob(nostalgist: Nostalgist, state: Blob): Promise<boolean> {
  const mod = getModule(nostalgist)
  const path = getStateFilePath(nostalgist)
  if (!mod?._cmd_load_state || !mod.FS || !path) return false

  try {
    const bytes = new Uint8Array(await state.arrayBuffer())
    try {
      mod.FS.unlink(path)
    } catch {
      // ignore
    }
    mod.FS.writeFile(path, bytes, { encoding: 'binary' })
    mod._cmd_load_state()
    return true
  } catch {
    return false
  }
}
