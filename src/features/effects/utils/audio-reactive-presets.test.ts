// @vitest-environment node

import { describe, expect, it } from 'vite-plus/test'
import type { TimelineItem } from '@/types/timeline'
import type { MusicMap } from '@/types/beatvideo'
import {
  buildAudioReactivePresetRemovalUpdate,
  buildAudioReactivePresetUpdate,
  isAudioReactivePresetApplied,
} from './audio-reactive-presets'

const grid: MusicMap = {
  duration: 4,
  bpm: 120,
  beatsPerBar: 4,
  sections: [],
  beats: [
    { time: 0, index: 0, strength: 1, downbeat: true },
    { time: 0.5, index: 1, strength: 0.8, downbeat: false },
    { time: 1, index: 2, strength: 0.9, downbeat: false },
  ],
}

function imageItem(): TimelineItem {
  return {
    id: 'cover-1',
    type: 'image',
    trackId: 'v1',
    from: 0,
    durationInFrames: 120,
    label: 'cover.jpg',
    src: 'cover.jpg',
    effects: [],
  }
}

describe('audio reactive presets', () => {
  it('builds gentle punch as the same canonical transform binding model', () => {
    const update = buildAudioReactivePresetUpdate({
      item: imageItem(),
      grid,
      fps: 30,
      presetId: 'gentle-punch',
    })

    expect(update).not.toBeNull()
    expect(update?.effects).toHaveLength(0)
    expect(update?.audioReactive.bindings[0]?.target).toEqual({
      kind: 'transform',
      property: 'scale',
    })
    expect(update?.audioReactive.beats).toHaveLength(3)
  })

  it('adds brightness once and binds Beat flash to that real effect parameter', () => {
    const first = buildAudioReactivePresetUpdate({
      item: imageItem(),
      grid,
      fps: 30,
      presetId: 'beat-flash',
    })
    expect(first).not.toBeNull()
    const effect = first?.effects.find(
      (entry) =>
        entry.effect.type === 'gpu-effect' &&
        entry.effect.gpuEffectType === 'gpu-brightness',
    )
    expect(effect).toBeDefined()
    const binding = first?.audioReactive.bindings.find(
      (candidate) => candidate.target.kind === 'effect-param',
    )
    expect(binding?.target).toEqual({
      kind: 'effect-param',
      effectId: effect?.id,
      gpuEffectType: 'gpu-brightness',
      paramKey: 'amount',
    })

    const second = buildAudioReactivePresetUpdate({
      item: { ...imageItem(), effects: first?.effects, audioReactive: first?.audioReactive },
      grid,
      fps: 30,
      presetId: 'beat-flash',
    })
    expect(
      second?.effects.filter(
        (entry) =>
          entry.effect.type === 'gpu-effect' &&
          entry.effect.gpuEffectType === 'gpu-brightness',
      ),
    ).toHaveLength(1)
    expect(
      second?.audioReactive.bindings.filter(
        (candidate) =>
          candidate.target.kind === 'effect-param' &&
          candidate.target.gpuEffectType === 'gpu-brightness',
      ),
    ).toHaveLength(1)
  })

  it('starts reactive Glow from a neutral visual baseline', () => {
    const update = buildAudioReactivePresetUpdate({
      item: imageItem(),
      grid,
      fps: 30,
      presetId: 'glow-hit',
    })

    const glow = update?.effects.find(
      (entry) =>
        entry.effect.type === 'gpu-effect' &&
        entry.effect.gpuEffectType === 'gpu-glow',
    )
    expect(glow?.effect.type).toBe('gpu-effect')
    if (glow?.effect.type === 'gpu-effect') {
      expect(glow.effect.params.amount).toBe(0)
    }
    expect(update ? isAudioReactivePresetApplied(
      { ...imageItem(), effects: update.effects, audioReactive: update.audioReactive },
      'glow-hit',
    ) : false).toBe(true)
  })

  it('removes a neutral quick-start effect together with its final binding', () => {
    const applied = buildAudioReactivePresetUpdate({
      item: imageItem(),
      grid,
      fps: 30,
      presetId: 'glow-hit',
    })
    expect(applied).not.toBeNull()

    const item = {
      ...imageItem(),
      effects: applied?.effects,
      audioReactive: applied?.audioReactive,
    }
    const removed = buildAudioReactivePresetRemovalUpdate({
      item,
      presetId: 'glow-hit',
    })

    expect(removed?.effects.some(
      (entry) =>
        entry.effect.type === 'gpu-effect' &&
        entry.effect.gpuEffectType === 'gpu-glow',
    )).toBe(false)
    expect(removed?.audioReactive).toBeUndefined()
  })

  it('keeps an authored non-neutral effect when only its reactive binding is removed', () => {
    const authoredGlow = {
      id: 'authored-glow',
      enabled: true,
      effect: {
        type: 'gpu-effect' as const,
        gpuEffectType: 'gpu-glow',
        params: { amount: 0.8 },
      },
    }
    const applied = buildAudioReactivePresetUpdate({
      item: { ...imageItem(), effects: [authoredGlow] },
      grid,
      fps: 30,
      presetId: 'glow-hit',
    })
    expect(applied).not.toBeNull()

    const removed = buildAudioReactivePresetRemovalUpdate({
      item: {
        ...imageItem(),
        effects: applied?.effects,
        audioReactive: applied?.audioReactive,
      },
      presetId: 'glow-hit',
    })

    expect(removed?.effects).toContainEqual(authoredGlow)
    expect(removed?.audioReactive).toBeUndefined()
  })

  it('keeps shake deliberately restrained and downbeat driven', () => {
    const update = buildAudioReactivePresetUpdate({
      item: imageItem(),
      grid,
      fps: 30,
      presetId: 'subtle-shake',
    })
    const binding = update?.audioReactive.bindings[0]
    expect(binding?.target).toEqual({ kind: 'transform-shake' })
    expect(binding?.driver).toBe('downbeat')
    expect(binding?.amount).toBeLessThanOrEqual(0.14)
    expect(binding?.threshold).toBeGreaterThanOrEqual(0.7)
  })
})
