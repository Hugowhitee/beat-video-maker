import { describe, expect, it } from 'vite-plus/test'
import type { TimelineTrack } from '@/types/timeline'
import {
  resolveCompactProducerTracks,
  resolveProducerTrackLayout,
  resolveWorkspaceVisibleTracks,
} from './workspace-visible-tracks'

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

describe('resolveProducerTrackLayout', () => {
  it('keeps Media first and Beat directly beneath it while blank generic lanes stay hidden', () => {
    const video = { ...track('video', 'video'), name: 'V1', order: 0 }
    const genericAudio = { ...track('audio', 'audio'), name: 'A1', order: 1 }
    const beat = { ...track('beat', 'audio'), name: 'Beat', order: 5 }
    const tags = { ...track('tags', 'audio'), name: 'Producer tags', order: 6 }

    const collapsed = resolveProducerTrackLayout(
      [genericAudio, beat, tags, video],
      { video: [{}], beat: [{}], tags: [{}] },
      false,
    )
    expect(collapsed.visibleTracks.map((entry) => entry.id)).toEqual(['video', 'beat'])
    expect(collapsed.extraTracks.map((entry) => entry.id)).toEqual(['tags'])

    const expanded = resolveProducerTrackLayout(
      [genericAudio, beat, tags, video],
      { video: [{}], beat: [{}], tags: [{}] },
      true,
    )
    expect(expanded.visibleTracks.map((entry) => entry.id)).toEqual([
      'video',
      'beat',
      'tags',
    ])
  })

  it('groups real overlays and auxiliary audio as extras instead of permanent empty lanes', () => {
    const media = { ...track('media', 'video'), name: 'V1', order: 0 }
    const overlay = { ...track('overlay', 'video'), name: 'V2', order: 1 }
    const blankAudio = { ...track('blank-audio', 'audio'), name: 'A1', order: 2 }
    const beat = { ...track('beat', 'audio'), name: 'Beat', order: 3 }
    const auxAudio = { ...track('aux', 'audio'), name: 'A2', order: 4 }

    const layout = resolveProducerTrackLayout(
      [media, overlay, blankAudio, beat, auxAudio],
      { media: [{}], overlay: [{}], beat: [{}], aux: [{}] },
      true,
    )

    expect(layout.visibleTracks.map((entry) => entry.id)).toEqual([
      'media',
      'beat',
      'overlay',
      'aux',
    ])
    expect(layout.extraTracks.map((entry) => entry.id)).toEqual(['overlay', 'aux'])
  })

  it('keeps only the primary Media drop lane when a new producer project is empty', () => {
    const tracks = [
      { ...track('video', 'video'), name: 'V1' },
      { ...track('audio', 'audio'), name: 'A1' },
    ]

    expect(
      resolveProducerTrackLayout(tracks, {}, false).visibleTracks.map((entry) => entry.id),
    ).toEqual(['video'])
    expect(resolveCompactProducerTracks(tracks, {}).map((entry) => entry.id)).toEqual(['video'])
  })
})
