export type TileStep = { index: number } | 'out-up' | 'out-down'

/** Move through a wrapping tile grid. Left and right stay on the row order. */
export function stepWrappedTile(
  index: number,
  count: number,
  columns: number,
  command: 'left' | 'right' | 'up' | 'down',
): TileStep {
  if (count <= 0) return command === 'down' ? 'out-down' : 'out-up'
  const cols = Math.max(1, columns)
  const current = Math.min(Math.max(0, index), count - 1)
  if (command === 'left') return { index: (current - 1 + count) % count }
  if (command === 'right') return { index: (current + 1) % count }
  if (command === 'up') {
    if (current < cols) return 'out-up'
    return { index: current - cols }
  }
  if (current + cols >= count) return 'out-down'
  return { index: current + cols }
}
