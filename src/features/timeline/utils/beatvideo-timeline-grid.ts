import type { BeatvideoMusicAnalysis, MusicBeat, MusicMap, MusicSection } from '@/types/beatvideo'
import type { TimelineItem } from '@/types/timeline'
import { resolveBeatvideoMusicGrid } from '@/shared/beatvideo/music-grid'
import {
  getItemSourceSpanSeconds,
  timelineFrameToSourceSeconds,
} from './media-item-frames'

const EPSILON = 1e-6

type MediaTimelineItem = Extract<TimelineItem, { type: 'audio' | 'video' }>

export interface BeatvideoTimelineGrid {
  analysis: BeatvideoMusicAnalysis
  placement: MediaTimelineItem
  grid: MusicMap
  barOneTimelineTime: number | null
}

function isMusicPlacement(
  item: TimelineItem,
  mediaId: string,
): item is MediaTimelineItem {
  return (item.type === 'audio' || item.type === 'video') && item.mediaId === mediaId
}

function containsSourceTime(
  item: MediaTimelineItem,
  sourceTime: number | null,
  timelineFps: number,
): boolean {
  if (sourceTime === null) return false
  const span = getItemSourceSpanSeconds(item, timelineFps)
  if (!span) return false
  return sourceTime >= span.start - EPSILON && sourceTime <= span.end + EPSILON
}

export function findBeatvideoMusicPlacement(
  items: readonly TimelineItem[],
  analysis: BeatvideoMusicAnalysis,
  timelineFps: number,
): MediaTimelineItem | null {
  const candidates = items.filter((item): item is MediaTimelineItem =>
    isMusicPlacement(item, analysis.mediaId),
  )
  if (candidates.length === 0) return null

  return [...candidates].sort((left, right) => {
    const leftContains = containsSourceTime(left, analysis.detectedBarOneTime, timelineFps)
    const rightContains = containsSourceTime(right, analysis.detectedBarOneTime, timelineFps)
    if (leftContains !== rightContains) return leftContains ? -1 : 1

    const leftAudio = left.type === 'audio'
    const rightAudio = right.type === 'audio'
    if (leftAudio !== rightAudio) return leftAudio ? -1 : 1

    if (left.durationInFrames !== right.durationInFrames) {
      return right.durationInFrames - left.durationInFrames
    }
    return left.from - right.from
  })[0] ?? null
}

function isTimelineFrameInsidePlacement(
  item: MediaTimelineItem,
  frame: number,
): boolean {
  return frame >= item.from && frame <= item.from + item.durationInFrames
}

export function normalizeBeatvideoAnalysisForPlacement(
  analysis: BeatvideoMusicAnalysis,
  placement: MediaTimelineItem,
  timelineFps: number,
): BeatvideoMusicAnalysis {
  if (analysis.version >= 2) {
    return {
      ...analysis,
      version: 2,
      gridMode: analysis.gridMode ?? (analysis.bpmOverride !== null ? 'fixed' : 'detected'),
      correctionAnchors: analysis.correctionAnchors ?? [],
    }
  }

  let barOneTime = analysis.detectedBarOneTime
  let barOneVerified = false

  if (analysis.barOneVerified && analysis.barOneTime !== null) {
    const legacyFrame = Math.round(analysis.barOneTime * timelineFps)
    if (isTimelineFrameInsidePlacement(placement, legacyFrame)) {
      barOneTime = timelineFrameToSourceSeconds(placement, legacyFrame, timelineFps)
      barOneVerified = barOneTime !== null
    }
  }

  return {
    ...analysis,
    version: 2,
    barOneTime,
    barOneVerified,
    gridMode: analysis.bpmOverride !== null ? 'fixed' : 'detected',
    correctionAnchors: [],
  }
}

function sourceTimeToTimelineTime(
  sourceTime: number,
  placement: MediaTimelineItem,
  timelineFps: number,
  sourceSpan: { start: number; end: number },
): number {
  const speed = Math.max(EPSILON, placement.speed ?? 1)
  const sourceDelta = placement.isReversed
    ? sourceSpan.end - sourceTime
    : sourceTime - sourceSpan.start
  return placement.from / timelineFps + sourceDelta / speed
}

function mapBeatToTimeline(
  beat: MusicBeat,
  placement: MediaTimelineItem,
  timelineFps: number,
  sourceSpan: { start: number; end: number },
): MusicBeat {
  return {
    ...beat,
    time: sourceTimeToTimelineTime(beat.time, placement, timelineFps, sourceSpan),
  }
}

function mapSectionToTimeline(
  section: MusicSection,
  placement: MediaTimelineItem,
  timelineFps: number,
  sourceSpan: { start: number; end: number },
): MusicSection | null {
  const sourceStart = Math.max(sourceSpan.start, section.start)
  const sourceEnd = Math.min(sourceSpan.end, section.end)
  if (sourceEnd <= sourceStart + EPSILON) return null

  const mappedStart = sourceTimeToTimelineTime(sourceStart, placement, timelineFps, sourceSpan)
  const mappedEnd = sourceTimeToTimelineTime(sourceEnd, placement, timelineFps, sourceSpan)
  return {
    ...section,
    start: Math.min(mappedStart, mappedEnd),
    end: Math.max(mappedStart, mappedEnd),
  }
}

export function resolveBeatvideoTimelineGrid(
  analysis: BeatvideoMusicAnalysis,
  items: readonly TimelineItem[],
  timelineFps: number,
): BeatvideoTimelineGrid | null {
  if (!Number.isFinite(timelineFps) || timelineFps <= 0) return null

  const placement = findBeatvideoMusicPlacement(items, analysis, timelineFps)
  if (!placement) return null

  const normalized = normalizeBeatvideoAnalysisForPlacement(analysis, placement, timelineFps)
  const sourceGrid = resolveBeatvideoMusicGrid(normalized)
  const sourceSpan = getItemSourceSpanSeconds(placement, timelineFps)
  if (!sourceSpan) return null

  const beats = sourceGrid.beats
    .filter(
      (beat) =>
        beat.time >= sourceSpan.start - EPSILON &&
        beat.time <= sourceSpan.end + EPSILON,
    )
    .map((beat) => mapBeatToTimeline(beat, placement, timelineFps, sourceSpan))
    .filter(
      (beat) =>
        beat.time >= placement.from / timelineFps - EPSILON &&
        beat.time <=
          (placement.from + placement.durationInFrames) / timelineFps + EPSILON,
    )
    .sort((left, right) => left.time - right.time)

  const placementSpeed =
    placement.type === 'audio' || placement.type === 'video'
      ? Math.max(EPSILON, placement.speed ?? 1)
      : 1

  const barOneSourceTime = normalized.barOneTime ?? normalized.detectedBarOneTime
  const barOneTimelineTime =
    barOneSourceTime !== null &&
    barOneSourceTime >= sourceSpan.start - EPSILON &&
    barOneSourceTime <= sourceSpan.end + EPSILON
      ? sourceTimeToTimelineTime(barOneSourceTime, placement, timelineFps, sourceSpan)
      : null

  return {
    analysis: normalized,
    placement,
    grid: {
      ...sourceGrid,
      bpm: sourceGrid.bpm ? sourceGrid.bpm * placementSpeed : sourceGrid.bpm,
      duration: placement.durationInFrames / timelineFps,
      beats,
      sections: sourceGrid.sections
        .map((section) => mapSectionToTimeline(section, placement, timelineFps, sourceSpan))
        .filter((section): section is MusicSection => section !== null)
        .sort((left, right) => left.start - right.start),
    },
    barOneTimelineTime,
  }
}
