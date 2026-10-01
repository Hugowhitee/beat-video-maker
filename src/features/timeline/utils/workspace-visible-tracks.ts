import type { EditorWorkspaceId } from '@/config/editor-workspaces'
import type { TimelineTrack } from '@/types/timeline'
import { getTrackKind } from './classic-tracks'

/**
 * Workspaces are views over one canonical timeline. Master narrows the visible
 * lanes to real audio tracks when they exist, but legacy/manual projects with
 * no dedicated audio lanes must never open to an empty timeline.
 */
export function resolveWorkspaceVisibleTracks(
  tracks: TimelineTrack[],
  workspace: EditorWorkspaceId,
): TimelineTrack[] {
  if (workspace !== 'master') return tracks

  const audioTracks = tracks.filter((track) => getTrackKind(track) === 'audio')
  return audioTracks.length > 0 ? audioTracks : tracks
}

export interface ProducerTrackLayout {
  visibleTracks: TimelineTrack[]
  extraTracks: TimelineTrack[]
  primaryMediaTrackId: string | null
  beatTrackId: string | null
}

function itemCount(
  itemsByTrackId: Record<string, readonly unknown[] | undefined>,
  trackId: string,
): number {
  return itemsByTrackId[trackId]?.length ?? 0
}

function isDedicatedProducerExtra(track: TimelineTrack): boolean {
  return track.name === 'Producer tags' || track.name === 'Watermarks'
}

function isProducerUtilityTrack(
  itemsByTrackId: Record<string, readonly unknown[] | undefined>,
  trackId: string,
): boolean {
  const items = itemsByTrackId[trackId] ?? []
  if (items.length === 0) return false

  return items.every((item) => {
    if (!item || typeof item !== 'object' || !('type' in item)) return false
    const type = (item as { type?: unknown }).type
    return type === 'adjustment' || type === 'controller'
  })
}

/**
 * Beatvideo's normal producer timeline is a task view over canonical track
 * state, not a second track model:
 *
 *   Media
 *   Beat
 *   Extras (only when expanded)
 *
 * Empty V/A plumbing stays available in state for generic FreeCut operations,
 * but it is not permanent Beatvideo UI. Existing content is never deleted.
 */
export function resolveProducerTrackLayout(
  tracks: TimelineTrack[],
  itemsByTrackId: Record<string, readonly unknown[] | undefined>,
  showExtras = false,
): ProducerTrackLayout {
  const usableTracks = tracks.filter(
    (track) => !track.isGroup && !isProducerUtilityTrack(itemsByTrackId, track.id),
  )
  const videoTracks = usableTracks.filter((track) => getTrackKind(track) === 'video')
  const populatedVideoTracks = videoTracks.filter(
    (track) => itemCount(itemsByTrackId, track.id) > 0,
  )
  const primaryMediaTrack = populatedVideoTracks[0] ?? videoTracks[0] ?? null
  const beatTrack =
    usableTracks.find(
      (track) => getTrackKind(track) === 'audio' && track.name === 'Beat',
    ) ?? null

  const primaryIds = new Set(
    [primaryMediaTrack?.id, beatTrack?.id].filter((id): id is string => Boolean(id)),
  )

  const extraTracks = usableTracks
    .filter((track) => {
      if (primaryIds.has(track.id)) return false
      if (itemCount(itemsByTrackId, track.id) > 0) return true
      return isDedicatedProducerExtra(track)
    })
    .sort((left, right) => {
      const leftVideo = getTrackKind(left) === 'video'
      const rightVideo = getTrackKind(right) === 'video'
      if (leftVideo !== rightVideo) return leftVideo ? -1 : 1
      return (left.order ?? 0) - (right.order ?? 0)
    })

  const visibleTracks = [
    ...(primaryMediaTrack ? [primaryMediaTrack] : []),
    ...(beatTrack ? [beatTrack] : []),
    ...(showExtras ? extraTracks : []),
  ]

  if (visibleTracks.length === 0 && usableTracks.length > 0) {
    visibleTracks.push(usableTracks[0]!)
  }

  return {
    visibleTracks,
    extraTracks,
    primaryMediaTrackId: primaryMediaTrack?.id ?? null,
    beatTrackId: beatTrack?.id ?? null,
  }
}

/** Backwards-compatible focused helper. */
export function resolveCompactProducerTracks(
  tracks: TimelineTrack[],
  itemsByTrackId: Record<string, readonly unknown[] | undefined>,
): TimelineTrack[] {
  return resolveProducerTrackLayout(tracks, itemsByTrackId, true).visibleTracks
}
