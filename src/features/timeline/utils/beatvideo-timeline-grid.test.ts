import { describe, expect, it } from 'vite-plus/test'
import type { BeatvideoMusicAnalysis } from '@/types/beatvideo'
import type { AudioItem, VideoItem } from '@/types/timeline'
import {
  findBeatvideoMusicPlacement,
  normalizeBeatvideoAnalysisForPlacement,
  resolveBeatvideoTimelineGrid,
  resolveBeatvideoTimelineMarkers,
  resolveBeatvideoTimelineSnapFrames,
} from './beatvideo-timeline-grid'

function analysis(overrides: Partial<BeatvideoMusicAnalysis> = {}): BeatvideoMusicAnalysis {
  return {
    version: 2,
    mediaId: 'music',
    analyzedAt: 1,
    detectedBarOneTime: 1,
    barOneTime: 1,
    barOneVerified: false,
    bpmOverride: null,
    gridMode: 'detected',
    correctionAnchors: [],
    musicMap: {
      duration: 6,
      bpm: 120,
      beatsPerBar: 4,
      sections: [],
      beats: [
        { time: 0.5, index: 0, downbeat: false, strength: 0.5 },
        { time: 1, index: 1, downbeat: true, strength: 1 },
        { time: 1.5, index: 2, downbeat: false, strength: 0.5 },
        { time: 2, index: 3, downbeat: false, strength: 0.5 },
        { time: 2.5, index: 4, downbeat: false, strength: 0.5 },
        { time: 3, index: 5, downbeat: true, strength: 1 },
        { time: 3.5, index: 6, downbeat: false, strength: 0.5 },
      ],
    },
    ...overrides,
  }
}

function audio(overrides: Partial<AudioItem> = {}): AudioItem {
  return {
    id: 'audio',
    type: 'audio',
    trackId: 'audio-1',
    from: 0,
    durationInFrames: 180,
    label: 'music.mp3',
    mediaId: 'music',
    src: 'blob:music',
    sourceStart: 0,
    sourceEnd: 180,
    sourceDuration: 180,
    sourceFps: 30,
    speed: 1,
    ...overrides,
  }
}

function video(overrides: Partial<VideoItem> = {}): VideoItem {
  return {
    id: 'video',
    type: 'video',
    trackId: 'video-1',
    from: 0,
    durationInFrames: 180,
    label: 'music.mp4',
    mediaId: 'music',
    src: 'blob:music-video',
    sourceStart: 0,
    sourceEnd: 180,
    sourceDuration: 180,
    sourceFps: 30,
    speed: 1,
    ...overrides,
  }
}

