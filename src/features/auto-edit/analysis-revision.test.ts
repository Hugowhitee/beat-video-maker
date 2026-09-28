import { describe, expect, it } from 'vite-plus/test'
import type { BeatvideoMusicAnalysis } from '@/types/beatvideo'
import {
  BEATVIDEO_ANALYSIS_REVISION,
  shouldRefreshBeatvideoAnalysis,
} from './analysis-revision'

function analysis(overrides: Partial<BeatvideoMusicAnalysis> = {}): BeatvideoMusicAnalysis {
  return {
    version: 2,
    mediaId: 'beat',
    analyzedAt: 1,
    musicMap: {
      duration: 16,
      bpm: 95,
      beatsPerBar: 3,
      beats: [],
      sections: [],
    },
    detectedBarOneTime: 0,
    barOneTime: 0,
    barOneVerified: false,
    bpmOverride: null,
    gridMode: 'detected',
    correctionAnchors: [],
    ...overrides,
  }
}

describe('Beatvideo analysis revision', () => {
  it('refreshes untouched detected grids from an older detector revision', () => {
    expect(shouldRefreshBeatvideoAnalysis(analysis())).toBe(true)
  })

  it('does not keep refreshing the current detector revision', () => {
    expect(
      shouldRefreshBeatvideoAnalysis(
        analysis({ analysisRevision: BEATVIDEO_ANALYSIS_REVISION }),
      ),
    ).toBe(false)
  })

  it('never overwrites manual timing work', () => {
    expect(shouldRefreshBeatvideoAnalysis(analysis({ barOneVerified: true }))).toBe(false)
    expect(shouldRefreshBeatvideoAnalysis(analysis({ bpmOverride: 95, gridMode: 'fixed' }))).toBe(false)
    expect(
      shouldRefreshBeatvideoAnalysis(
        analysis({
          correctionAnchors: [{ id: 'a', sourceTime: 1, correctedTime: 1.01 }],
        }),
      ),
    ).toBe(false)
  })
})
