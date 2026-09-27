// @vitest-environment node

import { describe, expect, it } from 'vite-plus/test'
import type { AudioReactiveBinding, AudioReactiveState } from '@/types/beatvideo'
import {
  applyAudioReactiveEffectParamValue,
  applyAudioReactiveTransform,
  evaluateAudioReactiveBinding,
  projectAudioReactiveBeatsToItem,
  projectAudioReactiveTransientsToItem,
} from './beat-reactive'

function binding(overrides: Partial<AudioReactiveBinding> = {}): AudioReactiveBinding {
  return {
    id: 'binding-1',
    enabled: true,
    target: { kind: 'transform', property: 'scale' },
    driver: 'beat',
    amount: 0.04,
    threshold: 0.5,
    sensitivity: 1,
    attackFrames: 0,
    releaseFrames: 6,
    everyNthBeat: 1,
    useStrength: true,
    ...overrides,
  }
}

function state(bindings: AudioReactiveBinding[]): AudioReactiveState {
  return {
    version: 1,
    enabled: true,
    beats: [
      { frame: 10, index: 0, strength: 0.4, downbeat: true },
      { frame: 20, index: 1, strength: 0.9, downbeat: false },
      { frame: 30, index: 2, strength: 1, downbeat: true },
    ],
    bindings,
  }
}

