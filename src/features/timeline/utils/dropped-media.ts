import type { TimelineItem } from '@/types/timeline'
import type { MediaMetadata } from '@/types/storage'
import type { BeatvideoMusicAnalysis } from '@/types/beatvideo'
import type { BeatvideoProjectMode } from '@/types/project'
import type { InitialTransformFitMode } from './transform-init'
import {
  buildMediaTimelineItem,
  buildMediaTimelineItems,
  type LinkedMediaTimelinePlacement,
  type MediaTimelineItemType,
  type MediaTimelinePlacement,
} from './media-timeline-item-builder'

export type DroppableMediaType = MediaTimelineItemType

export interface TimelineMediaPlacement extends Required<MediaTimelinePlacement> {}

export interface TimelineLinkedMediaPlacement {
  primary: TimelineMediaPlacement
  linkedAudio?: TimelineMediaPlacement
}

export interface DroppedMediaDurationContext {
  beatvideoMode?: BeatvideoProjectMode
  beatvideoMusic?: BeatvideoMusicAnalysis
  projectMedia?: readonly MediaMetadata[]
  timelineItems?: readonly TimelineItem[]
}

function maxTimelineEnd(
  items: readonly TimelineItem[] | undefined,
  predicate: (item: TimelineItem) => boolean,
): number {
  if (!items?.length) return 0

  let maxEnd = 0
  for (const item of items) {
    if (!predicate(item)) continue
    maxEnd = Math.max(maxEnd, item.from + item.durationInFrames)
  }
  return maxEnd
}

export function resolvePhotoPublishingDurationInFrames(
  timelineFps: number,
  context: DroppedMediaDurationContext,
): number {
  const beatMediaId = context.beatvideoMusic?.mediaId

  if (beatMediaId) {
    const placedBeatEnd = maxTimelineEnd(
      context.timelineItems,
      (item) =>
        (item.type === 'audio' || item.type === 'video') && item.mediaId === beatMediaId,
    )
    if (placedBeatEnd > 0) return placedBeatEnd
  }

  const placedAudioEnd = maxTimelineEnd(context.timelineItems, (item) => item.type === 'audio')
  if (placedAudioEnd > 0) return placedAudioEnd

  const analyzedDuration = context.beatvideoMusic?.musicMap.duration ?? 0
  if (analyzedDuration > 0) {
    return Math.max(1, Math.round(analyzedDuration * timelineFps))
  }

  if (beatMediaId) {
    const beatMediaDuration =
      context.projectMedia?.find((candidate) => candidate.id === beatMediaId)?.duration ?? 0
    if (beatMediaDuration > 0) {
      return Math.max(1, Math.round(beatMediaDuration * timelineFps))
    }
  }

  let longestImportedBeat = 0
  for (const candidate of context.projectMedia ?? []) {
    if (!candidate.mimeType.startsWith('audio/') || candidate.duration <= 0) continue
    longestImportedBeat = Math.max(longestImportedBeat, candidate.duration)
  }

  return longestImportedBeat > 0
    ? Math.max(1, Math.round(longestImportedBeat * timelineFps))
    : 0
}

export function getDroppedMediaDurationInFrames(
  media: Pick<MediaMetadata, 'duration'> & Partial<Pick<MediaMetadata, 'fps'>>,
  mediaType: DroppableMediaType,
  timelineFps: number,
  context: DroppedMediaDurationContext = {},
): number {
  if (mediaType === 'lottie') {
    const lottieFrames = Math.round(media.duration * (media.fps || timelineFps))
    // Guard against missing/invalid metadata producing a zero-length clip.
    return lottieFrames > 0 ? lottieFrames : timelineFps
  }

  if (mediaType === 'image' && context.beatvideoMode === 'photo') {
    const beatDurationInFrames = resolvePhotoPublishingDurationInFrames(timelineFps, context)
    if (beatDurationInFrames > 0) return beatDurationInFrames
  }

  const durationInFrames = Math.round(media.duration * timelineFps)
  if (durationInFrames > 0) {
    return durationInFrames
  }

  return mediaType === 'image' ? timelineFps * 3 : timelineFps
}

export function buildDroppedMediaTimelineItem(params: {
  media: MediaMetadata
  mediaId: string
  mediaType: DroppableMediaType
  label: string
  timelineFps: number
  blobUrl: string
  thumbnailUrl?: string | null
  canvasWidth: number
  canvasHeight: number
  placement: TimelineMediaPlacement
  originId?: string
  linkedGroupId?: string
  initialFit?: InitialTransformFitMode
}): TimelineItem {
  return buildMediaTimelineItem({
    media: params.media,
    mediaId: params.mediaId,
    mediaType: params.mediaType,
    label: params.label,
    projectFps: params.timelineFps,
    blobUrl: params.blobUrl,
    thumbnailUrl: params.thumbnailUrl,
    canvasWidth: params.canvasWidth,
    canvasHeight: params.canvasHeight,
    placement: params.placement,
    originId: params.originId ?? crypto.randomUUID(),
    linkedGroupId: params.linkedGroupId,
    initialFit: params.initialFit,
  })
}

export function buildDroppedMediaTimelineItems(params: {
  media: MediaMetadata
  mediaId: string
  mediaType: DroppableMediaType
  label: string
  timelineFps: number
  blobUrl: string
  thumbnailUrl?: string | null
  canvasWidth: number
  canvasHeight: number
  placement: TimelineLinkedMediaPlacement
  linkVideoAudio?: boolean
  initialFit?: InitialTransformFitMode
}): TimelineItem[] {
  return buildMediaTimelineItems({
    media: params.media,
    mediaId: params.mediaId,
    mediaType: params.mediaType,
    label: params.label,
    projectFps: params.timelineFps,
    blobUrl: params.blobUrl,
    thumbnailUrl: params.thumbnailUrl,
    canvasWidth: params.canvasWidth,
    canvasHeight: params.canvasHeight,
    placements: params.placement satisfies LinkedMediaTimelinePlacement,
    linkVideoAudio: params.linkVideoAudio,
    initialFit: params.initialFit,
  })
}
