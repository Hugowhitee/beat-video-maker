export interface SourceFilmstripWindow {
  start: number
  end: number // exclusive
}

/** Source-relative frame window. Zoom changes only the view, never clip timing. */
export function resolveSourceFilmstripWindow(
  totalFrames: number,
  zoom: number,
  focusFrame: number,
): SourceFilmstripWindow {
  const total = Math.max(1, Math.round(totalFrames))
  const visible = Math.min(total, Math.max(2, Math.ceil(total / Math.max(1, zoom))))
  const targetStart = Math.round(focusFrame - visible / 2)
  const start = Math.max(0, Math.min(total - visible, targetStart))
  return { start, end: start + visible }
}

/** Convert a pointer on the precision strip to a real, integral source frame. */
export function frameFromSourceStripRatio(
  window: SourceFilmstripWindow,
  ratio: number,
  exclusiveEnd = false,
): number {
  const width = Math.max(1, window.end - window.start)
  const clamped = Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0
  return Math.max(
    window.start,
    Math.min(exclusiveEnd ? window.end : window.end - 1, Math.round(window.start + clamped * width)),
  )
}

export function framePercentInSourceWindow(
  window: SourceFilmstripWindow,
  frame: number,
): number {
  const width = Math.max(1, window.end - window.start)
  return Math.max(0, Math.min(100, ((frame - window.start) / width) * 100))
}