describe('audio reactive modulation', () => {
  it('gates weak hits by threshold and decays deterministically', () => {
    const b = binding()
    const s = state([b])

    expect(evaluateAudioReactiveBinding(s, b, 10).pulse).toBe(0)
    expect(evaluateAudioReactiveBinding(s, b, 20).delta).toBeGreaterThan(0)
    expect(evaluateAudioReactiveBinding(s, b, 23).delta).toBeGreaterThan(0)
    expect(evaluateAudioReactiveBinding(s, b, 27).delta).toBe(0)
  })

  it('fires on the exact analyzed frame instead of one frame early or late', () => {
    const b = binding({
      driver: 'audio',
      threshold: 0,
      useStrength: false,
      attackFrames: 0,
      releaseFrames: 4,
    })
    const s: AudioReactiveState = {
      ...state([b]),
      transients: [
        { frame: 42, index: 0, strength: 1, low: 0.8, mid: 0.5, high: 0.3 },
      ],
    }

    expect(evaluateAudioReactiveBinding(s, b, 41).pulse).toBe(0)
    expect(evaluateAudioReactiveBinding(s, b, 42).pulse).toBe(1)
    expect(evaluateAudioReactiveBinding(s, b, 43).pulse).toBeGreaterThan(0)
  })

  it('supports downbeat and every-N sparse triggering without keyframes', () => {
    const b = binding({
      driver: 'downbeat',
      everyNthBeat: 2,
      threshold: 0,
      useStrength: false,
    })
    const s = state([b])

    expect(evaluateAudioReactiveBinding(s, b, 20).pulse).toBe(0)
    expect(evaluateAudioReactiveBinding(s, b, 30).pulse).toBeGreaterThan(0)
  })

  it('can react to low-frequency audio transients independently from the beat grid', () => {
    const b = binding({
      driver: 'low',
      threshold: 0.4,
      useStrength: true,
      amount: 0.1,
      releaseFrames: 4,
    })
    const s: AudioReactiveState = {
      ...state([b]),
      transients: [
        { frame: 12, index: 0, strength: 0.95, low: 0.9, mid: 0.2, high: 0.1 },
        { frame: 18, index: 1, strength: 0.9, low: 0.2, mid: 0.8, high: 0.3 },
      ],
    }

    expect(evaluateAudioReactiveBinding(s, b, 12).delta).toBeGreaterThan(0)
    expect(evaluateAudioReactiveBinding(s, b, 18).pulse).toBe(0)
  })

  it('only scans the active event window while preserving the strongest current hit', () => {
    const b = binding({
      driver: 'audio',
      threshold: 0,
      releaseFrames: 4,
      useStrength: true,
      amount: 0.1,
    })
    const s: AudioReactiveState = {
      ...state([b]),
      transients: [
        { frame: 2, index: 0, strength: 1, low: 1, mid: 0, high: 0 },
        { frame: 18, index: 1, strength: 0.5, low: 0.5, mid: 0, high: 0 },
        { frame: 20, index: 2, strength: 0.9, low: 0.9, mid: 0, high: 0 },
        { frame: 99, index: 3, strength: 1, low: 1, mid: 0, high: 0 },
      ],
    }

    const evaluated = evaluateAudioReactiveBinding(s, b, 20)
    expect(evaluated.beatFrame).toBe(20)
    expect(evaluated.sourceStrength).toBeCloseTo(0.9)
    expect(evaluated.delta).toBeGreaterThan(0)
  })

  it('adds modulation to the authored effect value instead of replacing it', () => {
    const b = binding({
      target: {
        kind: 'effect-param',
        effectId: 'brightness-1',
        gpuEffectType: 'gpu-brightness',
        paramKey: 'amount',
      },
      amount: 0.2,
      threshold: 0,
      useStrength: false,
    })
    const s = state([b])

    expect(
      applyAudioReactiveEffectParamValue(0.15, s, 20, {
        effectId: 'brightness-1',
        gpuEffectType: 'gpu-brightness',
        paramKey: 'amount',
      }),
    ).toBeCloseTo(0.35)
  })

  it('keeps transform shake deterministic and scale additive', () => {
    const scale = binding({ threshold: 0, useStrength: false, amount: 0.03 })
    const shake = binding({
      id: 'shake',
      target: { kind: 'transform-shake' },
      threshold: 0,
      useStrength: false,
      amount: 0.25,
    })
    const s = state([scale, shake])
    const base = {
      x: 0,
      y: 0,
      width: 1000,
      height: 1000,
      anchorX: 500,
      anchorY: 500,
      rotation: 0,
      opacity: 1,
      cornerRadius: 0,
    }

    const first = applyAudioReactiveTransform(base, s, 20, 1920, 1080)
    const second = applyAudioReactiveTransform(base, s, 20, 1920, 1080)
    expect(first).toEqual(second)
    expect(first.width).toBeCloseTo(1030)
    expect(first.height).toBeCloseTo(1030)
    expect(Math.abs(first.x)).toBeLessThanOrEqual(1080 * 0.004 * 0.25)
  })
  it('projects spectral transients into the same item-local timeline', () => {
    const transients = projectAudioReactiveTransientsToItem(
      {
        duration: 4,
        bpm: 120,
        beatsPerBar: 4,
        beats: [],
        sections: [],
        transients: [
          { time: 0.5, index: 0, strength: 1, low: 0.9, mid: 0.2, high: 0.1 },
          { time: 1.5, index: 1, strength: 0.8, low: 0.1, mid: 0.4, high: 0.8 },
        ],
      },
      { from: 30, durationInFrames: 60 },
      30,
    )

    expect(transients).toEqual([
      { frame: 15, index: 1, strength: 0.8, low: 0.1, mid: 0.4, high: 0.8 },
    ])
  })

  it('projects corrected timeline beats into item-local frames', () => {
    const beats = projectAudioReactiveBeatsToItem(
      {
        duration: 4,
        bpm: 120,
        beatsPerBar: 4,
        sections: [],
        beats: [
          { time: 0.5, index: 0, strength: 0.8, downbeat: true },
          { time: 1, index: 1, strength: 0.7, downbeat: false },
          { time: 1.5, index: 2, strength: 0.9, downbeat: false },
          { time: 2, index: 3, strength: 1, downbeat: false },
        ],
      },
      { from: 30, durationInFrames: 60 },
      30,
    )

    expect(beats).toEqual([
      { frame: 0, index: 1, strength: 0.7, downbeat: false },
      { frame: 15, index: 2, strength: 0.9, downbeat: false },
      { frame: 30, index: 3, strength: 1, downbeat: false },
    ])
  })

})
