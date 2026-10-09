import { memo, useState, useCallback, useRef, useEffect } from 'react'
import { cn } from '@/shared/ui/cn'

type MixedValue = number | 'mixed'

const LIVE_CHANGE_THROTTLE_MS = 16 // ~60fps max
const CLICK_THRESHOLD = 3 // px — distinguishes click from drag
const MAX_STRETCH = 6 // px — max rubber-band overflow
const DEAD_ZONE = 24 // px — distance past edge before rubber-band starts
const MAX_CURSOR_RANGE = 160 // px — cursor distance at max stretch

interface SliderInputProps {
  value: MixedValue
  /** Called on final commit (mouse up). Updates the actual value. */
  onChange: (value: number) => void
  /** Called during drag for live preview. If not provided, onChange is used. */
  onLiveChange?: (value: number) => void
  /** Optional throttle for live preview updates during drag. Set to 0 for every pointer move. */
  liveChangeThrottleMs?: number
  label?: string
  min: number
  max: number
  step?: number
  unit?: string
  formatValue?: (value: number) => string
  formatInputValue?: (value: number) => string
  parseInputValue?: (rawValue: string) => number
  disabled?: boolean
  className?: string
}

function decimalsForStep(step: number): number {
  const s = step.toString()
  const dot = s.indexOf('.')
  return dot === -1 ? 0 : s.length - dot - 1
}

function roundToStep(val: number, step: number): number {
  const raw = Math.round(val / step) * step
  return parseFloat(raw.toFixed(decimalsForStep(step)))
}

/** Simple spring animation using rAF */
function animateSpring(
  from: number,
  to: number,
  onUpdate: (value: number) => void,
  onComplete?: () => void,
): () => void {
  let velocity = 0
  let current = from
  const stiffness = 300
  const damping = 25
  const mass = 0.8
  let rafId: number | null = null
  let lastTime = performance.now()

  function tick(now: number) {
    const dt = Math.min((now - lastTime) / 1000, 0.032)
    lastTime = now

    const displacement = current - to
    const springForce = -stiffness * displacement
    const dampingForce = -damping * velocity
    const acceleration = (springForce + dampingForce) / mass

    velocity += acceleration * dt
    current += velocity * dt

    onUpdate(current)

    if (Math.abs(displacement) < 0.01 && Math.abs(velocity) < 0.1) {
      onUpdate(to)
      onComplete?.()
      return
    }

    rafId = requestAnimationFrame(tick)
  }

  rafId = requestAnimationFrame(tick)
  return () => {
    if (rafId !== null) cancelAnimationFrame(rafId)
  }
}