describe('Beatvideo timeline musical grid', () => {
  it('moves every beat with the placed audio clip', () => {
    const result = resolveBeatvideoTimelineGrid(analysis(), [audio({ from: 90 })], 30)

    expect(result).not.toBeNull()
    expect(result!.grid.beats.slice(0, 3).map((beat) => beat.time)).toEqual([3.5, 4, 4.5])
    expect(result!.barOneTimelineTime).toBe(4)
  })

  it('uses the mapped musical beats as edit snap points', () => {
    expect(
      resolveBeatvideoTimelineSnapFrames(
        analysis(),
        [audio({ from: 90 })],
        30,
      ).slice(0, 3),
    ).toEqual([105, 120, 135])
  })

  it('uses the exact same rounded frames for visible markers and musical snap targets', () => {
    const placement = audio({
      from: 37,
      durationInFrames: 96,
      sourceStart: 15,
      sourceEnd: 135,
      speed: 1.25,
    })
    const timelineGrid = resolveBeatvideoTimelineGrid(analysis(), [placement], 30)

    expect(timelineGrid).not.toBeNull()
    const visible = resolveBeatvideoTimelineMarkers(timelineGrid!, 30, {
      resolution: 'beat',
      pixelsPerSecond: 137,
    }).markers
    const snap = resolveBeatvideoTimelineSnapFrames(analysis(), [placement], 30, {
      resolution: 'beat',
      pixelsPerSecond: 137,
    })

    expect(visible.map((marker) => marker.frame)).toEqual(snap)
    expect(
      visible.every((marker) => Math.abs(marker.timelineTime * 30 - marker.frame) < 1e-9),
    ).toBe(true)
  })

  it('filters snap points to the selected visible bar resolution', () => {
    const dense = analysis()
    dense.musicMap.duration = 12
    dense.musicMap.beats = Array.from({ length: 24 }, (_, index) => ({
      time: index * 0.5,
      index,
      downbeat: index % 4 === 0,
      strength: index % 4 === 0 ? 1 : 0.5,
    }))
    dense.detectedBarOneTime = 2
    dense.barOneTime = 2

    const placement = audio({
      durationInFrames: 360,
      sourceEnd: 360,
      sourceDuration: 360,
    })

    const frames = resolveBeatvideoTimelineSnapFrames(dense, [placement], 30, {
      resolution: '2-bars',
      pixelsPerSecond: 100,
    })

    expect(frames).toEqual([60, 180, 300])
  })

  it('uses source trim bounds so the visible grid stays locked to the waveform', () => {
    const result = resolveBeatvideoTimelineGrid(
      analysis(),
      [
        audio({
          from: 60,
          durationInFrames: 60,
          sourceStart: 45,
          sourceEnd: 105,
        }),
      ],
      30,
    )

    expect(result).not.toBeNull()
    expect(result!.grid.beats.map((beat) => beat.index)).toEqual([2, 3, 4, 5, 6])
    expect(result!.grid.beats.map((beat) => beat.time)).toEqual([2, 2.5, 3, 3.5, 4])
  })

  it('retimes beat spacing with the clip playback speed', () => {
    const result = resolveBeatvideoTimelineGrid(
      analysis(),
      [
        audio({
          durationInFrames: 90,
          sourceEnd: 180,
          speed: 2,
        }),
      ],
      30,
    )

    expect(result).not.toBeNull()
    expect(result!.grid.bpm).toBe(240)
    expect(result!.grid.beats.slice(0, 3).map((beat) => beat.time)).toEqual([0.25, 0.5, 0.75])
  })

  it('maps spectral transients with the same trim, speed, and reverse rules as the waveform', () => {
    const withTransients = analysis()
    withTransients.musicMap.transients = [
      { time: 1, index: 0, strength: 0.9, low: 0.8, mid: 0.2, high: 0.1 },
      { time: 3, index: 1, strength: 0.8, low: 0.2, mid: 0.7, high: 0.3 },
      { time: 5, index: 2, strength: 0.7, low: 0.1, mid: 0.2, high: 0.9 },
    ]

    const result = resolveBeatvideoTimelineGrid(
      withTransients,
      [
        audio({
          from: 60,
          durationInFrames: 60,
          sourceStart: 30,
          sourceEnd: 150,
          speed: 2,
          isReversed: true,
        }),
      ],
      30,
    )

    expect(result).not.toBeNull()
    expect(result!.grid.transients?.map((hit) => hit.index)).toEqual([2, 1, 0])
    expect(result!.grid.transients?.map((hit) => hit.time)).toEqual([2, 3, 4])
  })

  it('keeps corrected and fixed grids on deterministic timeline frames', () => {
    const corrected = analysis({
      correctionAnchors: [
        { id: 'late-fix', sourceTime: 2, correctedTime: 2.2 },
      ],
    })
    const correctedGrid = resolveBeatvideoTimelineGrid(
      corrected,
      [audio({ from: 30 })],
      30,
    )

    expect(correctedGrid).not.toBeNull()
    expect(
      correctedGrid!.grid.beats.find((beat) => beat.index === 3)?.time,
    ).toBeCloseTo(3.2, 8)

    const fixed = analysis({
      gridMode: 'fixed',
      bpmOverride: 100,
      barOneTime: 1,
      barOneVerified: true,
    })
    const fixedGrid = resolveBeatvideoTimelineGrid(
      fixed,
      [audio({ from: 45 })],
      30,
    )

    expect(fixedGrid).not.toBeNull()
    expect(fixedGrid!.barOneTimelineTime).toBeCloseTo(2.5, 8)
    expect(
      fixedGrid!.grid.beats.some(
        (beat) => beat.downbeat && Math.abs(beat.time - 2.5) < 1e-8,
      ),
    ).toBe(true)
  })

  it('prefers an audio companion over the matching video placement', () => {
    const a = audio({ id: 'audio-companion', from: 30 })
    const v = video({ id: 'video-companion', from: 0 })

    expect(findBeatvideoMusicPlacement([v, a], analysis(), 30)?.id).toBe('audio-companion')
  })

  it('prefers the placement that contains the detected bar-one source beat', () => {
    const early = audio({
      id: 'early',
      from: 0,
      durationInFrames: 15,
      sourceStart: 0,
      sourceEnd: 15,
    })
    const barOneClip = audio({
      id: 'bar-one',
      from: 120,
      durationInFrames: 60,
      sourceStart: 30,
      sourceEnd: 90,
    })

    expect(findBeatvideoMusicPlacement([early, barOneClip], analysis(), 30)?.id).toBe('bar-one')
  })

  it('upgrades a verified v1 absolute timeline bar-one into source time', () => {
    const legacy = analysis({
      version: 1,
      detectedBarOneTime: 1,
      barOneTime: 5,
      barOneVerified: true,
      gridMode: undefined,
      correctionAnchors: undefined,
    })
    const placement = audio({
      from: 120,
      durationInFrames: 90,
      sourceStart: 30,
      sourceEnd: 120,
    })

    const normalized = normalizeBeatvideoAnalysisForPlacement(legacy, placement, 30)

    expect(normalized.version).toBe(2)
    expect(normalized.barOneTime).toBe(2)
    expect(normalized.barOneVerified).toBe(true)
    expect(normalized.gridMode).toBe('detected')
    expect(normalized.correctionAnchors).toEqual([])
  })

  it('drops a stale v1 manual bar-one when its old timeline point is outside the music clip', () => {
    const legacy = analysis({
      version: 1,
      detectedBarOneTime: 1,
      barOneTime: 9,
      barOneVerified: true,
      gridMode: undefined,
      correctionAnchors: undefined,
    })
    const placement = audio({ from: 0, durationInFrames: 90 })

    const normalized = normalizeBeatvideoAnalysisForPlacement(legacy, placement, 30)

    expect(normalized.barOneTime).toBe(1)
    expect(normalized.barOneVerified).toBe(false)
  })
})
