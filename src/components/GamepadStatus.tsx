import type { ConnectedGamepad } from '../hooks/useGamepads'
import { shortGamepadName } from '../lib/gamepad'

interface GamepadStatusProps {
  pads: ConnectedGamepad[]
  onOpen?: () => void
}

export function GamepadStatus({ pads, onOpen }: GamepadStatusProps) {
  const label =
    pads.length === 0
      ? 'No controller'
      : pads.length === 1
        ? shortGamepadName(pads[0].id)
        : `${pads.length} controllers`

  const title =
    pads.length === 0
      ? 'No physical controller detected — click to manage'
      : 'Click to choose which controller drives each seat'

  if (onOpen) {
    return (
      <button
        type="button"
        className={`gamepad-status gamepad-status--button ${
          pads.length === 0 ? 'gamepad-status--empty' : 'gamepad-status--connected'
        }`}
        title={title}
        onClick={onOpen}
      >
        <span className="gamepad-status__dot" />
        <span>{label}</span>
      </button>
    )
  }

  return (
    <div
      className={`gamepad-status ${pads.length === 0 ? 'gamepad-status--empty' : 'gamepad-status--connected'}`}
      title={title}
    >
      <span className="gamepad-status__dot" />
      <span>{label}</span>
    </div>
  )
}
