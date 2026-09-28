import { describe, expect, it } from 'vite-plus/test'
import type { TimelineTrack } from '@/types/timeline'
import { resolveWorkspaceVisibleTracks } from './workspace-visible-tracks'

function track(id: string, kind: 'audio' | 'video'): TimelineTrack {
  return {
    id,
    name: id,
    kind,
    order: 0,
    height: 64,
    visible: true,
    locked: false,
    muted: false,
    solo: false,
    volume: 0,
  } as TimelineTrack
}

describe('resolveWorkspaceVisibleTracks', () => {
  it('shows only audio lanes in Master when dedicated audio exists', () => {
    const tracks = [track('video', 'video'), track('beat', 'audio'), track('tag', 'audio')]

    expect(resolveWorkspaceVisibleTracks(tracks, 'master').map((entry) => entry.id)).toEqual([
      'beat',
      'tag',
    ])
  })

  it('falls back to the full timeline in Master when a legacy project has no audio lane', () => {
    const tracks = [track('video-1', 'video'), track('video-2', 'video')]

    expect(resolveWorkspaceVisibleTracks(tracks, 'master')).toEqual(tracks)
  })

  it('does not filter normal editing workspaces', () => {
    const tracks = [track('video', 'video'), track('beat', 'audio')]

    expect(resolveWorkspaceVisibleTracks(tracks, 'edit')).toEqual(tracks)
    expect(resolveWorkspaceVisibleTracks(tracks, 'beat')).toEqual(tracks)
  })
})
