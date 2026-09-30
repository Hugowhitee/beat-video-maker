import { describe, expect, it } from 'vite-plus/test'
import {
  resolveBeatGridFocusZoomLevel,
  resolveBeatGridRegionalResiduals,
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

  it('keeps regional onset residuals small when start, middle and end stay aligned', () => {
    const beats = Array.from({ length: 120 }, (_, index) => ({
      time: 0.4 + index * 0.5,
      index,
      downbeat: index % 4 === 0,
      strength: 0.8,
    }))
    const transients = beats.map((beat, index) => ({
      time: beat.time + (index % 3 === 0 ? 0.008 : index % 3 === 1 ? -0.006 : 0.003),
      index,
      strength: 0.9,
      low: 0.8,
      mid: 0.3,
      high: 0.1,
    }))

    const residuals = resolveBeatGridRegionalResiduals({
      duration: 61,
      bpm: 120,
      beats,
      transients,
    })

    expect(residuals).not.toBeNull()
    expect(residuals!.maxMs).toBeLessThan(10)
  })

  it('recommends review when onset evidence drifts late by the end of the song', () => {
    const beats = Array.from({ length: 180 }, (_, index) => ({
      time: 0.4 + index * 0.5,
      index,
      downbeat: index % 4 === 0,
      strength: 0.8,
    }))
    const transients = beats.map((beat, index) => {
      const progress = index / Math.max(1, beats.length - 1)
      return {
        time: beat.time + progress * 0.065,
        index,
        strength: 0.92,
        low: 0.86,
        mid: 0.22,
        high: 0.08,
      }
    })

    expect(
      resolveBeatGridReviewState({
        version: 2,
        mediaId: 'beat-drift',
        analyzedAt: 1,
        musicMap: {
          duration: 91,
          bpm: 120,
          beatsPerBar: 4,
          beats,
          transients,
          sections: [],
          gridFit: {
            mode: 'fixed',
            confidence: 0.9,
            bpm: 120,
            anchorTime: 0.4,
            medianErrorMs: 12,
            phaseShiftMs: 0,
            onsetSupport: 0.8,
          },
        },
        detectedBarOneTime: 0.4,
        barOneTime: 0.4,
        barOneVerified: false,
        bpmOverride: null,
        gridMode: 'detected',
        correctionAnchors: [],
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
