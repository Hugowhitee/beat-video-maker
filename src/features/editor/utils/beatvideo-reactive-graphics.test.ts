import { describe, expect, it } from 'vite-plus/test'
import type { MusicMap } from '@/types/beatvideo'
import { buildBeatvideoReactiveGraphicItems } from './beatvideo-reactive-graphics'

const grid: MusicMap = {
  duration: 8,
  bpm: 120,
  beatsPerBar: 4,
  beats: Array.from({ length: 16 }, (_, index) => ({
    time: index * 0.5,
    index,
    downbeat: index % 4 === 0,
    strength: index % 4 === 0 ? 1 : 0.7,
  })),
  transients: [
    { time: 0.5, index: 0, strength: 0.9, low: 0.95, mid: 0.4, high: 0.2 },
    { time: 1, index: 1, strength: 0.8, low: 0.2, mid: 0.85, high: 0.45 },
    { time: 1.5, index: 2, strength: 0.8, low: 0.15, mid: 0.4, high: 0.9 },
  ],
  sections: [],
}

const base = {
  grid,
  fps: 30,
  from: 0,
  durationInFrames: 240,
  canvasWidth: 1920,
  canvasHeight: 1080,
}

describe('Beatvideo reactive graphics', () => {
  it('creates a downbeat-driven full-frame flash', () => {
    const items = buildBeatvideoReactiveGraphicItems({
      ...base,
      presetId: 'beat-flash',
      trackIds: ['flash'],
    })

    expect(items).toHaveLength(1)
    const item = items[0]!
    const transform = item.transform!
    expect(transform.opacity).toBe(0)
    expect(transform.width).toBe(1920)
    expect(item.audioReactive?.bindings[0]?.driver).toBe('downbeat')
    expect(item.audioReactive?.beats.length).toBeGreaterThan(0)
  })

  it('creates a low-driven outline frame without baking a separate renderer', () => {
    const items = buildBeatvideoReactiveGraphicItems({
      ...base,
      presetId: 'pulse-frame',
      trackIds: ['frame'],
    })

    expect(items).toHaveLength(1)
    expect(items[0]?.strokeEnabled).toBe(true)
    expect(items[0]?.fillColor).toBe('#00000000')
    expect(items[0]?.audioReactive?.bindings.map((binding) => binding.driver))
      .toEqual(['low', 'low'])
  })

  it('creates three independently driven normal shape layers', () => {
    const items = buildBeatvideoReactiveGraphicItems({
      ...base,
      presetId: 'three-band-bars',
      trackIds: ['low', 'mid', 'high'],
    })

    expect(items).toHaveLength(3)
    expect(items.map((item) => item.type)).toEqual(['shape', 'shape', 'shape'])
    expect(items.map((item) => item.audioReactive?.bindings[0]?.driver))
      .toEqual(['low', 'mid', 'high'])
    expect(items.every((item) => item.audioReactive?.transients?.length === 3)).toBe(true)
  })

  it('falls back to beat pulses when spectral transient evidence is unavailable', () => {
    const noTransients = { ...grid, transients: [] }
    const items = buildBeatvideoReactiveGraphicItems({
      ...base,
      grid: noTransients,
      presetId: 'three-band-bars',
      trackIds: ['low', 'mid', 'high'],
    })

    expect(items.map((item) => item.audioReactive?.bindings[0]?.driver))
      .toEqual(['beat', 'beat', 'beat'])
  })
})
