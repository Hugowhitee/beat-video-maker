import { memo, useMemo } from 'react'
import { useProjectStore } from '@/features/timeline/deps/projects'
import { useZoomStore } from '../stores/zoom-store'
import { resolveBeatvideoMusicGrid } from '@/shared/beatvideo/music-grid'

interface BeatvideoGridOverlayProps {
  duration: number
  variant: 'ruler' | 'tracks'
}

function leftPercent(time: number, duration: number) {
  if (duration <= 0) return 0
  return Math.max(0, Math.min(100, (time / duration) * 100))
}

export const BeatvideoGridOverlay = memo(function BeatvideoGridOverlay({
  duration,
  variant,
}: BeatvideoGridOverlayProps) {
  const analysis = useProjectStore((state) => state.currentProject?.beatvideoMusic)
  const pixelsPerSecond = useZoomStore((state) => state.pixelsPerSecond)

  const grid = useMemo(
    () => (analysis ? resolveBeatvideoMusicGrid(analysis) : null),
    [analysis],
  )

  if (!analysis || !grid || grid.beats.length === 0 || duration <= 0) return null

  const bpm = grid.bpm
  const beatSpacingPx = bpm && bpm > 0 ? pixelsPerSecond * (60 / bpm) : 0
  const showIndividualBeats = beatSpacingPx >= 7
  const barDuration =
    bpm && bpm > 0 ? (60 / bpm) * Math.max(1, grid.beatsPerBar) : null
  const barOneTime = analysis.barOneTime

  return (
    <div
      aria-hidden="true"
      data-beatvideo-grid-overlay={variant}
      className={
        variant === 'ruler'
          ? 'pointer-events-none absolute inset-0 z-[25] overflow-hidden'
          : 'pointer-events-none absolute inset-0 z-[8] overflow-hidden'
      }
    >
      {grid.beats.map((beat) => {
        if (!beat.downbeat && !showIndividualBeats) return null

        const isBarOne =
          barOneTime !== null
          && Math.abs(beat.time - barOneTime) <= Math.max(0.012, bpm ? 0.12 * (60 / bpm) : 0.02)
        let barNumber: number | null = null
        if (beat.downbeat && barOneTime !== null && barDuration && barDuration > 0) {
          barNumber = Math.round((beat.time - barOneTime) / barDuration) + 1
        }

        const showBarLabel =
          variant === 'ruler'
          && beat.downbeat
          && barNumber !== null
          && barNumber >= 1
          && (barNumber === 1 || (barNumber - 1) % 4 === 0)

        return (
          <div
            key={`${beat.index}:${beat.time.toFixed(4)}`}
            className="absolute inset-y-0"
            style={{ left: `${leftPercent(beat.time, duration)}%` }}
          >
            <div
              className={
                isBarOne
                  ? 'h-full w-[2px] bg-primary/90'
                  : beat.downbeat
                    ? 'h-full w-px bg-primary/40'
                    : 'h-full w-px bg-foreground/10'
              }
            />
            {showBarLabel ? (
              <span
                className={
                  isBarOne
                    ? 'absolute left-1 top-3 rounded-sm bg-primary px-1 py-0.5 font-mono text-[9px] font-semibold leading-none text-primary-foreground shadow-sm'
                    : 'absolute left-1 top-3 rounded-sm bg-background/85 px-1 py-0.5 font-mono text-[8px] leading-none text-muted-foreground'
                }
              >
                {barNumber}
              </span>
            ) : null}
          </div>
        )
      })}
    </div>
  )
})
