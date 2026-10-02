import { describe, expect, it } from 'vitest'
import type { TimelineItem, TimelineTrack } from '@/types/timeline'
import type { EditPlan } from './types'
import {
  buildEditPlanSourcePatches,
  buildEditPlanTimelineDraft,
  type ResolvedEditSource,
} from './timeline-materialization'

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
  it('maps Beatvideo seconds onto canonical editor timeline/source frames', () => {
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
      embeddedAudioMuted: true,
    })
    expect(first?.transform?.width).toBe(1920)
    expect(first?.transform?.height).toBe(1080)

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

  it('maps film-gate accents onto the Film Gate Slip renderer', () => {
    const plan = makePlan()
    plan.transitions[0] = {
      ...plan.transitions[0]!,
      kind: 'film-gate',
    }

    const draft = buildEditPlanTimelineDraft(plan, [makeSource()], {
      projectFps: 30,
      canvasWidth: 1920,
      canvasHeight: 1080,
      existingTracks: [makeTrack()],
      existingItems: [],
    })

    expect(draft.transitions[0]?.presentation).toBe('filmGateSlip')
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

  it('repairs only source fields so generated styling and motion stay intact', () => {
    const previousPlan = makePlan()
    const nextPlan: EditPlan = {
      ...previousPlan,
      segments: previousPlan.segments.map((segment) =>
        segment.id === 'segment-1'
          ? {
              ...segment,
              sourceId: 'source-b',
              shotId: 'shot-b',
              sourceStart: 4,
              sourceEnd: 5,
              manualOverride: true,
            }
          : segment,
      ),
    }
    const existing = {
      id: 'generated-1',
      type: 'video',
      trackId: 'track-v1',
      from: 0,
      durationInFrames: 30,
      label: 'old.mp4',
      src: 'blob:old',
      mediaId: 'media-old',
      sourceStart: 30,
      sourceEnd: 60,
      sourceDuration: 300,
      sourceFps: 30,
      transform: { x: 42, y: 24, width: 1280, height: 720, rotation: 2, opacity: 0.8 },
      effects: [
        {
          id: 'fx-1',
          enabled: true,
          effect: { type: 'gpu-effect', gpuEffectType: 'gpu-grain', params: {} },
        },
      ],
      motionModifiers: [{ id: 'motion-1', type: 'drift', enabled: true, amplitude: 0.5 }],
      embeddedAudioMuted: true,
    } as unknown as TimelineItem

    const patches = buildEditPlanSourcePatches(
      previousPlan,
      nextPlan,
      [
        makeSource({
          sourceId: 'source-b',
          mediaId: 'media-b',
          blobUrl: 'blob:media-b',
          media: {
            duration: 20,
            fps: 60,
            width: 1280,
            height: 720,
            mimeType: 'video/mp4',
            fileName: 'replacement.mp4',
          },
        }),
      ],
      { 'segment-1': existing.id },
      [existing],
    )

    expect(patches).toHaveLength(1)
    expect(patches[0]).toMatchObject({
      itemId: existing.id,
      segmentId: 'segment-1',
      updates: {
        mediaId: 'media-b',
        src: 'blob:media-b',
        label: 'replacement.mp4',
        sourceStart: 240,
        sourceEnd: 300,
        sourceDuration: 1200,
        sourceFps: 60,
        embeddedAudioMuted: true,
      },
    })
    expect(patches[0]?.updates).not.toHaveProperty('transform')
    expect(patches[0]?.updates).not.toHaveProperty('effects')
    expect(patches[0]?.updates).not.toHaveProperty('motionModifiers')
    expect(patches[0]?.updates).not.toHaveProperty('durationInFrames')
    expect(patches[0]?.updates).not.toHaveProperty('from')
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
