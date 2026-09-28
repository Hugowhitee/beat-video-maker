import { memo, useMemo } from 'react'
import { useProjectStore } from '@/features/timeline/deps/projects'
import { useItemsStore } from '../stores/items-store'
import { useTimelineSettingsStore } from '../stores/timeline-settings-store'
import { useZoomStore } from '../stores/zoom-store'
import { resolveBeatvideoTimelineGrid } from '../utils/beatvideo-timeline-grid'
import { resolveBeatGridMarkers } from '../utils/beatvideo-grid-resolution'

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
  const items = useItemsStore((state) => state.items)
  const fps = useTimelineSettingsStore((state) => state.fps)
  const beatGridVisible = useTimelineSettingsStore((state) => state.beatGridVisible)
  const beatGridResolution = useTimelineSettingsStore((state) => state.beatGridResolution)
  const pixelsPerSecond = useZoomStore((state) => state.pixelsPerSecond)

  const timelineGrid = useMemo(
    () =>
      analysis
        ? resolveBeatvideoTimelineGrid(analysis, items, fps)
        : null,
    [analysis, fps, items],
  )

  if (
    !beatGridVisible ||
    !timelineGrid ||
    timelineGrid.grid.beats.length === 0 ||
    duration <= 0
  ) return null

  const { grid, barOneTimelineTime } = timelineGrid
  const { markers, labelStride } = resolveBeatGridMarkers({
    beats: grid.beats,
    beatsPerBar: grid.beatsPerBar,
    barOneTime: barOneTimelineTime,
    resolution: beatGridResolution,
    pixelsPerSecond,
  })

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
      {markers.map(({ beat, isBarOne, barNumber }) => {
        const showBarLabel =
          variant === 'ruler' &&
          beat.downbeat &&
          barNumber !== null &&
          barNumber >= 1 &&
          (barNumber === 1 || (barNumber - 1) % labelStride === 0)
        return (
          <div
            key={`${beat.index}:${beat.time.toFixed(4)}`}
            className="absolute inset-y-0"
            style={{ left: `${leftPercent(beat.time, duration)}%` }}
          >
            <div
              className={
                isBarOne
                  ? 'h-full w-[2px] bg-primary/95'
                  : beat.downbeat
                    ? 'h-full w-px bg-primary/45'
                    : 'h-full w-px bg-foreground/16'
              }
            />
            {showBarLabel ? (
              <span
                className={
                  isBarOne
                    ? 'absolute left-1 top-1 bg-primary px-1 py-0.5 font-mono text-[10px] font-semibold leading-none text-primary-foreground'
                    : 'absolute left-1 top-1 bg-background/80 px-1 py-0.5 font-mono text-[10px] leading-none text-foreground/70'
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
