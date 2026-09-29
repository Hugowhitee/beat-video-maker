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

/**
 * Compact producer surfaces keep the canonical track list in state but omit
 * empty generic V/A lanes once real project content exists. Dedicated producer
 * lanes and every non-empty edit lane remain visible.
 */
export function resolveCompactProducerTracks(
  tracks: TimelineTrack[],
  itemsByTrackId: Record<string, readonly unknown[] | undefined>,
): TimelineTrack[] {
  const hasProjectContent = tracks.some(
    (track) => (itemsByTrackId[track.id]?.length ?? 0) > 0,
  )
  if (!hasProjectContent) return tracks

  return tracks.filter((track) => {
    if ((itemsByTrackId[track.id]?.length ?? 0) > 0) return true
    return !/^[VA]\d+$/i.test(track.name.trim())
  })
}
