import { memo, useMemo } from 'react'
import { useProjectStore } from '@/features/timeline/deps/projects'
import { useItemsStore } from '../stores/items-store'
import { useTimelineSettingsStore } from '../stores/timeline-settings-store'
import { useZoomStore } from '../stores/zoom-store'
import { resolveBeatvideoTimelineGrid } from '../utils/beatvideo-timeline-grid'

interface BeatvideoGridOverlayProps {
  duration: number
  variant: 'ruler' | 'tracks'
}

function leftPercent(time: number, duration: number) {
  if (duration <= 0) return 0
  return Math.max(0, Math.min(100, (time / duration) * 100))
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
}

function closestIndex(values: number[], target: number): number {
  let bestIndex = -1
  let bestDistance = Number.POSITIVE_INFINITY
  values.forEach((value, index) => {
    const distance = Math.abs(value - target)
    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = index
    }
  })
  return bestIndex
}

export const BeatvideoGridOverlay = memo(function BeatvideoGridOverlay({
  duration,
  variant,
}: BeatvideoGridOverlayProps) {
  const analysis = useProjectStore((state) => state.currentProject?.beatvideoMusic)
  const items = useItemsStore((state) => state.items)
  const fps = useTimelineSettingsStore((state) => state.fps)
  const pixelsPerSecond = useZoomStore((state) => state.pixelsPerSecond)

  const timelineGrid = useMemo(
    () =>
      analysis
        ? resolveBeatvideoTimelineGrid(analysis, items, fps)
        : null,
    [analysis, fps, items],
  )

  if (!timelineGrid || timelineGrid.grid.beats.length === 0 || duration <= 0) return null

  const { grid, barOneTimelineTime } = timelineGrid
  const beatIntervals = grid.beats
    .slice(1)
    .map((beat, index) => beat.time - (grid.beats[index]?.time ?? beat.time))
    .filter((interval) => interval > 0)
  const beatSpacingPx = median(beatIntervals) * pixelsPerSecond
  const showIndividualBeats = beatSpacingPx >= 7

  const downbeatTimes = grid.beats.filter((beat) => beat.downbeat).map((beat) => beat.time)
  const barOneDownbeatIndex =
    barOneTimelineTime === null ? -1 : closestIndex(downbeatTimes, barOneTimelineTime)

  return (
    <div
      aria-hidden="true"
      data-beatvideo-grid-overlay={variant}
      data-beatvideo-grid-placement={timelineGrid.placement.id}
      className={
        variant === 'ruler'
          ? 'pointer-events-none absolute inset-0 z-[25] overflow-hidden'
          : 'pointer-events-none absolute inset-0 z-[8] overflow-hidden'
      }
    >
      {grid.beats.map((beat) => {
        if (!beat.downbeat && !showIndividualBeats) return null

        const isBarOne =
          barOneTimelineTime !== null &&
          Math.abs(beat.time - barOneTimelineTime) <=
            Math.max(0.012, median(beatIntervals) * 0.12)

        const downbeatIndex = beat.downbeat
          ? downbeatTimes.findIndex((time) => Math.abs(time - beat.time) <= 1e-6)
          : -1
        const barNumber =
          beat.downbeat && barOneDownbeatIndex >= 0 && downbeatIndex >= 0
            ? downbeatIndex - barOneDownbeatIndex + 1
            : null

        const showBarLabel =
          variant === 'ruler' &&
          beat.downbeat &&
          barNumber !== null &&
          barNumber >= 1 &&
          (barNumber === 1 || (barNumber - 1) % 4 === 0)

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
