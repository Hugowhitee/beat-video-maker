export const FADER_DB_MIN = -60
export const FADER_DB_MAX = 12
const FADER_DB_RANGE = FADER_DB_MAX - FADER_DB_MIN // 72
export const FADER_KNOB_HEIGHT_PX = 39
export const MASTER_FADER_KNOB_HEIGHT_PX = 47
export const FADER_KNOB_DRAG_TOLERANCE_PX = 16

export function dbToFaderPercent(db: number): number {
  if (!Number.isFinite(db)) return 83.33 // 0 dB default for NaN/Infinity
  const clamped = Math.max(FADER_DB_MIN, Math.min(FADER_DB_MAX, db))
  if (clamped <= FADER_DB_MIN) return 0
  if (clamped >= FADER_DB_MAX) return 100
  return ((clamped - FADER_DB_MIN) / FADER_DB_RANGE) * 100
}

export function faderPercentToDb(percent: number): number {
  const clamped = Math.max(0, Math.min(100, percent))
  return (clamped / 100) * FADER_DB_RANGE + FADER_DB_MIN
}

export function formatFaderDb(db: number): string {
  if (!Number.isFinite(db)) return '+0.0'
  return `${db >= 0 ? '+' : ''}${db.toFixed(1)}`
}

export const FADER_SCALE_MARKS = [12, 0, -12, -24, -36, -48, -60] as const

export function faderKeyboardValue(event: React.KeyboardEvent, currentDb: number): number | null {
  const step = event.shiftKey ? 0.1 : 1
  switch (event.key) {
    case 'ArrowUp':
    case 'ArrowRight':
      return Math.min(FADER_DB_MAX, currentDb + step)
    case 'ArrowDown':
    case 'ArrowLeft':
      return Math.max(FADER_DB_MIN, currentDb - step)
    case 'Home':
      return FADER_DB_MIN
    case 'End':
      return FADER_DB_MAX
    case 'Enter':
      return 0
    default:
      return null
  }
}
