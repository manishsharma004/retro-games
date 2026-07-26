import type { ConnectedGamepad } from '../hooks/useGamepads'

interface GamepadStatusProps {
  pads: ConnectedGamepad[]
}

export function GamepadStatus({ pads }: GamepadStatusProps) {
  if (pads.length === 0) {
    return (
      <div className="gamepad-status gamepad-status--empty" title="No physical controller detected">
        <span className="gamepad-status__dot" />
        <span>No controller</span>
      </div>
    )
  }

  return (
    <div className="gamepad-status gamepad-status--connected">
      <span className="gamepad-status__dot" />
      <span>
        {pads.length === 1
          ? shortName(pads[0].id)
          : `${pads.length} controllers`}
      </span>
    </div>
  )
}

function shortName(id: string): string {
  const cleaned = id.replace(/\s*\(.*\)\s*/g, '').trim()
  return cleaned.length > 28 ? `${cleaned.slice(0, 26)}…` : cleaned
}
