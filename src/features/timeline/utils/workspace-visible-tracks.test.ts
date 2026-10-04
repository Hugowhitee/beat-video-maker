import { describe, expect, it } from 'vite-plus/test'
import type { TimelineTrack } from '@/types/timeline'
import {
  resolveCompactProducerTracks,
  resolveProducerTrackLayout,
  resolveWorkspaceVisibleTracks,
  shouldExposeProducerExtras,
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
  it('keeps footage as Media even when multiple text layers precede it', () => {
    const title = { ...track('title', 'video'), name: 'Cover title', order: -2 }
    const subtitle = { ...track('subtitle', 'video'), name: 'Cover subtitle', order: -1 }
    const cover = { ...track('cover', 'video'), name: 'Cover', order: 0 }
    const beat = { ...track('beat', 'audio'), name: 'Beat', order: 1 }
    const items = {
      title: [{ type: 'text', text: 'GLOCK IT' }],
      subtitle: [{ type: 'text', text: 'KEVIN TYPE BEAT' }],
      cover: [{ type: 'image' }],
      beat: [{ type: 'audio' }],
    }
    const layout = resolveProducerTrackLayout([title, subtitle, cover, beat], items, true)
    expect(layout.primaryMediaTrackId).toBe('cover')
    expect(layout.visibleTracks.map((entry) => entry.id)).toEqual([
      'cover', 'beat', 'title', 'subtitle',
    ])
    expect(shouldExposeProducerExtras('edit', 'cover', layout.extraTracks, items)).toBe(true)
    expect(shouldExposeProducerExtras('color', null, layout.extraTracks, items)).toBe(true)
    expect(shouldExposeProducerExtras('beat', 'cover', layout.extraTracks, items)).toBe(false)
  })

  it('does not turn empty utility lanes into visible layers', () => {
    const generic = { ...track('generic', 'video'), name: 'V2' }
    const tag = { ...track('tag', 'audio'), name: 'Producer tags' }
    const layout = resolveProducerTrackLayout([generic, tag], {}, false)
    expect(shouldExposeProducerExtras('edit', null, layout.extraTracks, {})).toBe(false)
  })

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

  it('does not let Color adjustment/controller utility lanes become Media or Extras', () => {
    const grade = { ...track('grade', 'video'), name: 'Global grade', order: -2 }
    const controller = { ...track('controller', 'video'), name: 'Color controller', order: -1 }
    const media = { ...track('media', 'video'), name: 'V1', order: 0 }
    const beat = { ...track('beat', 'audio'), name: 'Beat', order: 1 }

    const layout = resolveProducerTrackLayout(
      [grade, controller, media, beat],
      {
        grade: [{ type: 'adjustment' }],
        controller: [{ type: 'controller' }],
        media: [{ type: 'video' }],
        beat: [{ type: 'audio' }],
      },
      true,
    )

    expect(layout.primaryMediaTrackId).toBe('media')
    expect(layout.visibleTracks.map((entry) => entry.id)).toEqual(['media', 'beat'])
    expect(layout.extraTracks).toEqual([])
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
