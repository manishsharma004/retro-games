import { DEFAULT_LAYOUT, sanitizeLayout, type VirtualControlsLayout } from './virtualLayout'

export type ShaderOption = '' | 'crt/crt-easymode'

export interface EmulatorSettings {
  shader: ShaderOption
  videoSmooth: boolean
  videoVsync: boolean
  rewindEnable: boolean
  audioMute: boolean
  audioVolume: number
  showVirtualController: boolean | 'auto'
  virtualDpadMode: 'dpad' | 'stick'
  virtualControlsOverlay: boolean
  virtualControlsSize: 'small' | 'medium' | 'large'
  virtualControlsOpacity: number
  virtualControlsLayout: VirtualControlsLayout
  swapAB: boolean
  allowOpposingDirections: boolean
  frameSkip: number
  integerScale: boolean
  nesRegion: 'Auto' | 'NTSC' | 'PAL'
  nesTurbo: 'None' | 'Both' | 'Player 1' | 'Player 2'
  snesRegion: 'auto' | 'ntsc' | 'pal'
  /** SNES multitap player count (2–5). Requires relaunch. */
  snesPlayerCount: 2 | 3 | 4 | 5
  /** Remote stream host: include game audio in the WebRTC stream. */
  remoteShareAudio: boolean
}

export const DEFAULT_SETTINGS: EmulatorSettings = {
  shader: '',
  videoSmooth: false,
  videoVsync: true,
  rewindEnable: false,
  audioMute: false,
  audioVolume: 80,
  showVirtualController: 'auto',
  virtualDpadMode: 'dpad',
  virtualControlsOverlay: false,
  virtualControlsSize: 'medium',
  virtualControlsOpacity: 0.5,
  virtualControlsLayout: DEFAULT_LAYOUT,
  swapAB: false,
  allowOpposingDirections: true,
  frameSkip: 0,
  integerScale: false,
  nesRegion: 'Auto',
  nesTurbo: 'None',
  snesRegion: 'auto',
  snesPlayerCount: 2,
  remoteShareAudio: true,
}

const STORAGE_KEY = 'retro-games-settings-v1'

export function loadSettings(): EmulatorSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<EmulatorSettings>
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      virtualControlsLayout: sanitizeLayout(parsed.virtualControlsLayout),
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings: EmulatorSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

/** NTSC content rate — both co-op emulators must match. */
export const COOP_REFRESH_RATE_HZ = 60
export const COOP_AUDIO_LATENCY_MS = 128

/** Lock gameplay settings so both peers run the same content framerate. */
export function coopTimingSettings(settings: EmulatorSettings): EmulatorSettings {
  return {
    ...settings,
    videoVsync: false,
    frameSkip: 0,
    rewindEnable: false,
    nesRegion: 'NTSC',
    snesRegion: 'ntsc',
  }
}

export interface RetroarchConfigOptions {
  /** Dual-emulator co-op: audio-synced 60 Hz, no display vsync. */
  coop?: boolean
}

/** Player-2 RetroArch binds for Nostalgist pressDown({ button, player: 2 }).
 * Uses Digit keys via RetroArch `keypad*` names (not `num*`, which map wrong). */
const PLAYER2_BINDS: Record<string, string> = {
  input_player2_up: 'i',
  input_player2_down: 'k',
  input_player2_left: 'j',
  input_player2_right: 'l',
  input_player2_b: 'n',
  input_player2_a: 'm',
  input_player2_y: 'u',
  input_player2_x: 'o',
  input_player2_l: 'c',
  input_player2_r: 'v',
  input_player2_start: 'p',
  input_player2_select: 'semicolon',
}

const PLAYER3_BINDS: Record<string, string> = {
  input_player3_up: 't',
  input_player3_down: 'g',
  input_player3_left: 'f',
  input_player3_right: 'h',
  input_player3_b: 'comma',
  input_player3_a: 'period',
  input_player3_y: 'q',
  input_player3_x: 'w',
  input_player3_l: 'e',
  input_player3_r: 'r',
  input_player3_start: 'y',
  input_player3_select: 'u',
}

