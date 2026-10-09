import type { TimelineTrack } from '@/types/timeline'
import { getTrackKind } from './classic-tracks'

/** Section bands belong to the unified stack, never to independent scroll panes. */
export function getProducerTrackSection(tracks: TimelineTrack[], index: number) {
  const track = tracks[index]
  if (!track) return null
  const kind = getTrackKind(track)
  const previous = tracks[index - 1]
  if (!kind || (previous && getTrackKind(previous) === kind)) return null
  return { label: kind === 'video' ? 'Visual' : 'Audio', height: kind === 'video' ? 26 : 24 }
}
