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
