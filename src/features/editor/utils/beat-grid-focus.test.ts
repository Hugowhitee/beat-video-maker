import { describe, expect, it } from 'vite-plus/test'
import {
  resolveBeatGridFocusZoomLevel,
  resolveBeatGridReviewState,
  resolveNearestBeatOffsetMs,
} from './beat-grid-focus'

describe('beat grid focus', () => {
  it('keeps roughly the same beat detail across tempos', () => {
    const slow = resolveBeatGridFocusZoomLevel({
      bpm: 75,
      beats: [0, 0.8, 1.6, 2.4].map((time, index) => ({
        time,
        index,
        downbeat: index === 0,
        strength: 1,
      })),
    })
    const fast = resolveBeatGridFocusZoomLevel({
      bpm: 150,
      beats: [0, 0.4, 0.8, 1.2].map((time, index) => ({
        time,
        index,
        downbeat: index === 0,
        strength: 1,
      })),
    })

    expect(slow).toBeCloseTo(2.75, 2)
    expect(fast).toBeCloseTo(5.5, 2)
  })

  it('keeps manual repair hidden for a healthy automatic 4/4 grid', () => {
    expect(
      resolveBeatGridReviewState({
        version: 2,
        mediaId: 'beat-1',
        analyzedAt: 1,
        musicMap: {
          duration: 120,
          bpm: 95,
          beatsPerBar: 4,
          beats: [{ time: 0.5, index: 0, downbeat: true, strength: 1 }],
          sections: [],
          gridFit: {
            mode: 'fixed',
            confidence: 0.82,
            bpm: 95,
            anchorTime: 0.5,
            medianErrorMs: 18,
            phaseShiftMs: 0,
            onsetSupport: 0.5,
          },
        },
        detectedBarOneTime: 0.5,
        barOneTime: 0.5,
        barOneVerified: false,
        bpmOverride: null,
        gridMode: 'detected',
        correctionAnchors: [],
      }),
    ).toBe('hidden')
  })

  it('recommends waveform review for weak, variable, non-4/4 or missing-downbeat evidence', () => {
    const base = {
      version: 2 as const,
      mediaId: 'beat-1',
      analyzedAt: 1,
      musicMap: {
        duration: 120,
        bpm: 95,
        beatsPerBar: 4,
        beats: [{ time: 0.5, index: 0, downbeat: false, strength: 1 }],
        sections: [],
        gridFit: {
          mode: 'variable' as const,
          confidence: 0.45,
          bpm: 95,
          anchorTime: 0.5,
          medianErrorMs: 48,
          phaseShiftMs: 0,
          onsetSupport: 0.1,
        },
      },
      detectedBarOneTime: null,
      barOneTime: null,
      barOneVerified: false,
      bpmOverride: null,
      gridMode: 'detected' as const,
      correctionAnchors: [],
    }

    expect(resolveBeatGridReviewState(base)).toBe('recommended')
    expect(
      resolveBeatGridReviewState({
        ...base,
        detectedBarOneTime: 0.5,
        musicMap: {
          ...base.musicMap,
          beatsPerBar: 3,
          gridFit: { ...base.musicMap.gridFit, mode: 'fixed', confidence: 0.9, medianErrorMs: 10 },
        },
      }),
    ).toBe('recommended')
  })

  it('keeps repair available after a deliberate manual correction', () => {
    expect(
      resolveBeatGridReviewState({
        version: 2,
        mediaId: 'beat-1',
        analyzedAt: 1,
        musicMap: {
          duration: 120,
          bpm: 95,
          beatsPerBar: 4,
          beats: [{ time: 0.5, index: 0, downbeat: true, strength: 1 }],
          sections: [],
          gridFit: {
            mode: 'fixed',
            confidence: 0.9,
            bpm: 95,
            anchorTime: 0.5,
            medianErrorMs: 10,
            phaseShiftMs: 0,
            onsetSupport: 0.5,
          },
        },
        detectedBarOneTime: 0.5,
        barOneTime: 0.51,
        barOneVerified: true,
        bpmOverride: null,
        gridMode: 'detected',
        correctionAnchors: [],
      }),
    ).toBe('manual')
  })

  it('reports signed playhead offset from the closest visible beat', () => {
    const beats = [{ time: 1 }, { time: 1.5 }, { time: 2 }]
    expect(resolveNearestBeatOffsetMs(beats, 1.512)).toBeCloseTo(12, 5)
    expect(resolveNearestBeatOffsetMs(beats, 1.493)).toBeCloseTo(-7, 5)
  })
})
