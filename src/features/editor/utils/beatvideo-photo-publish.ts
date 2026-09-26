import type { TimelineItem } from '@/types/timeline'
import type { TransformProperties } from '@/types/transform'
import { computeInitialTransform } from '@/features/editor/deps/timeline-utils'

export interface BeatvideoPhotoPublishRange {
  from: number
  durationInFrames: number
}

function longestRange(items: TimelineItem[]): BeatvideoPhotoPublishRange | null {
  const item = [...items].sort((left, right) => {
    if (right.durationInFrames !== left.durationInFrames) {
      return right.durationInFrames - left.durationInFrames
    }
    return left.from - right.from
  })[0]

  return item
    ? {
        from: item.from,
        durationInFrames: Math.max(1, item.durationInFrames),
      }
    : null
}

/**
 * Resolve the range a Photo-mode cover/title should occupy.
 * Prefer the actual analyzed beat placement so trims/moves/retimes stay canonical;
 * fall back to analyzed source duration, then the longest normal audio item.
 */
export function resolveBeatvideoPhotoPublishRange(params: {
  items: TimelineItem[]
  fps: number
  beatMediaId?: string | null
  analyzedDurationSeconds?: number | null
}): BeatvideoPhotoPublishRange | null {
  const { items, fps, beatMediaId, analyzedDurationSeconds } = params

  if (beatMediaId) {
    const beatPlacements = items.filter(
      (item) =>
        item.mediaId === beatMediaId &&
        (item.type === 'audio' || item.type === 'video'),
    )
    const placement = longestRange(beatPlacements)
    if (placement) return placement
  }

  if (
    Number.isFinite(analyzedDurationSeconds) &&
    (analyzedDurationSeconds ?? 0) > 0 &&
    Number.isFinite(fps) &&
    fps > 0
  ) {
    return {
      from: 0,
      durationInFrames: Math.max(1, Math.round((analyzedDurationSeconds ?? 0) * fps)),
    }
  }

  return longestRange(items.filter((item) => item.type === 'audio'))
}

export function buildBeatvideoPhotoCoverTransform(
  item: TimelineItem,
  canvasWidth: number,
  canvasHeight: number,
): TransformProperties | null {
  if (item.type !== 'image') return null

  const sourceWidth = item.sourceWidth ?? canvasWidth
  const sourceHeight = item.sourceHeight ?? canvasHeight
  const fitted = computeInitialTransform(
    sourceWidth,
    sourceHeight,
    canvasWidth,
    canvasHeight,
    'cover',
  )

  return {
    ...item.transform,
    ...fitted,
  }
}
