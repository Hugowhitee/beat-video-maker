import { describe, expect, it } from 'vitest'
import type { TimelineItem, TimelineTrack } from '@/types/timeline'
import type { EditPlan } from './types'
import {
  buildEditPlanTimelineDraft,
  type ResolvedEditSource,
} from './freecutTimeline'

function makeTrack(overrides: Partial<TimelineTrack> = {}): TimelineTrack {
  return {
    id: 'track-v1',
    name: 'V1',
    kind: 'video',
    height: 80,
    locked: false,
    visible: true,
    muted: false,
    solo: false,
    volume: 0,
    order: 0,
    items: [],
    ...overrides,
  }
}

function makeSource(overrides: Partial<ResolvedEditSource> = {}): ResolvedEditSource {
  return {
    sourceId: 'source-a',
    mediaId: 'media-a',
    blobUrl: 'blob:media-a',
    media: {
      duration: 12,
      fps: 30,
      width: 1920,
      height: 1080,
      mimeType: 'video/mp4',
      fileName: 'source-a.mp4',
    },
    ...overrides,
  }
}

function makePlan(): EditPlan {
  return {
    mode: 'auto',
    duration: 2,
    warnings: [],
    motifs: [],
    segments: [
      {
        id: 'segment-1',
        timelineStart: 0,
        timelineEnd: 1,
        sourceId: 'source-a',
        shotId: 'shot-1',
        sourceStart: 1,
        sourceEnd: 2,
        reason: 'test',
      },
      {
        id: 'segment-2',
        timelineStart: 1,
        timelineEnd: 2,
        sourceId: 'source-a',
        shotId: 'shot-2',
        sourceStart: 3,
        sourceEnd: 4,
        reason: 'test',
      },
    ],
    transitions: [
      {
        id: 'transition-1',
        kind: 'film-burn',
        leftSegmentId: 'segment-1',
        rightSegmentId: 'segment-2',
        cutTime: 1,
        duration: 0.3,
        alignment: 0.5,
        reason: 'drop accent',
      },
    ],
  }
}

describe('buildEditPlanTimelineDraft', () => {
  it('maps Beatvideo seconds onto canonical FreeCut timeline/source frames', () => {
    const draft = buildEditPlanTimelineDraft(makePlan(), [makeSource()], {
      projectFps: 30,
      canvasWidth: 1920,
      canvasHeight: 1080,
      existingTracks: [
        makeTrack(),
        makeTrack({
          id: 'track-a1',
          name: 'A1',
          kind: 'audio',
          order: 1,
        }),
      ],
      existingItems: [],
    })

    expect(draft.targetVideoTrackId).toBe('track-v1')
    expect(draft.items).toHaveLength(2)

    const [first, second] = draft.items
    expect(first).toMatchObject({
      type: 'video',
      trackId: 'track-v1',
      from: 0,
      durationInFrames: 30,
      mediaId: 'media-a',
      sourceStart: 30,
      sourceEnd: 60,
      sourceFps: 30,
    })
    expect(second).toMatchObject({
      type: 'video',
      trackId: 'track-v1',
      from: 30,
      durationInFrames: 30,
      sourceStart: 90,
      sourceEnd: 120,
    })

    expect(draft.transitions).toEqual([
      expect.objectContaining({
        sourceTransitionId: 'transition-1',
        leftItemId: draft.itemIdBySegmentId['segment-1'],
        rightItemId: draft.itemIdBySegmentId['segment-2'],
        durationInFrames: 9,
        alignment: 0.5,
        presentation: 'lightLeakBurn',
      }),
    ])
  })

  it('creates a fresh FreeCut video track instead of overwriting occupied manual work', () => {
    const occupiedItem = {
      id: 'manual-clip',
      type: 'video',
      trackId: 'track-v1',
      from: 0,
      durationInFrames: 60,
      label: 'manual.mp4',
      src: 'blob:manual',
      mediaId: 'manual-media',
      sourceStart: 0,
      sourceEnd: 60,
      sourceDuration: 300,
      sourceFps: 30,
    } as TimelineItem

    const draft = buildEditPlanTimelineDraft(makePlan(), [makeSource()], {
      projectFps: 30,
      canvasWidth: 1920,
      canvasHeight: 1080,
      existingTracks: [makeTrack()],
      existingItems: [occupiedItem],
      preferredVideoTrackId: 'track-v1',
    })

    expect(draft.targetVideoTrackId).not.toBe('track-v1')
    expect(draft.tracks).toHaveLength(2)
    expect(draft.items.every((item) => item.trackId === draft.targetVideoTrackId)).toBe(true)
  })

  it('fails clearly when a planner source has no FreeCut media binding', () => {
    expect(() =>
      buildEditPlanTimelineDraft(makePlan(), [], {
        projectFps: 30,
        canvasWidth: 1920,
        canvasHeight: 1080,
        existingTracks: [makeTrack()],
        existingItems: [],
      }),
    ).toThrow('No editor media binding exists for source "source-a".')
  })
})
