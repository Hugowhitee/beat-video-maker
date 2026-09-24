import { describe, expect, it } from 'vite-plus/test'
import type { BeatvideoMusicAnalysis } from '@/types/beatvideo'
import { getBeatvideoGridMode, resolveBeatvideoMusicGrid } from './music-grid'

function fixture(): BeatvideoMusicAnalysis {
  return {
    version: 2,
    mediaId: 'beat',
    analyzedAt: 1,
    detectedBarOneTime: 1,
    barOneTime: 1,
    barOneVerified: false,
    bpmOverride: null,
    gridMode: 'detected',
    correctionAnchors: [],
    musicMap: {
      duration: 5,
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
      ],
    },
  }
}

describe('resolveBeatvideoMusicGrid', () => {
  it('keeps detected evidence unchanged until the user corrects it', () => {
    const analysis = fixture()
    expect(resolveBeatvideoMusicGrid(analysis)).toBe(analysis.musicMap)
  })

  it('shifts every detected beat by the source-domain bar-one correction', () => {
    const analysis = fixture()
    analysis.barOneTime = 1.25
    analysis.barOneVerified = true

    const grid = resolveBeatvideoMusicGrid(analysis)
    expect(grid.beats.map((beat) => beat.time)).toEqual([0.75, 1.25, 1.75, 2.25, 2.75, 3.25])
    expect(grid.beats.find((beat) => beat.downbeat)?.time).toBe(1.25)
  })

  it('warps detected timing piecewise between DJ-style correction anchors', () => {
    const analysis = fixture()
    analysis.correctionAnchors = [
      { id: 'a', sourceTime: 1.5, correctedTime: 1.6 },
      { id: 'b', sourceTime: 2.5, correctedTime: 2.8 },
    ]

    const grid = resolveBeatvideoMusicGrid(analysis)
    expect(grid.beats.map((beat) => beat.time)).toEqual([0.6, 1.1, 1.6, 2.2, 2.8, 3.3])
    expect(grid.beats.map((beat) => beat.index)).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('rebuilds an even grid only when fixed BPM mode is explicit', () => {
    const analysis = fixture()
    analysis.gridMode = 'fixed'
    analysis.barOneTime = 1
    analysis.barOneVerified = true
    analysis.bpmOverride = 100

    const grid = resolveBeatvideoMusicGrid(analysis)
    expect(grid.bpm).toBe(100)
    expect(grid.beats.some((beat) => beat.downbeat && Math.abs(beat.time - 1) < 1e-6)).toBe(true)

    const aroundBarOne = grid.beats.filter((beat) => beat.time >= 1).slice(0, 3)
    expect(aroundBarOne[1]!.time - aroundBarOne[0]!.time).toBeCloseTo(0.6, 6)
  })

  it('keeps v1 BPM overrides in fixed mode for backwards compatibility', () => {
    const analysis = fixture()
    analysis.version = 1
    analysis.gridMode = undefined
    analysis.bpmOverride = 100

    expect(getBeatvideoGridMode(analysis)).toBe('fixed')
    expect(resolveBeatvideoMusicGrid(analysis).bpm).toBe(100)
  })

  it('does not flatten detected timing when a v2 analysis stays in detected mode', () => {
    const analysis = fixture()
    analysis.bpmOverride = 100
    analysis.gridMode = 'detected'

    expect(resolveBeatvideoMusicGrid(analysis)).toBe(analysis.musicMap)
  })
})
