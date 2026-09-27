// @vitest-environment node

import { describe, expect, it } from 'vite-plus/test'
import type { AudioItem, TimelineTrack } from '@/types/timeline'
import { resolveTimelineDuckingGain } from './audio-ducking'

function track(id: string, overrides: Partial<TimelineTrack> = {}): TimelineTrack {
  return {
    id,
    name: id,
    kind: 'audio',
    height: 64,
    locked: false,
    visible: true,
    muted: false,
    solo: false,
    order: 0,
    items: [],
    ...overrides,
  }
}

function audio(id: string, trackId: string, from: number, durationInFrames: number): AudioItem {
  return {
    id,
    trackId,
    from,
    durationInFrames,
    label: id,
    src: `blob:${id}`,
  }
}

describe('resolveTimelineDuckingGain', () => {
  it('ducks a targeted beat while a producer tag is active', () => {
    const beat = audio('beat', 'beat-track', 0, 900)
    const tag = {
      ...audio('tag', 'tag-track', 300, 60),
      audioDucking: {
        duckOthersDb: -6,
        attackSec: 0,
        releaseSec: 0,
        targetTrackIds: ['beat-track'],
      },
    }

    expect(
      resolveTimelineDuckingGain({
        frame: 320,
        targetItemId: beat.id,
        items: [beat, tag],
        tracks: [track('beat-track'), track('tag-track')],
        fps: 30,
      }),
    ).toBeCloseTo(Math.pow(10, -6 / 20), 6)
  })

  it('does not duck an untargeted track', () => {
    const beat = audio('beat', 'beat-track', 0, 900)
    const tag = {
      ...audio('tag', 'tag-track', 300, 60),
      audioDucking: {
        duckOthersDb: -6,
        targetTrackIds: ['other-track'],
      },
    }

    expect(
      resolveTimelineDuckingGain({
        frame: 320,
        targetItemId: beat.id,
        items: [beat, tag],
        tracks: [track('beat-track'), track('tag-track')],
        fps: 30,
      }),
    ).toBe(1)
  })

  it('ramps back to unity during release', () => {
    const beat = audio('beat', 'beat-track', 0, 900)
    const tag = {
      ...audio('tag', 'tag-track', 300, 60),
      audioDucking: {
        duckOthersDb: -6,
        attackSec: 0,
        releaseSec: 1,
        targetTrackIds: ['beat-track'],
      },
    }

    const halfRelease = resolveTimelineDuckingGain({
      frame: 375,
      targetItemId: beat.id,
      items: [beat, tag],
      tracks: [track('beat-track'), track('tag-track')],
      fps: 30,
    })

    expect(halfRelease).toBeCloseTo(Math.pow(10, -3 / 20), 6)
  })
})
