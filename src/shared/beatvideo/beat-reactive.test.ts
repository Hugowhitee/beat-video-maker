// @vitest-environment node

import { describe, expect, it } from 'vite-plus/test'
import type { AudioReactiveBinding, AudioReactiveState } from '@/types/beatvideo'
import {
  applyAudioReactiveEffectParamValue,
  applyAudioReactiveTransform,
  evaluateAudioReactiveBinding,
  projectAudioReactiveBeatsToItem,
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
