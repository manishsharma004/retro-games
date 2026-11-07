import { useEffect, useRef } from 'react'
import { readRetroButtons, type PadSnapshot } from '../lib/gamepad'

export type MenuCommand = 'left' | 'right' | 'up' | 'down' | 'confirm' | 'back'

const DIRECTIONS = new Set<MenuCommand>(['left', 'right', 'up', 'down'])

/** South face button confirms. East face button goes back. */
export function readMenuCommands(pad: PadSnapshot): Set<MenuCommand> {
  const buttons = readRetroButtons(pad)
  const commands = new Set<MenuCommand>()
  if (buttons.has('left')) commands.add('left')
  if (buttons.has('right')) commands.add('right')
  if (buttons.has('up')) commands.add('up')
  if (buttons.has('down')) commands.add('down')
  if (buttons.has('b')) commands.add('confirm')
  if (buttons.has('a')) commands.add('back')
  return commands
}

/**
 * Poll the first connected pad. Directions repeat while held.
 * Confirm and back fire once per press so a game does not launch twice.
 */
export function useMenuPad(enabled: boolean, onCommand: (command: MenuCommand) => void): void {
  const onCommandRef = useRef(onCommand)
  onCommandRef.current = onCommand

  useEffect(() => {
    if (!enabled) return
    let frame = 0
    let lastRepeat = 0
    const held = new Set<MenuCommand>()

    const tick = () => {
      const pads = navigator.getGamepads?.() ?? []
      const pad = [...pads].find((item) => item && item.connected)
      const next = pad
        ? readMenuCommands({
            id: pad.id,
            mapping: pad.mapping,
            buttons: pad.buttons,
            axes: pad.axes,
          })
        : new Set<MenuCommand>()
      const now = performance.now()
      for (const command of next) {
        const fresh = !held.has(command)
        const repeat = DIRECTIONS.has(command) && now - lastRepeat > 220
        if (fresh || repeat) {
          if (DIRECTIONS.has(command)) lastRepeat = now
          onCommandRef.current(command)
        }
      }
      held.clear()
      for (const command of next) held.add(command)
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [enabled])
}
