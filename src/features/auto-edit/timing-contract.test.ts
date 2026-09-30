// @vitest-environment node

import { describe, expect, it } from 'vite-plus/test'
import type { BeatvideoMusicAnalysis, MusicMap } from '@/types/beatvideo'
import type { AudioItem, TimelineTrack } from '@/types/timeline'
import {
  resolveBeatvideoTimelineGrid,
  resolveBeatvideoTimelineMarkers,
  resolveBeatvideoTimelineSnapFrames,
} from './deps/freecut-contract'
import { buildEditPlanTimelineDraft, type ResolvedEditSource } from './freecutTimeline'
import { createEditPlan, offsetEditPlanTimeline } from './planner'
import type { ClipMap } from './types'

function beatAnalysis(): BeatvideoMusicAnalysis {
  const beats = Array.from({ length: 17 }, (_, index) => ({
    time: 0.5 + index * 0.5,
    index,
    downbeat: index % 4 === 0,
    strength: index % 4 === 0 ? 1 : 0.65,
  }))

  return {
    version: 2,
    mediaId: 'beat-media',
    analyzedAt: 1,
    detectedBarOneTime: 0.5,
    barOneTime: 0.5,
    barOneVerified: true,
    bpmOverride: null,
    gridMode: 'detected',
    correctionAnchors: [],
    musicMap: {
      duration: 9,
      bpm: 120,
      beatsPerBar: 4,
      beats,
      sections: [
        {
          id: 'body',
          start: 0,
          end: 9,
          kind: 'verse',
          energy: 0.55,
          confidence: 0.9,
        },
      ],
    },
  }
}

function beatPlacement(): AudioItem {
  return {
    id: 'beat-item',
    type: 'audio',
    trackId: 'beat-track',
    from: 47,
    durationInFrames: 180,
    label: 'beat.mp3',
    mediaId: 'beat-media',
    src: 'blob:beat',
    sourceStart: 15,
    sourceEnd: 213,
    sourceDuration: 270,
    sourceFps: 30,
    speed: 1.1,
  }
}

function relativeMusic(
  grid: NonNullable<ReturnType<typeof resolveBeatvideoTimelineGrid>>,
  fps: number,
): { timelineStart: number; music: MusicMap } {
  const timelineStart = grid.placement.from / fps
  const timelineDuration = grid.placement.durationInFrames / fps
  const rangeEnd = timelineStart + timelineDuration

  return {
    timelineStart,
    music: {
      ...grid.grid,
      duration: timelineDuration,
      beats: grid.grid.beats
        .filter(
          (beat) =>
            beat.time >= timelineStart - 1e-6 &&
            beat.time <= rangeEnd + 1e-6,
        )
        .map((beat) => ({ ...beat, time: Math.max(0, beat.time - timelineStart) })),
      sections: grid.grid.sections
        .filter(
          (section) =>
            section.end > timelineStart + 1e-6 &&
            section.start < rangeEnd - 1e-6,
        )
        .map((section) => ({
          ...section,
          start: Math.max(0, section.start - timelineStart),
          end: Math.min(timelineDuration, section.end - timelineStart),
        }))
        .filter((section) => section.end > section.start + 1e-6),
    },
  }
}

function clipMap(): ClipMap {
  return {
    sources: [
      {
        id: 'footage-source',
        name: 'footage.mp4',
        duration: 20,
        shots: [
          {
            id: 'shot-1',
            sourceId: 'footage-source',
            start: 0,
            end: 20,
            motion: 0.5,
            quality: 0.95,
            boundaryKind: 'source-start',
            boundaryConfidence: 1,
          },
        ],
      },
    ],
  }
}

function videoTrack(): TimelineTrack {
  return {
    id: 'video-track',
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
  }
}

function source(): ResolvedEditSource {
  return {
    sourceId: 'footage-source',
    mediaId: 'footage-media',
    blobUrl: 'blob:footage',
    media: {
      duration: 20,
      fps: 30,
      width: 1920,
      height: 1080,
      mimeType: 'video/mp4',
      fileName: 'footage.mp4',
    },
  }
}

describe('Beatvideo canonical timing contract', () => {
  it('maps visible beat markers, snap targets and materialized Auto Arrange cuts to identical frames', () => {
    const fps = 30
    const analysis = beatAnalysis()
    const placement = beatPlacement()
    const timelineGrid = resolveBeatvideoTimelineGrid(analysis, [placement], fps)
    expect(timelineGrid).not.toBeNull()

    const visibleFrames = resolveBeatvideoTimelineMarkers(timelineGrid!, fps, {
      resolution: 'beat',
      pixelsPerSecond: 140,
    }).markers.map((marker) => marker.frame)
    const snapFrames = resolveBeatvideoTimelineSnapFrames(
      analysis,
      [placement],
      fps,
      {
        resolution: 'beat',
        pixelsPerSecond: 140,
      },
    )
    expect(visibleFrames).toEqual(snapFrames)

    const relative = relativeMusic(timelineGrid!, fps)
    const relativePlan = createEditPlan(relative.music, clipMap(), {
      mode: 'auto',
      pace: 'balanced',
      transitionProfile: 'clean',
      seed: 1,
    })
    const plan = offsetEditPlanTimeline(relativePlan, relative.timelineStart)
    const draft = buildEditPlanTimelineDraft(plan, [source()], {
      projectFps: fps,
      canvasWidth: 1920,
      canvasHeight: 1080,
      existingTracks: [videoTrack()],
      existingItems: [],
    })

    const markerFrameSet = new Set(visibleFrames)
    const generatedInternalCutFrames = draft.items
      .slice(1)
      .map((item) => item.from)

    expect(generatedInternalCutFrames.length).toBeGreaterThan(0)
    expect(
      generatedInternalCutFrames.every((frame) => markerFrameSet.has(frame)),
    ).toBe(true)

    for (const frame of generatedInternalCutFrames) {
      expect(snapFrames).toContain(frame)
    }
  })
})
