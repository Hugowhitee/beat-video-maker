import { useCallback, useRef, useState } from 'react'
import { cn } from '@/shared/ui/cn'

type MixedValue = number | 'mixed'

interface RotaryKnobProps {
  value: MixedValue
  onChange: (value: number) => void
  onLiveChange?: (value: number) => void
  onGestureStart?: () => void
  onGestureEnd?: () => void
  min: number
  max: number
  step?: number
  size?: number
  appearance?: 'arc' | 'plain'
  className?: string
}

const ARC_START_DEG = 135
const ARC_SWEEP_DEG = 270

function polarXY(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function arcPath(cx: number, cy: number, r: number, from: number, to: number) {
  const a = polarXY(cx, cy, r, from)
  const b = polarXY(cx, cy, r, to)
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${b.x} ${b.y}`
}

export function RotaryKnob({
  value,
  onChange,
  onLiveChange,
  onGestureStart,
  onGestureEnd,
  min,
  max,
  step = 1,
  size = 28,
  appearance = 'arc',
  className,
}: RotaryKnobProps) {
  const elRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef({
    onChange,
    onLiveChange,
    onGestureStart,
    onGestureEnd,
    min,
    max,
    step,
  })
  stateRef.current = {
    onChange,
    onLiveChange,
    onGestureStart,
    onGestureEnd,
    min,
    max,
    step,
  }

  const [draftValue, setDraftValue] = useState<number | null>(null)

  const isMixed = value === 'mixed'
  const num = isMixed ? (min + max) / 2 : value
  const displayNum = draftValue ?? num
  const norm = Math.max(0, Math.min(1, (displayNum - min) / (max - min)))

  const cx = size / 2
  const cy = size / 2
  const r = size / 2 - 3
  const deg = ARC_START_DEG + norm * ARC_SWEEP_DEG
  const tip = polarXY(cx, cy, r, deg)

  const onDown = useCallback(
    (e: React.PointerEvent) => {
      if (isMixed) return
      e.preventDefault()
      const el = elRef.current
      if (!el) return
      el.setPointerCapture(e.pointerId)

      stateRef.current.onGestureStart?.()
      const startY = e.clientY
      const startValue = num
      setDraftValue(num)

      const compute = (clientY: number) => {
        const s = stateRef.current
        const dy = startY - clientY
        const raw = startValue + (dy * (s.max - s.min)) / 120
        const offset = raw - s.min
        const snappedOffset = Math.round(offset / s.step) * s.step
        const decimals = Math.max(0, -Math.floor(Math.log10(s.step)))
        const value = Number((s.min + snappedOffset).toFixed(decimals))
        return Math.max(s.min, Math.min(s.max, value))
      }

      const handleMove = (me: PointerEvent) => {
        const v = compute(me.clientY)
        setDraftValue(v)
        const s = stateRef.current
        ;(s.onLiveChange ?? s.onChange)(v)
      }

      const handleUp = (ue: PointerEvent) => {
        const v = compute(ue.clientY)
        setDraftValue(null)
        stateRef.current.onChange(v)
        stateRef.current.onGestureEnd?.()
        el.removeEventListener('pointermove', handleMove)
        el.removeEventListener('pointerup', handleUp)
        el.removeEventListener('pointercancel', handleUp)
      }

      el.addEventListener('pointermove', handleMove)
      el.addEventListener('pointerup', handleUp)
      el.addEventListener('pointercancel', handleUp)
    },
    [isMixed, num],
  )

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (isMixed) return
      const s = stateRef.current
      let next: number | null = null
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
        next = Math.min(s.max, displayNum + s.step)
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
        next = Math.max(s.min, displayNum - s.step)
      } else if (e.key === 'PageUp') {
        next = Math.min(s.max, displayNum + s.step * 10)
      } else if (e.key === 'PageDown') {
        next = Math.max(s.min, displayNum - s.step * 10)
      } else if (e.key === 'Home') {
        next = s.min
      } else if (e.key === 'End') {
        next = s.max
      }
      if (next !== null) {
        e.preventDefault()
        s.onChange(next)
      }
    },
    [isMixed, displayNum],
  )

  return (
    <div
      ref={elRef}
      role="slider"
      tabIndex={0}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={displayNum}
      className={cn(
        'shrink-0 touch-none cursor-ns-resize select-none outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-full',
        isMixed && 'opacity-40',
        className,
      )}
      onPointerDown={onDown}
      onKeyDown={onKeyDown}
    >
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        {appearance === 'plain' ? (
          <>
            <circle
              cx={cx}
              cy={cy}
              r={r + 1}
              fill="var(--background)"
              stroke="var(--muted-foreground)"
              strokeWidth={1}
            />
            <line
              x1={cx}
              y1={cy}
              x2={cx}
              y2={4}
              stroke="var(--foreground)"
              strokeWidth={2}
              strokeLinecap="round"
              transform={`rotate(${-135 + norm * 270} ${cx} ${cy})`}
            />
          </>
        ) : (
          <>
            <path
              d={arcPath(cx, cy, r, ARC_START_DEG, ARC_START_DEG + ARC_SWEEP_DEG)}
              fill="none"
              stroke="var(--border)"
              strokeWidth={2.5}
              strokeLinecap="round"
            />
            {norm > 0.005 && (
              <path
                d={arcPath(cx, cy, r, ARC_START_DEG, deg)}
                fill="none"
                stroke="var(--foreground)"
                strokeWidth={2.5}
                strokeLinecap="round"
              />
            )}
            <circle cx={tip.x} cy={tip.y} r={2} fill="var(--foreground)" />
          </>
        )}
      </svg>
    </div>
  )
}
