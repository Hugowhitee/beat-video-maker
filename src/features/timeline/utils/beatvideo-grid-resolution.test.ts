import { describe, expect, it } from 'vite-plus/test'
import type { MusicBeat } from '@/types/beatvideo'
import { resolveBeatGridMarkers } from './beatvideo-grid-resolution'

function beats(count = 32): MusicBeat[] {
  return Array.from({ length: count }, (_, index) => ({
    time: index * 0.5,
    index,
    downbeat: index % 4 === 0,
    strength: index % 4 === 0 ? 1 : 0.6,
  }))
}

describe('Beatvideo grid resolution', () => {
  it('uses every beat in Beat mode', () => {
    const result = resolveBeatGridMarkers({
      beats: beats(16),
      beatsPerBar: 4,
      barOneTime: 0,
      resolution: 'beat',
      pixelsPerSecond: 20,
    })
    expect(result.markers).toHaveLength(16)
  })

  it('anchors 2-bar and 4-bar grids to Bar 1', () => {
    const source = beats(40)
    const twoBars = resolveBeatGridMarkers({
      beats: source,
      beatsPerBar: 4,
      barOneTime: 2,
      resolution: '2-bars',
      pixelsPerSecond: 100,
    })
    const fourBars = resolveBeatGridMarkers({
      beats: source,
      beatsPerBar: 4,
      barOneTime: 2,
      resolution: '4-bars',
      pixelsPerSecond: 100,
    })

    expect(twoBars.markers.map(({ beat }) => beat.index)).toEqual([4, 12, 20, 28, 36])
    expect(fourBars.markers.map(({ beat }) => beat.index)).toEqual([4, 20, 36])
    expect(twoBars.markers.find(({ isBarOne }) => isBarOne)?.barNumber).toBe(1)
  })

  it('thins Auto mode when zoomed out but reveals beats when close', () => {
    const source = beats(32)
    const far = resolveBeatGridMarkers({
      beats: source,
      beatsPerBar: 4,
      barOneTime: 0,
      resolution: 'auto',
      pixelsPerSecond: 10,
    })
    const close = resolveBeatGridMarkers({
      beats: source,
      beatsPerBar: 4,
      barOneTime: 0,
      resolution: 'auto',
      pixelsPerSecond: 100,
    })

    expect(far.markers.length).toBeLessThan(close.markers.length)
    expect(close.markers.some(({ beat }) => !beat.downbeat)).toBe(true)
  })
})
