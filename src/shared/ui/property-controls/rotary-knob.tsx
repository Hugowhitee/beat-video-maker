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
  label?: string
  defaultValue?: number
  disabled?: boolean
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
  label = 'Parameter',
  defaultValue,
  disabled = false,
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
  const faceRadius = appearance === 'plain' ? r + 1 : r - 4

  const onDown = useCallback(
    (e: React.PointerEvent) => {
      if (isMixed || disabled || e.button !== 0) return
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
        const raw = startValue + (dy * (s.max - s.min)) / (e.shiftKey ? 1200 : 120)
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
    [isMixed, num, disabled],
  )

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (isMixed || disabled) return
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
        e.stopPropagation()
        s.onGestureStart?.()
        s.onChange(Number(next.toFixed(Math.max(0, -Math.floor(Math.log10(s.step))))))
        s.onGestureEnd?.()
      }
    },
    [isMixed, displayNum, disabled],
  )

  return (
    <div
      ref={elRef}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-disabled={disabled}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={displayNum}
      className={cn(
        'shrink-0 touch-none cursor-ns-resize select-none outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-full overflow-hidden',
        (isMixed || disabled) && 'opacity-40',
        className,
      )}
      onPointerDown={onDown}
      onKeyDown={onKeyDown}
      style={{ width: size, height: size, aspectRatio: '1 / 1' }}
      title={defaultValue === undefined ? label : `${label} · Double-click to reset`}
      onDoubleClick={() => {
        if (disabled || defaultValue === undefined) return
        onGestureStart?.()
        onChange(Math.max(min, Math.min(max, defaultValue)))
        onGestureEnd?.()
      }}
    >
      <svg
        aria-hidden="true"
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        className="block"
      >
        {appearance === 'arc' && (
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
          </>
        )}
        <circle
          cx={cx}
          cy={cy}
          r={faceRadius}
          fill="var(--secondary)"
          stroke="var(--border)"
          strokeWidth={1}
        />
        <line
          x1={cx}
          y1={cy - faceRadius * 0.4}
          x2={cx}
          y2={cy - faceRadius + 2}
          stroke="var(--foreground)"
          strokeWidth={2}
          strokeLinecap="round"
          transform={`rotate(${-135 + norm * 270} ${cx} ${cy})`}
        />
      </svg>
    </div>
  )
}
