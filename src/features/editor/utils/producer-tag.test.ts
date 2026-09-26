// @vitest-environment node

import { describe, expect, it } from 'vite-plus/test'
import { resolveProducerTagRepeatFrames } from './producer-tag'

describe('resolveProducerTagRepeatFrames', () => {
  it('places one tag every requested number of musical bars', () => {
    const beats = Array.from({ length: 40 }, (_, index) => ({
      time: index * 2,
      index: index * 4,
      downbeat: true,
      strength: 1,
    }))

    expect(
      resolveProducerTagRepeatFrames({
        beats,
        fps: 30,
        everyBars: 16,
        startFrame: 0,
        endFrame: 3000,
        tagDurationInFrames: 30,
      }),
    ).toEqual([0, 960, 1920])
  })

  it('keeps the full tag inside the beat placement', () => {
    expect(
      resolveProducerTagRepeatFrames({
        beats: [
          { time: 0, index: 0, downbeat: true, strength: 1 },
          { time: 10, index: 4, downbeat: true, strength: 1 },
          { time: 20, index: 8, downbeat: true, strength: 1 },
        ],
        fps: 30,
        everyBars: 1,
        startFrame: 0,
        endFrame: 630,
        tagDurationInFrames: 60,
      }),
    ).toEqual([0, 300])
  })
})


  it('does not place a repeated watermark when the full tag cannot fit', () => {
    expect(
      resolveProducerTagRepeatFrames({
        beats: [{ time: 0, index: 0, downbeat: true, strength: 1 }],
        fps: 30,
        everyBars: 1,
        startFrame: 0,
        endFrame: 30,
        tagDurationInFrames: 60,
      }),
    ).toEqual([])
  })
