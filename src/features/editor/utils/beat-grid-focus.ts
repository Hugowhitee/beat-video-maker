import type { BeatvideoMusicAnalysis, MusicMap } from '@/types/beatvideo'

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
}

/**
 * Pick a useful canonical-timeline zoom for beat-grid correction.
 *
 * The target is intentionally expressed as pixels-per-beat rather than a fixed
 * zoom so 70 BPM and 180 BPM material both expose comparable onset detail.
 */
export function resolveBeatGridFocusZoomLevel(
  map: Pick<MusicMap, 'beats' | 'bpm'>,
  targetBeatPixels = 220,
): number {
  const intervals = map.beats
    .slice(1)
    .map((beat, index) => beat.time - (map.beats[index]?.time ?? beat.time))
    .filter((interval) => Number.isFinite(interval) && interval > 0.05 && interval < 3)

  const measuredBeatSeconds = median(intervals)
  const fallbackBeatSeconds =
    map.bpm && map.bpm > 0 ? 60 / map.bpm : 0.5
  const beatSeconds = measuredBeatSeconds > 0 ? measuredBeatSeconds : fallbackBeatSeconds
  const pixelsPerSecond = targetBeatPixels / Math.max(beatSeconds, 0.05)

  return Math.max(1.5, Math.min(10, pixelsPerSecond / 100))
}

export function resolveNearestBeatOffsetMs(
  beats: readonly { time: number }[],
  timelineTime: number,
): number | null {
  if (beats.length === 0 || !Number.isFinite(timelineTime)) return null

  let nearest = beats[0]!
  let nearestDistance = Math.abs(timelineTime - nearest.time)
  for (const beat of beats.slice(1)) {
    const distance = Math.abs(timelineTime - beat.time)
    if (distance < nearestDistance) {
      nearest = beat
      nearestDistance = distance
    }
  }

  return (timelineTime - nearest.time) * 1000
}


export type BeatGridReviewState = 'hidden' | 'recommended' | 'manual'

/**
 * Keep beat-grid repair out of the normal producer flow when the automatic
 * evidence is healthy. Manual controls return when the analysis is uncertain,
 * or remain available after the user has deliberately edited the grid.
 */
export function resolveBeatGridReviewState(
  analysis: BeatvideoMusicAnalysis,
): BeatGridReviewState {
  const hasManualState =
    analysis.gridMode === 'fixed' ||
    analysis.bpmOverride !== null ||
    analysis.barOneVerified ||
    (analysis.correctionAnchors?.length ?? 0) > 0

  if (hasManualState) return 'manual'

  const fit = analysis.musicMap.gridFit
  const uncertainAutomaticGrid =
    analysis.musicMap.beatsPerBar !== 4 ||
    analysis.detectedBarOneTime === null ||
    !fit ||
    fit.mode !== 'fixed' ||
    fit.confidence < 0.6 ||
    (fit.medianErrorMs !== null && fit.medianErrorMs > 35)

  return uncertainAutomaticGrid ? 'recommended' : 'hidden'
}
