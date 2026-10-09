import { memo, useRef, type PointerEvent, type KeyboardEvent } from 'react'

interface StudioResizeRailProps {
  width: number
  minWidth: number
  maxWidth: number
  onWidthChange: (width: number) => void
  label: string
  defaultWidth: number
  side?: 'left' | 'right'
}

/**
 * A split rail centred on the boundary between panes.
 * Codex-style hover treatment: the 1px dividing line becomes an accent on
 * hover/focus/drag, while the easy-to-grab 10px hit target stays transparent.
 */
export const StudioResizeRail = memo(function StudioResizeRail({
  width,
  minWidth,
  maxWidth,
  onWidthChange,
  label,
  defaultWidth,
  side = 'right',
}: StudioResizeRailProps) {
  const interaction = useRef<{ id: number; x: number; width: number } | null>(null)
  const clamp = (value: number) => Math.round(Math.max(minWidth, Math.min(maxWidth, value)))

  const stop = (event: PointerEvent<HTMLDivElement>) => {
    if (interaction.current?.id !== event.pointerId) return
    interaction.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    interaction.current = { id: event.pointerId, x: event.clientX, width }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }
  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = interaction.current
    if (!start || start.id !== event.pointerId) return
    const delta = event.clientX - start.x
    onWidthChange(clamp(start.width + (side === 'left' ? delta : -delta)))
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const direction = side === 'left' ? 1 : -1
    const delta =
      event.key === 'ArrowLeft' ? -24 * direction : event.key === 'ArrowRight' ? 24 * direction : 0
    if (delta === 0 && event.key !== 'Home' && event.key !== 'End') return
    event.preventDefault()
    onWidthChange(
      clamp(event.key === 'Home' ? minWidth : event.key === 'End' ? maxWidth : width + delta),
    )
  }

  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={minWidth}
      aria-valuemax={maxWidth}
      aria-valuenow={width}
      tabIndex={0}
      data-testid="studio-resize-rail"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={() => {
        interaction.current = null
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }}
      onKeyDown={handleKeyDown}
      onDoubleClick={() => onWidthChange(clamp(defaultWidth))}
      className="group relative z-20 -mx-[5px] h-full w-[10px] shrink-0 cursor-col-resize touch-none bg-transparent outline-none before:pointer-events-none before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-border before:transition-[width,background-color] hover:before:w-[2px] hover:before:bg-primary focus-visible:before:w-[2px] focus-visible:before:bg-primary active:before:w-[2px] active:before:bg-primary"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-9 w-[3px] -translate-x-1/2 -translate-y-1/2 bg-primary opacity-0 transition-opacity group-hover:opacity-75 group-focus-visible:opacity-75 group-active:opacity-100"
      />
    </div>
  )
})