const PLAYER4_BINDS: Record<string, string> = {
  input_player4_up: '7',
  input_player4_down: '8',
  input_player4_left: '9',
  input_player4_right: '0',
  input_player4_b: 'minus',
  input_player4_a: 'equal',
  input_player4_y: 'bracketleft',
  input_player4_x: 'bracketright',
  input_player4_l: 'backslash',
  input_player4_r: 'quote',
  input_player4_start: 'enter',
  input_player4_select: 'backspace',
}

const PLAYER5_BINDS: Record<string, string> = {
  input_player5_up: 'kp8',
  input_player5_down: 'kp5',
  input_player5_left: 'kp4',
  input_player5_right: 'kp6',
  input_player5_b: 'kp1',
  input_player5_a: 'kp2',
  input_player5_y: 'kp7',
  input_player5_x: 'kp9',
  input_player5_l: 'kp0',
  input_player5_r: 'kpperiod',
  input_player5_start: 'kpenter',
  input_player5_select: 'kpplus',
}

export function snesMultitapEnabled(settings: EmulatorSettings): boolean {
  return settings.snesPlayerCount > 2
}

function playerBindsForCount(count: number): Record<string, string> {
  let binds: Record<string, string> = { ...PLAYER2_BINDS }
  if (count >= 3) binds = { ...binds, ...PLAYER3_BINDS }
  if (count >= 4) binds = { ...binds, ...PLAYER4_BINDS }
  if (count >= 5) binds = { ...binds, ...PLAYER5_BINDS }
  return binds
}

export function buildRetroarchConfig(
  settings: EmulatorSettings,
  options?: RetroarchConfigOptions & { system?: 'nes' | 'snes' },
): Record<string, string | number | boolean> {
  const effective = options?.coop ? coopTimingSettings(settings) : settings
  // RetroArch audio_volume is in dB; map 0–100% → -80–0 dB
  const volumeDb = (effective.audioVolume / 100) * 80 - 80

  const base: Record<string, string | number | boolean> = {
    input_enable_hotkeys: false,
    rewind_enable: effective.rewindEnable,
    video_smooth: effective.videoSmooth,
    video_vsync: effective.videoVsync,
    video_frame_delay: 0,
    video_shader_enable: Boolean(effective.shader),
    fastforward_frameskip: effective.frameSkip > 0,
    video_font_enable: false,
    video_scale_integer: effective.integerScale,
    aspect_ratio_index: 22, // Core provided
    audio_mute_enable: effective.audioMute,
    audio_volume: volumeDb,
    audio_latency: COOP_AUDIO_LATENCY_MS,
    savestate_thumbnail_enable: false,
    savestate_auto_save: false,
    savestate_auto_load: false,
    autosave_interval: '0',
    pause_nonactive: false,
    menu_driver: 'null',
    notice_show: false,
    input_player1_joypad_index: 99,
    input_player2_joypad_index: 99,
    input_libretro_device_p1: 1,
    input_libretro_device_p2: 1,
    ...PLAYER2_BINDS,
  }

  const snesCount = effective.snesPlayerCount
  if (options?.system === 'snes' && snesCount > 2) {
    Object.assign(base, {
      input_max_users: 5,
      input_libretro_device_p2: 257,
      input_player3_joypad_index: 99,
      input_player4_joypad_index: 99,
      input_player5_joypad_index: 99,
      ...playerBindsForCount(snesCount),
    })
  }

  if (options?.coop) {
    return {
      ...base,
      audio_sync: true,
      video_vsync: false,
      fastforward_frameskip: false,
      fastforward_ratio: 1,
      video_refresh_rate: COOP_REFRESH_RATE_HZ,
      audio_latency: COOP_AUDIO_LATENCY_MS,
      rewind_enable: false,
      pause_nonactive: true,
    }
  }

  return base
}

export function buildCoreConfig(
  system: 'nes' | 'snes',
  settings: EmulatorSettings,
  options?: RetroarchConfigOptions,
): Record<string, string> {
  const effective = options?.coop ? coopTimingSettings(settings) : settings
  const upDownAllowed = effective.allowOpposingDirections ? 'enabled' : 'disabled'

  if (system === 'nes') {
    return {
      fceumm_region: effective.nesRegion,
      fceumm_turbo_enable: effective.nesTurbo,
      fceumm_up_down_allowed: upDownAllowed,
    }
  }
  return {
    snes9x_region: effective.snesRegion,
    snes9x_up_down_allowed: upDownAllowed,
  }
}
