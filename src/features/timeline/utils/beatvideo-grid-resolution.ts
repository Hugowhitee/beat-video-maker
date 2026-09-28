import type { MusicBeat } from '@/types/beatvideo'
import { resolveBeatGridDensity } from './beatvideo-grid-density'

export type BeatGridResolution =
  | 'auto'
  | 'beat'
  | 'bar'
  | '2-bars'
  | '4-bars'
  | '8-bars'
  | '16-bars'

export const BEAT_GRID_RESOLUTION_OPTIONS: readonly {
  value: BeatGridResolution
  label: string
}[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'beat', label: 'Beat' },
  { value: 'bar', label: '1 bar' },
  { value: '2-bars', label: '2 bars' },
  { value: '4-bars', label: '4 bars' },
  { value: '8-bars', label: '8 bars' },
  { value: '16-bars', label: '16 bars' },
]

const MANUAL_GRID_RESOLUTION_ORDER: readonly Exclude<BeatGridResolution, 'auto'>[] = [
  'beat',
  'bar',
  '2-bars',
  '4-bars',
  '8-bars',
  '16-bars',
]

export function stepBeatGridResolution(
  resolution: BeatGridResolution,
  direction: 'denser' | 'sparser',
): BeatGridResolution {
  if (resolution === 'auto') {
    return direction === 'denser' ? 'beat' : '2-bars'
  }

  const index = MANUAL_GRID_RESOLUTION_ORDER.indexOf(resolution)
  if (index < 0) return resolution
  const delta = direction === 'denser' ? -1 : 1
  const nextIndex = Math.max(0, Math.min(MANUAL_GRID_RESOLUTION_ORDER.length - 1, index + delta))
  return MANUAL_GRID_RESOLUTION_ORDER[nextIndex] ?? resolution
}

export interface BeatGridMarker {
  beat: MusicBeat
  isBarOne: boolean
  barNumber: number | null
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

function manualBarStride(resolution: BeatGridResolution): number | null {
  if (resolution === 'bar') return 1
  if (resolution === '2-bars') return 2
  if (resolution === '4-bars') return 4
  if (resolution === '8-bars') return 8
  if (resolution === '16-bars') return 16
  return null
}

export function resolveBeatGridMarkers(params: {
  beats: readonly MusicBeat[]
  beatsPerBar: number
  barOneTime: number | null
  resolution: BeatGridResolution
  pixelsPerSecond: number
}): {
  markers: BeatGridMarker[]
  labelStride: number
} {
  const { beats, barOneTime, resolution } = params
  if (beats.length === 0) return { markers: [], labelStride: 1 }

  const beatIntervals = beats
    .slice(1)
    .map((beat, index) => beat.time - (beats[index]?.time ?? beat.time))
    .filter((interval) => interval > 0)
  const beatSpacingPx = median(beatIntervals) * Math.max(0, params.pixelsPerSecond)

  const downbeats = beats.filter((beat) => beat.downbeat)
  const downbeatTimes = downbeats.map((beat) => beat.time)
  const barIntervals = downbeatTimes
    .slice(1)
    .map((time, index) => time - (downbeatTimes[index] ?? time))
    .filter((interval) => interval > 0)
  const measuredBarSpacingPx = median(barIntervals) * Math.max(0, params.pixelsPerSecond)
  const barSpacingPx =
    measuredBarSpacingPx > 0
      ? measuredBarSpacingPx
      : beatSpacingPx * Math.max(1, params.beatsPerBar)

  const autoDensity = resolveBeatGridDensity(beatSpacingPx, barSpacingPx)
  const barOneDownbeatIndex =
    barOneTime === null ? -1 : closestIndex(downbeatTimes, barOneTime)
  const anchorIndex = Math.max(0, barOneDownbeatIndex)

  const showIndividualBeats =
    resolution === 'beat'
      ? true
      : resolution === 'auto'
        ? autoDensity.showIndividualBeats
        : false
  const barStride =
    manualBarStride(resolution) ??
    (resolution === 'beat' ? 1 : autoDensity.barStride)
  const labelStride =
    resolution === 'auto'
      ? autoDensity.labelStride
      : Math.max(barStride, autoDensity.labelStride)

  const markers = beats.flatMap((beat): BeatGridMarker[] => {
    const isBarOne =
      barOneTime !== null &&
      Math.abs(beat.time - barOneTime) <= Math.max(0.012, median(beatIntervals) * 0.12)

    if (!beat.downbeat) {
      return showIndividualBeats ? [{ beat, isBarOne: false, barNumber: null }] : []
    }

    const downbeatIndex = downbeatTimes.findIndex(
      (time) => Math.abs(time - beat.time) <= 1e-6,
    )
    const barDistance =
      downbeatIndex >= 0 ? Math.abs(downbeatIndex - anchorIndex) : 0
    if (!isBarOne && barDistance % barStride !== 0) return []

    const barNumber =
      barOneDownbeatIndex >= 0 && downbeatIndex >= 0
        ? downbeatIndex - barOneDownbeatIndex + 1
        : null

    return [{ beat, isBarOne, barNumber }]
  })

  return { markers, labelStride }
}
