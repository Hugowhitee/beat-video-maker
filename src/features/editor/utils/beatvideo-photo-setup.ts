import type { MediaMetadata } from '@/types/storage'
import type { TimelineItem, TimelineTrack } from '@/types/timeline'
import {
  addItemsOnNewTracks,
  buildDroppedMediaTimelineItems,
  createClassicTrack,
  getDroppedMediaDurationInFrames,
  getTrackKind,
  useTimelineStore,
} from '@/features/editor/deps/timeline-contract'
import { resolveMediaUrl } from '@/features/editor/deps/media-library'

type PhotoSetupMedia = {
  cover: MediaMetadata | null
  beat: MediaMetadata | null
}

type PhotoSetupResult =
  | { status: 'placed'; itemIds: string[] }
  | { status: 'empty' | 'timeline-not-empty' | 'unresolved-media' }

export function pickPhotoSetupMedia(media: readonly MediaMetadata[]): PhotoSetupMedia {
  return {
    cover: media.find((item) => item.mimeType.startsWith('image/')) ?? null,
    beat: media.find((item) => item.mimeType.startsWith('audio/')) ?? null,
  }
}

export function getPhotoSetupDurationFrames(params: {
  cover: MediaMetadata | null
  beat: MediaMetadata | null
  fps: number
}): { coverFrames: number | null; beatFrames: number | null } {
  const beatFrames = params.beat
    ? getDroppedMediaDurationInFrames(params.beat, 'audio', params.fps)
    : null

  const coverFrames = params.cover
    ? beatFrames ?? getDroppedMediaDurationInFrames(params.cover, 'image', params.fps)
    : null

  return { coverFrames, beatFrames }
}

function ensurePhotoTracks(tracks: TimelineTrack[]): {
  tracks: TimelineTrack[]
  videoTrackId: string
  audioTrackId: string
} {
  let nextTracks = tracks
  let videoTrack = nextTracks.find((track) => !track.isGroup && getTrackKind(track) === 'video')

  if (!videoTrack) {
    const minimumOrder = nextTracks.length > 0 ? Math.min(...nextTracks.map((track) => track.order)) : 0
    videoTrack = createClassicTrack({
      tracks: nextTracks,
      kind: 'video',
      order: minimumOrder - 1,
    })
    nextTracks = [...nextTracks, videoTrack]
  }

  let audioTrack = nextTracks.find((track) => !track.isGroup && getTrackKind(track) === 'audio')
  if (!audioTrack) {
    const maximumOrder = nextTracks.length > 0 ? Math.max(...nextTracks.map((track) => track.order)) : 0
    audioTrack = createClassicTrack({
      tracks: nextTracks,
      kind: 'audio',
      order: maximumOrder + 1,
    })
    nextTracks = [...nextTracks, audioTrack]
  }

  return {
    tracks: nextTracks,
    videoTrackId: videoTrack.id,
    audioTrackId: audioTrack.id,
  }
}

export async function setupBeatvideoPhotoTimeline(params: {
  importedMedia: readonly MediaMetadata[]
  width: number
  height: number
}): Promise<PhotoSetupResult> {
  const timeline = useTimelineStore.getState()

  // Quick-start is intentionally conservative: once the user has begun editing,
  // importing media must never rearrange or silently extend their timeline.
  if (timeline.items.length > 0) {
    return { status: 'timeline-not-empty' }
  }

  const { cover, beat } = pickPhotoSetupMedia(params.importedMedia)
  if (!cover && !beat) {
    return { status: 'empty' }
  }

  const { tracks, videoTrackId, audioTrackId } = ensurePhotoTracks(timeline.tracks)
  const { coverFrames, beatFrames } = getPhotoSetupDurationFrames({
    cover,
    beat,
    fps: timeline.fps,
  })
  const items: TimelineItem[] = []

  if (cover && coverFrames) {
    const src = await resolveMediaUrl(cover.id)
    if (!src) return { status: 'unresolved-media' }

    items.push(
      ...buildDroppedMediaTimelineItems({
        media: cover,
        mediaId: cover.id,
        mediaType: 'image',
        label: cover.fileName,
        timelineFps: timeline.fps,
        blobUrl: src,
        thumbnailUrl: null,
        canvasWidth: params.width,
        canvasHeight: params.height,
        placement: {
          primary: {
            trackId: videoTrackId,
            from: 0,
            durationInFrames: coverFrames,
          },
        },
      }),
    )
  }

  if (beat && beatFrames) {
    const src = await resolveMediaUrl(beat.id)
    if (!src) return { status: 'unresolved-media' }

    items.push(
      ...buildDroppedMediaTimelineItems({
        media: beat,
        mediaId: beat.id,
        mediaType: 'audio',
        label: beat.fileName,
        timelineFps: timeline.fps,
        blobUrl: src,
        thumbnailUrl: null,
        canvasWidth: params.width,
        canvasHeight: params.height,
        placement: {
          primary: {
            trackId: audioTrackId,
            from: 0,
            durationInFrames: beatFrames,
          },
        },
      }),
    )
  }

  if (items.length === 0) {
    return { status: 'empty' }
  }

  addItemsOnNewTracks(items, tracks)
  return { status: 'placed', itemIds: items.map((item) => item.id) }
}
