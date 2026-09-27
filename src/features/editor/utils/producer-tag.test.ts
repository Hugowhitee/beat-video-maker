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

  it('supports a later first bar without changing the repeat interval', () => {
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
        firstBar: 3,
        startFrame: 0,
        endFrame: 4000,
        tagDurationInFrames: 30,
      }),
    ).toEqual([120, 1080, 2040])
  })

  it('aligns an internal tag anchor to the requested musical bar', () => {
    expect(
      resolveProducerTagRepeatFrames({
        beats: [
          { time: 4, index: 0, downbeat: true, strength: 1 },
          { time: 8, index: 4, downbeat: true, strength: 1 },
        ],
        fps: 30,
        everyBars: 1,
        anchorFrameOffset: 45,
        startFrame: 0,
        endFrame: 400,
        tagDurationInFrames: 90,
      }),
    ).toEqual([75, 195])
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

  it('supports custom bar intervals, not only the suggested presets', () => {
    const beats = Array.from({ length: 20 }, (_, index) => ({
      time: index,
      index: index * 4,
      downbeat: true,
      strength: 1,
    }))

    expect(
      resolveProducerTagRepeatFrames({
        beats,
        fps: 30,
        everyBars: 5,
        firstBar: 2,
        startFrame: 0,
        endFrame: 1000,
        tagDurationInFrames: 15,
      }),
    ).toEqual([30, 180, 330, 480])
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
})
