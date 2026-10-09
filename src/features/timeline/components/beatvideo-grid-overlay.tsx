import { memo, useMemo } from 'react'
import { useProjectStore } from '@/features/timeline/deps/projects'
import { useItemsStore } from '../stores/items-store'
import { useTimelineSettingsStore } from '../stores/timeline-settings-store'
import { useZoomStore } from '../stores/zoom-store'
import { resolveBeatvideoTimelineGrid } from '../utils/beatvideo-timeline-grid'
import { resolveBeatGridMarkers } from '../utils/beatvideo-grid-resolution'
import { createTimelineTrackContentLayerRef } from '../utils/timeline-live-geometry'
import type { MusicSection } from '@/types/beatvideo'
import { formatTimecodeCompact, secondsToFrames } from '@/shared/utils/time-utils'

interface BeatvideoGridOverlayProps {
  duration: number
  variant: 'ruler' | 'tracks'
  alignedTimeRuler?: boolean
}

function leftPercent(time: number, duration: number) {
  if (duration <= 0) return 0
  return Math.max(0, Math.min(100, (time / duration) * 100))
}

function sectionColor(section: MusicSection, index: number, variant: 'ruler' | 'tracks') {
  const hue =
    section.kind === 'intro'
      ? 225
      : section.kind === 'build'
        ? 70
        : section.kind === 'drop'
          ? 150
          : section.kind === 'break'
            ? 290
            : section.kind === 'outro'
              ? 25
              : ([225, 285, 170, 55][index % 4] ?? 225)
  const chroma = section.kind === 'unknown' ? 0.045 : 0.07
  const alpha = variant === 'ruler' ? 0.3 : 0.065
  return `oklch(0.7 ${chroma} ${hue} / ${alpha})`
}

function sectionLabel(section: MusicSection, index: number) {
  if (section.kind === 'unknown') return `Section ${index + 1}`
  return section.kind[0]!.toUpperCase() + section.kind.slice(1)
}

export const BeatvideoGridOverlay = memo(function BeatvideoGridOverlay({
  duration,
  variant,
  alignedTimeRuler = false,
}: BeatvideoGridOverlayProps) {
  const analysis = useProjectStore((state) => state.currentProject?.beatvideoMusic)
  const items = useItemsStore((state) => state.items)
  const fps = useTimelineSettingsStore((state) => state.fps)
  const beatGridVisible = useTimelineSettingsStore((state) => state.beatGridVisible)
  const beatGridResolution = useTimelineSettingsStore((state) => state.beatGridResolution)
  const pixelsPerSecond = useZoomStore((state) => state.pixelsPerSecond)
  const contentLayerRef = useMemo(createTimelineTrackContentLayerRef, [])

  const timelineGrid = useMemo(
    () => (analysis ? resolveBeatvideoTimelineGrid(analysis, items, fps) : null),
    [analysis, fps, items],
  )

  if (!beatGridVisible || !timelineGrid || timelineGrid.grid.beats.length === 0 || duration <= 0)
    return null

  const { grid, barOneTimelineTime } = timelineGrid
  const { markers, labelStride } = resolveBeatGridMarkers({
    beats: grid.beats,
    beatsPerBar: grid.beatsPerBar,
    barOneTime: barOneTimelineTime,
    resolution: beatGridResolution,
    pixelsPerSecond,
    minimumLabelSpacingPx: alignedTimeRuler ? 112 : undefined,
  })

  return (
    <div
      ref={variant === 'ruler' ? contentLayerRef : undefined}
      style={
        variant === 'tracks'
          ? { width: 'var(--timeline-content-width, 100%)' }
          : { top: alignedTimeRuler ? 0 : 20, height: alignedTimeRuler ? 37 : 17 }
      }
      aria-hidden="true"
      data-beatvideo-grid-overlay={variant}
      data-beatvideo-grid-placement={timelineGrid.placement.id}
      className={
        variant === 'ruler'
          ? 'pointer-events-none absolute left-0 top-0 h-full z-[25] overflow-hidden'
          : 'pointer-events-none absolute left-0 top-0 h-full z-[8] overflow-hidden'
      }
    >
      {grid.sections.map((section, index) => {
        const left = leftPercent(section.start, duration)
        const width = Math.max(0, leftPercent(section.end, duration) - left)
        const showLabel =
          variant === 'ruler' && (section.end - section.start) * pixelsPerSecond >= 72
        return (
          <div
            key={section.id}
            className={
              variant === 'ruler'
                ? 'absolute bottom-0 h-[6px] border-l border-foreground/30'
                : 'absolute inset-y-0 border-l border-foreground/14'
            }
            style={{
              left: `${left}%`,
              width: `${width}%`,
              backgroundColor: sectionColor(section, index, variant),
            }}
          >
            {showLabel ? (
              <span className="absolute left-1/2 top-[1px] -translate-x-1/2 whitespace-nowrap bg-background/90 px-1 font-mono text-[10px] font-medium leading-none text-foreground/85">
                {sectionLabel(section, index)}
              </span>
            ) : null}
          </div>
        )
      })}
      {markers.map(({ beat, isBarOne, barNumber, kind }) => {
        const isPhraseBar =
          kind === 'bar' &&
          barNumber !== null &&
          barNumber >= 1 &&
          (barNumber === 1 || (barNumber - 1) % 4 === 0)
        const showBarLabel =
          variant === 'ruler' &&
          kind === 'bar' &&
          barNumber !== null &&
          barNumber >= 1 &&
          (barNumber === 1 || (barNumber - 1) % labelStride === 0)
        return (
          <div
            key={`${beat.index}:${beat.time.toFixed(4)}`}
            data-musical-marker={isBarOne ? 'bar-one' : isPhraseBar ? 'phrase' : kind}
            className="absolute bottom-0"
            style={{
              left: `${leftPercent(beat.time, duration)}%`,
              height: variant === 'ruler' ? 17 : '100%',
            }}
          >
            <div
              className={
                isBarOne
                  ? 'h-full w-[2px] bg-primary/95'
                  : kind === 'subdivision'
                    ? 'h-full w-px bg-foreground/[0.09]'
                    : isPhraseBar
                      ? 'h-full w-[2px] bg-[#56666f]/70'
                      : kind === 'bar'
                        ? 'h-full w-px bg-[#56666f]/45'
                        : 'h-full w-px bg-[#56666f]/25'
              }
            />
            {showBarLabel && alignedTimeRuler ? (
              <span className="absolute left-1 -top-[17px] whitespace-nowrap font-mono text-[10px] font-normal leading-none text-foreground">
                {formatTimecodeCompact(secondsToFrames(beat.time, fps), fps)}
              </span>
            ) : null}
            {showBarLabel ? (
              <span className="absolute left-1 top-1 font-mono text-[10px] font-normal leading-none text-foreground">
                {String(barNumber).padStart(2, '0')}
              </span>
            ) : null}
          </div>
        )
      })}
    </div>
  )
})
