import { describe, expect, it } from 'vite-plus/test'
import {
  resolveBeatGridFocusZoomLevel,
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

  it('reports signed playhead offset from the closest visible beat', () => {
    const beats = [{ time: 1 }, { time: 1.5 }, { time: 2 }]
    expect(resolveNearestBeatOffsetMs(beats, 1.512)).toBeCloseTo(12, 5)
    expect(resolveNearestBeatOffsetMs(beats, 1.493)).toBeCloseTo(-7, 5)
  })
})
