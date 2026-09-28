// @vitest-environment node

import { describe, expect, it } from 'vite-plus/test'
import type { EffectParam } from '@/infrastructure/gpu-effects/types'
import type { ItemEffect } from '@/types/effects'
import {
  createDefaultAudioReactiveEffectBinding,
  getAudioReactiveAmountRange,
} from './audio-reactive-bindings'

const effect: ItemEffect = {
  id: 'brightness-1',
  enabled: true,
  effect: {
    type: 'gpu-effect',
    gpuEffectType: 'gpu-brightness',
    params: { amount: 0 },
  },
}

const param: EffectParam = {
  type: 'number',
  label: 'Amount',
  default: 0,
  min: -1,
  max: 1,
  step: 0.01,
  animatable: true,
}

describe('audio reactive binding defaults', () => {
  it('starts with a visible but bounded modulation amount', () => {
    const binding = createDefaultAudioReactiveEffectBinding({
      effect,
      paramKey: 'amount',
      param,
      fps: 30,
      driver: 'audio',
    })

    expect(binding).not.toBeNull()
    expect(binding?.driver).toBe('audio')
    expect(binding?.amount).toBeCloseTo(0.24)
    expect(binding?.threshold).toBeCloseTo(0.5)
    expect(binding?.attackFrames).toBe(0)
    expect(binding?.releaseFrames).toBe(4)
  })

  it('keeps the editable amount range wider than the first-use value', () => {
    expect(getAudioReactiveAmountRange(param)).toEqual({
      min: -1,
      max: 1,
      step: 0.01,
    })
  })
})