/** Precision parameter row: label, rail, and typed value occupy separate columns. */
export const SliderInput = memo(function SliderInput({
  value,
  onChange,
  onLiveChange,
  liveChangeThrottleMs = LIVE_CHANGE_THROTTLE_MS,
  label,
  min,
  max,
  step = 1,
  unit,
  formatValue: formatValueProp,
  formatInputValue,
  parseInputValue,
  disabled = false,
  className,
}: SliderInputProps) {
  const isMixed = value === 'mixed'
  const numericValue = isMixed ? (min + max) / 2 : value

  // Refs
  const trackRef = useRef<HTMLDivElement>(null)
  const fillRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<HTMLDivElement>(null)
  const valueSpanRef = useRef<HTMLSpanElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const lastLiveChangeRef = useRef<number>(0)
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null)
  const isClickRef = useRef(true)
  const rectRef = useRef<DOMRect | null>(null)
  const cancelSpringRef = useRef<(() => void) | null>(null)
  // Use ref for input value to avoid stale closures in blur handlers
  const inputValueRef = useRef('')

  // State
  const [fillPercent, setFillPercent] = useState(() => ((numericValue - min) / (max - min)) * 100)
  const [rubberStretch, setRubberStretch] = useState(0)
  const [isInteracting, setIsInteracting] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [showInput, setShowInput] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [localValue, setLocalValue] = useState<number | null>(null)
  const previousNumericValueRef = useRef(numericValue)

  const showInputRef = useRef(false)
  const isSubmittingRef = useRef(false)
  const cancelEditRef = useRef(false)
  const fillPercentRef = useRef(fillPercent)
  const rubberStretchRef = useRef(rubberStretch)
  const localValueRef = useRef<number | null>(localValue)

  const displayNumericValue = localValue ?? numericValue

  // Sync fill from props when not interacting and no spring is running
  useEffect(() => {
    if (!isInteracting && !cancelSpringRef.current) {
      const nextFillPercent = ((numericValue - min) / (max - min)) * 100
      fillPercentRef.current = nextFillPercent
      setFillPercent(nextFillPercent)
    }
  }, [numericValue, min, max, isInteracting])

  useEffect(() => {
    const previousNumericValue = previousNumericValueRef.current
    previousNumericValueRef.current = numericValue

    if (showInput || isInteracting || localValue === null) {
      return
    }

    if (numericValue === localValue || numericValue !== previousNumericValue) {
      setLocalValue(null)
    }
  }, [numericValue, localValue, isInteracting, showInput])

  const formatDisplay = useCallback(
    (v: number) => {
      if (formatValueProp) return formatValueProp(v)
      const formatted = v.toFixed(decimalsForStep(step))
      return unit ? `${formatted} ${unit}` : formatted
    },
    [formatValueProp, step, unit],
  )

  const displayValue = isMixed && localValue === null ? 'Mixed' : formatDisplay(displayNumericValue)

  const updateDisplayedValue = useCallback(
    (nextLocalValue: number | null) => {
      localValueRef.current = nextLocalValue
      if (showInputRef.current || !valueSpanRef.current) return

      valueSpanRef.current.textContent =
        isMixed && nextLocalValue === null ? 'Mixed' : formatDisplay(nextLocalValue ?? numericValue)
    },
    [formatDisplay, isMixed, numericValue],
  )

  const updateStretchVisual = useCallback((nextStretch: number) => {
    rubberStretchRef.current = nextStretch
    if (!trackRef.current) return

    const stretchWidth = Math.abs(nextStretch)
    const stretchX = nextStretch < 0 ? nextStretch : 0
    trackRef.current.style.width = stretchWidth > 0 ? `calc(100% + ${stretchWidth}px)` : ''
    trackRef.current.style.transform = stretchX !== 0 ? `translateX(${stretchX}px)` : ''
  }, [])

  const updateFillVisual = useCallback(
    (
      nextFillPercent: number,
      {
        active = isInteracting || isHovered,
        dragging = isDragging,
      }: {
        active?: boolean
        dragging?: boolean
      } = {},
    ) => {
      fillPercentRef.current = nextFillPercent
      const clampedFillPercent = Math.max(0, Math.min(100, nextFillPercent))

      if (fillRef.current) {
        fillRef.current.style.width = `${clampedFillPercent}%`
      }

      if (!handleRef.current) return

      handleRef.current.style.left = `clamp(0px, calc(${clampedFillPercent}% - 4px), calc(100% - 8px))`
      handleRef.current.style.opacity = active ? '1' : '0.8'
      handleRef.current.style.transform = `translateY(-50%) scaleY(${dragging ? 1.1 : 1})`
    },
    [isDragging, isHovered, isInteracting],
  )

  useEffect(() => {
    localValueRef.current = localValue
    if (!isInteracting) {
      updateDisplayedValue(localValue)
    }
  }, [isInteracting, localValue, updateDisplayedValue])

  useEffect(() => {
    if (isInteracting) {
      updateFillVisual(fillPercentRef.current, { active: true, dragging: isDragging })
    } else {
      fillPercentRef.current = fillPercent
      updateFillVisual(fillPercent, { active: isHovered, dragging: false })
    }
  }, [fillPercent, isDragging, isHovered, isInteracting, updateFillVisual])

  useEffect(() => {
    rubberStretchRef.current = rubberStretch
    if (!isInteracting) {
      updateStretchVisual(rubberStretch)
    }
  }, [isInteracting, rubberStretch, updateStretchVisual])

  const positionToValue = useCallback(
    (clientX: number) => {
      const rect = rectRef.current
      if (!rect) return numericValue
      const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      return Math.max(min, Math.min(max, min + percent * (max - min)))
    },
    [min, max, numericValue],
  )

  const computeRubberStretch = useCallback((clientX: number, sign: number) => {
    const rect = rectRef.current
    if (!rect) return 0
    const distancePast = sign < 0 ? rect.left - clientX : clientX - rect.right
    const overflow = Math.max(0, distancePast - DEAD_ZONE)
    return sign * MAX_STRETCH * Math.sqrt(Math.min(overflow / MAX_CURSOR_RANGE, 1.0))
  }, [])

  const emitLiveChange = useCallback(
    (newValue: number) => {
      const handler = onLiveChange ?? onChange
      if (liveChangeThrottleMs <= 0) {
        handler(newValue)
        return
      }
      const now = performance.now()
      if (now - lastLiveChangeRef.current >= liveChangeThrottleMs) {
        lastLiveChangeRef.current = now
        handler(newValue)
      }
    },
    [liveChangeThrottleMs, onChange, onLiveChange],
  )

  const openTextInput = useCallback(() => {
    const raw = formatInputValue
      ? formatInputValue(numericValue)
      : numericValue.toFixed(decimalsForStep(step))
    cancelEditRef.current = false
    setShowInput(true)
    showInputRef.current = true
    setInputValue(raw)
    inputValueRef.current = raw
  }, [formatInputValue, numericValue, step])

  const commitTextInput = useCallback(() => {
    if (isSubmittingRef.current || cancelEditRef.current) {
      cancelEditRef.current = false
      return
    }
    isSubmittingRef.current = true

    const raw = inputValueRef.current
    const parsed = parseInputValue ? parseInputValue(raw) : parseFloat(raw)
    if (!isNaN(parsed)) {
      const clamped = Math.max(min, Math.min(max, parsed))
      const rounded = roundToStep(clamped, step)
      const nextFillPercent = ((rounded - min) / (max - min)) * 100
      fillPercentRef.current = nextFillPercent
      localValueRef.current = rounded
      setFillPercent(nextFillPercent)
      setLocalValue(rounded)
      onChange(rounded)
    }

    setShowInput(false)
    showInputRef.current = false

    queueMicrotask(() => {
      isSubmittingRef.current = false
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur()
      }
    })
  }, [min, max, step, onChange, parseInputValue])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (showInputRef.current || disabled) return

      // Let clicks on the value span through for direct click-to-edit
      if (valueSpanRef.current && valueSpanRef.current.contains(e.target as Node)) {
        return
      }

      e.preventDefault()
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      pointerDownPos.current = { x: e.clientX, y: e.clientY }
      isClickRef.current = true
      localValueRef.current = null
      setIsInteracting(true)

      if (trackRef.current) {
        rectRef.current = trackRef.current.getBoundingClientRect()
      }

      if (cancelSpringRef.current) {
        cancelSpringRef.current()
        cancelSpringRef.current = null
      }
    },
    [disabled],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isInteracting || !pointerDownPos.current) return

      const dx = e.clientX - pointerDownPos.current.x
      const dy = e.clientY - pointerDownPos.current.y
      const distance = Math.sqrt(dx * dx + dy * dy)

      if (isClickRef.current && distance > CLICK_THRESHOLD) {
        isClickRef.current = false
        setIsDragging(true)
      }

      if (!isClickRef.current) {
        const rect = rectRef.current
        let nextStretch = 0
        if (rect) {
          if (e.clientX < rect.left) {
            nextStretch = computeRubberStretch(e.clientX, -1)
          } else if (e.clientX > rect.right) {
            nextStretch = computeRubberStretch(e.clientX, 1)
          }
        }
        updateStretchVisual(nextStretch)

        const newValue = positionToValue(e.clientX)
        const rounded = roundToStep(newValue, step)
        const pct = ((rounded - min) / (max - min)) * 100
        localValueRef.current = rounded
        updateFillVisual(pct, { active: true, dragging: true })
        updateDisplayedValue(rounded)
        emitLiveChange(rounded)
      }
    },
    [
      isInteracting,
      positionToValue,
      step,
      min,
      max,
      computeRubberStretch,
      emitLiveChange,
      updateDisplayedValue,
      updateFillVisual,
      updateStretchVisual,
    ],
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!isInteracting) return

      // If text input is open (e.g. from double-click), don't snap or blur
      if (showInputRef.current) {
        setIsInteracting(false)
        setIsDragging(false)
        pointerDownPos.current = null
        return
      }

      if (isClickRef.current) {
        const rawValue = positionToValue(e.clientX)
        const discreteSteps = (max - min) / step
        const snappedValue =
          discreteSteps <= 10
            ? Math.max(min, Math.min(max, min + Math.round((rawValue - min) / step) * step))
            : roundToStep(rawValue, step)

        const targetPct = ((snappedValue - min) / (max - min)) * 100
        const currentPct = fillPercentRef.current

        cancelSpringRef.current = animateSpring(
          currentPct,
          targetPct,
          (pct) => updateFillVisual(pct, { active: true, dragging: false }),
          () => {
            cancelSpringRef.current = null
            setFillPercent(targetPct)
          },
        )

        localValueRef.current = snappedValue
        setLocalValue(snappedValue)
        onChange(roundToStep(snappedValue, step))
      } else {
        if (localValueRef.current !== null) {
          setFillPercent(fillPercentRef.current)
          setLocalValue(localValueRef.current)
          onChange(localValueRef.current)
        }
      }

      if (rubberStretchRef.current !== 0) {
        const startStretch = rubberStretchRef.current
        setRubberStretch(startStretch)
        animateSpring(
          startStretch,
          0,
          (v) => updateStretchVisual(v),
          () => {
            updateStretchVisual(0)
            setRubberStretch(0)
          },
        )
      }

      setIsInteracting(false)
      setIsDragging(false)
      pointerDownPos.current = null

      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur()
      }
    },
    [
      isInteracting,
      positionToValue,
      min,
      max,
      step,
      onChange,
      updateFillVisual,
      updateStretchVisual,
    ],
  )

  // Focus input when it appears
  useEffect(() => {
    if (showInput && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [showInput])

  // Click on value span → open text input immediately
  const handleValueClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    openTextInput()
  }

  // Double-click anywhere on track → open text input
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (showInputRef.current || disabled) return
      e.preventDefault()
      openTextInput()
    },
    [disabled, openTextInput],
  )

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'Enter') {
      commitTextInput()
    } else if (e.key === 'Escape') {
      cancelEditRef.current = true
      setShowInput(false)
      showInputRef.current = false
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value)
    inputValueRef.current = e.target.value
  }

  const isActive = isInteracting || isHovered
  const stretchWidth = Math.abs(rubberStretch)
  const stretchX = rubberStretch < 0 ? rubberStretch : 0

  const handleSliderKeyDown = (e: React.KeyboardEvent) => {
    if (disabled || showInput) return
    const amount = step * (e.shiftKey ? 10 : 1)
    const values: Record<string, number> = {
      ArrowRight: displayNumericValue + amount,
      ArrowUp: displayNumericValue + amount,
      ArrowLeft: displayNumericValue - amount,
      ArrowDown: displayNumericValue - amount,
      Home: min,
      End: max,
    }
    const next = values[e.key]
    if (next === undefined) return
    e.preventDefault()
    e.stopPropagation()
    const clamped = roundToStep(Math.max(min, Math.min(max, next)), step)
    setLocalValue(clamped)
    onChange(clamped)
  }

  return (
    <div
      className={cn(
        'relative flex min-w-0 flex-1 items-center gap-2 h-8',
        disabled && 'opacity-50',
        className,
      )}
      data-parameter-row
    >
      {label && (
        <span
          className="w-[72px] min-w-0 shrink-0 truncate text-xs font-medium text-foreground"
          title={label}
        >
          {label}
        </span>
      )}
      <div
        ref={trackRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label ?? 'Parameter'}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={isMixed ? undefined : displayNumericValue}
        aria-valuetext={displayValue}
        aria-disabled={disabled}
        className={cn(
          'relative h-7 min-w-6 flex-1 touch-none select-none rounded-sm outline-none focus-visible:ring-1 focus-visible:ring-ring',
          disabled ? 'pointer-events-none' : 'cursor-ew-resize',
        )}
        style={{
          width: stretchWidth > 0 ? `calc(100% + ${stretchWidth}px)` : undefined,
          transform: stretchX !== 0 ? `translateX(${stretchX}px)` : undefined,
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        onKeyDown={handleSliderKeyDown}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-border" />
        <div
          ref={fillRef}
          className="pointer-events-none absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-muted-foreground"
          style={{ width: `${Math.max(0, Math.min(100, fillPercentRef.current))}%` }}
        />
        {min < 0 && max > 0 && (
          <div
            className="pointer-events-none absolute top-1/2 h-2 w-px -translate-y-1/2 bg-foreground/50"
            style={{ left: `${(-min / (max - min)) * 100}%` }}
          />
        )}
        <div
          ref={handleRef}
          className="pointer-events-none absolute top-1/2 h-3 w-2 bg-control-cap"
          style={{
            left: `clamp(0px, calc(${Math.max(0, Math.min(100, fillPercentRef.current))}% - 4px), calc(100% - 8px))`,
            transform: 'translateY(-50%)',
            opacity: isActive ? 1 : 0.8,
          }}
        />
      </div>
      {showInput ? (
        <input
          ref={inputRef}
          type="text"
          autoComplete="off"
          data-bwignore="true"
          inputMode="decimal"
          aria-label={label ? `${label} value` : 'Parameter value'}
          className="h-7 w-20 shrink-0 rounded-[3px] border border-ring bg-background px-3.5 text-left font-mono text-xs font-medium tabular-nums outline-none"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleInputKeyDown}
          onBlur={commitTextInput}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        />
      ) : (
        <span
          ref={valueSpanRef}
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-label={label ? `Edit ${label} value` : 'Edit parameter value'}
          aria-disabled={disabled}
          className={cn(
            'flex h-7 w-20 shrink-0 items-center justify-start rounded-[3px] border border-input bg-background px-3.5 font-mono text-xs font-medium tabular-nums outline-none focus-visible:ring-1 focus-visible:ring-ring',
            !disabled && 'cursor-text hover:border-muted-foreground',
            isMixed && localValue === null && 'italic',
          )}
          onClick={disabled ? undefined : handleValueClick}
          onKeyDown={(e) => {
            if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault()
              e.stopPropagation()
              openTextInput()
            }
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {displayValue}
        </span>
      )}
    </div>
  )
})
