import { useRef, type RefObject } from 'react'
import { NumberInput } from './number-input'
import { RotateCcw } from 'lucide-react'

import {
  FADER_DB_MIN,
  FADER_DB_MAX,
  FADER_KNOB_HEIGHT_PX,
  MASTER_FADER_KNOB_HEIGHT_PX,
  FADER_SCALE_MARKS,
  dbToFaderPercent,
  faderPercentToDb,
  formatFaderDb,
  faderKeyboardValue,
} from './console-fader-calibration'

/** One visual mechanism for channel and master console faders. The owning
 * controls retain the canonical live-gain gesture and commit lifecycle. */
export function ConsoleFaderFace({
  volumeDb,
  knobRef,
  trackId,
  role = 'channel',
}: {
  volumeDb: number
  knobRef: RefObject<HTMLDivElement | null>
  trackId?: string
  role?: 'channel' | 'master'
}) {
  return (
    <>
      <div className="pointer-events-none absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2 rounded-[2px] border-x border-black/30 bg-background shadow-[inset_1px_0_1px_rgba(0,0,0,0.45)]" />
      {FADER_SCALE_MARKS.map((mark) => (
        <div
          key={mark}
          aria-hidden="true"
          className={`pointer-events-none absolute left-[2px] h-px ${mark === 0 ? 'w-[10px] bg-foreground/65' : 'w-[5px] bg-muted-foreground/40'}`}
          style={{ top: `${100 - dbToFaderPercent(mark)}%` }}
        />
      ))}
      <div
        ref={knobRef}
        data-track-id={trackId}
        data-fader-knob="true"
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{
          top: `${100 - dbToFaderPercent(volumeDb)}%`,
          width: role === 'master' ? 24 : 20,
          height: role === 'master' ? MASTER_FADER_KNOB_HEIGHT_PX : FADER_KNOB_HEIGHT_PX,
        }}
      >
        <div
          className="relative h-full w-full rounded-[2px] border border-[#18252c] shadow-[0_2px_2px_rgba(0,0,0,0.5),inset_0_2px_0_rgba(225,233,232,0.8)]"
          style={{
            background:
              'linear-gradient(90deg,#c3d0d0,#899da1 25%,#5a6d76 50%,#33444d 75%,#1e2f37)',
          }}
        >
          <div
            className="absolute inset-x-[3px] bottom-[5px] top-[6px] border-x border-[#2d4149]"
            style={{
              background:
                'repeating-linear-gradient(to bottom,#1d2e36 0 .8px,#a3b4b4 .8px 1.4px,transparent 1.4px 3px),linear-gradient(90deg,#9caeb0,#596e77,#32434b,#1d2c33)',
            }}
          />
          <div className="absolute inset-x-[2px] bottom-[2px] h-[2px] bg-[#24353e]" />
        </div>
      </div>
    </>
  )
}

/** Runtime owners supply live gain and history commits. */
export function ConsoleFader({
  label,
  value,
  onLiveChange,
  onGestureStart,
  onGestureEnd,
}: {
  label: string
  value: number
  onLiveChange: (value: number) => void
  onGestureStart: () => void
  onGestureEnd: () => void
}) {
  const knobRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: number; offset: number } | null>(null)
  const commit = (next: number) => {
    onGestureStart()
    onLiveChange(next)
    onGestureEnd()
  }
  return (
    <div className="flex w-20 shrink-0 flex-col gap-3">
      <span className="text-xs font-medium uppercase">{label}</span>
      <div className="relative mx-auto h-48 w-16">
        {FADER_SCALE_MARKS.map((mark) => (
          <span
            key={mark}
            className="pointer-events-none absolute left-0 -translate-y-1/2 font-mono text-[10px] text-muted-foreground"
            style={{ top: `${100 - dbToFaderPercent(mark)}%` }}
          >
            {mark > 0 ? '+' : ''}
            {mark}
          </span>
        ))}
        <div
          className="absolute inset-y-0 right-0 w-8 cursor-ns-resize touch-none rounded-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
          role="slider"
          tabIndex={0}
          aria-label={label}
          aria-orientation="vertical"
          aria-valuemin={FADER_DB_MIN}
          aria-valuemax={FADER_DB_MAX}
          aria-valuenow={value}
          aria-valuetext={`${formatFaderDb(value)} dB`}
          onPointerDown={(event) => {
            if (event.button !== 0) return
            event.preventDefault()
            onGestureStart()
            event.currentTarget.setPointerCapture(event.pointerId)
            const rect = event.currentTarget.getBoundingClientRect()
            const percent = ((rect.bottom - event.clientY) / rect.height) * 100
            const current = dbToFaderPercent(value)
            drag.current = {
              id: event.pointerId,
              offset:
                (Math.abs(percent - current) * rect.height) / 100 <= MASTER_FADER_KNOB_HEIGHT_PX / 2
                  ? current - percent
                  : 0,
            }
            onLiveChange(Math.round(faderPercentToDb(percent + drag.current.offset) * 10) / 10)
          }}
          onPointerMove={(event) => {
            if (drag.current?.id !== event.pointerId) return
            const rect = event.currentTarget.getBoundingClientRect()
            onLiveChange(
              Math.round(
                faderPercentToDb(
                  ((rect.bottom - event.clientY) / rect.height) * 100 + drag.current.offset,
                ) * 10,
              ) / 10,
            )
          }}
          onPointerUp={(event) => {
            if (drag.current?.id !== event.pointerId) return
            drag.current = null
            onGestureEnd()
          }}
          onPointerCancel={() => {
            if (drag.current) {
              drag.current = null
              onGestureEnd()
            }
          }}
          onDoubleClick={() => commit(0)}
          onKeyDown={(event) => {
            const next = faderKeyboardValue(event, value)
            if (next === null) return
            event.preventDefault()
            event.stopPropagation()
            commit(Math.round(next * 10) / 10)
          }}
        >
          <ConsoleFaderFace volumeDb={value} knobRef={knobRef} role="master" />
        </div>
      </div>
      <div className="flex items-center gap-1">
        <label className="min-w-0 flex-1" title={`${label} gain in dB`}>
          <span className="sr-only">{label} value</span>
          <NumberInput
            value={value}
            ariaLabel={`${label} value`}
            min={FADER_DB_MIN}
            max={FADER_DB_MAX}
            step={0.1}
            unitWidth={0}
            scrubEnabled={false}
            formatInputValue={formatFaderDb}
            onChange={commit}
            className="h-7 min-w-0 flex-1 [&>span]:hidden"
          />
        </label>
        <button
          type="button"
          className="h-7 w-6 shrink-0 text-muted-foreground hover:text-foreground"
          aria-label={`Reset ${label} to unity`}
          onClick={() => commit(0)}
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
