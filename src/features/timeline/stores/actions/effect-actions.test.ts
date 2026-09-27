// @vitest-environment node

import { beforeEach, describe, expect, it } from 'vite-plus/test'
import type { VisualEffect } from '@/types/effects'
import { buildEffectAnimatableProperty } from '@/types/keyframe'
import { makeTimelineAudioItem, makeTimelineTrack, makeTimelineVideoItem } from '../../test-helpers'
import { useItemsStore } from '../items-store'
import { useKeyframesStore } from '../keyframes-store'
import { useTimelineCommandStore } from '../timeline-command-store'
import { useTimelineSettingsStore } from '../timeline-settings-store'
import {
  addEffect,
  addEffects,
  removeEffect,
  removeEffects,
  toggleEffect,
  updateEffect,
} from './effect-actions'

function makeBrightness(value = 0.5): VisualEffect {
  return { type: 'gpu-effect', gpuEffectType: 'gpu-brightness', params: { brightness: value } }
}

function getEffects(itemId: string) {
  const item = useItemsStore.getState().itemById[itemId]
  expect(item).toBeDefined()
  return (
    (item as { effects?: Array<{ id: string; effect: VisualEffect; enabled: boolean }> }).effects ??
    []
  )
}

describe('effect actions', () => {
  beforeEach(() => {
    useTimelineCommandStore.getState().clearHistory()
    useKeyframesStore.getState().setKeyframes([])
    useTimelineSettingsStore.setState({ fps: 30, isDirty: false })
    useItemsStore
      .getState()
      .setTracks([
        makeTimelineTrack({ id: 'track-v1', name: 'V1', kind: 'video', order: 0 }),
        makeTimelineTrack({ id: 'track-a1', name: 'A1', kind: 'audio', order: 1 }),
      ])
    useItemsStore
      .getState()
      .setItems([
        makeTimelineVideoItem({ id: 'a' }),
        makeTimelineVideoItem({ id: 'b', from: 60 }),
        makeTimelineAudioItem({ id: 'audio-1' }),
      ])
  })

  it('addEffect appends an enabled effect instance with a generated id', () => {
    addEffect('a', makeBrightness())

    const effects = getEffects('a')
    expect(effects).toHaveLength(1)
    expect(effects[0]).toMatchObject({
      enabled: true,
      effect: { gpuEffectType: 'gpu-brightness' },
    })
    expect(effects[0]?.id).toBeTruthy()
    expect(useTimelineSettingsStore.getState().isDirty).toBe(true)
  })

  it('addEffects applies to multiple items but skips audio items', () => {
    addEffects([
      { itemId: 'a', effects: [makeBrightness()] },
      { itemId: 'b', effects: [makeBrightness(), makeBrightness(0.8)] },
      { itemId: 'audio-1', effects: [makeBrightness()] },
    ])

    expect(getEffects('a')).toHaveLength(1)
    expect(getEffects('b')).toHaveLength(2)
    expect(getEffects('audio-1')).toHaveLength(0)
  })

  it('updateEffect replaces effect params', () => {
    addEffect('a', makeBrightness(0.5))
    const effectId = getEffects('a')[0]!.id

    updateEffect('a', effectId, { effect: makeBrightness(0.9) })

    expect(getEffects('a')[0]?.effect.params.brightness).toBe(0.9)
  })

  it('toggleEffect flips enabled and removeEffect deletes', () => {
    addEffect('a', makeBrightness())
    const effectId = getEffects('a')[0]!.id

    toggleEffect('a', effectId)
    expect(getEffects('a')[0]?.enabled).toBe(false)
    toggleEffect('a', effectId)
    expect(getEffects('a')[0]?.enabled).toBe(true)

    removeEffect('a', effectId)
    expect(getEffects('a')).toHaveLength(0)
  })

  it('undo restores the pre-add state', () => {
    addEffect('a', makeBrightness())
    expect(getEffects('a')).toHaveLength(1)

    useTimelineCommandStore.getState().undo()
    expect(getEffects('a')).toHaveLength(0)
  })

  it('removing an effect cleans its reactive binding and undo restores both', () => {
    addEffect('a', makeBrightness(0.5))
    const effectId = getEffects('a')[0]!.id

    useItemsStore.getState()._updateItem('a', {
      audioReactive: {
        version: 1,
        enabled: true,
        beats: [{ frame: 0, index: 0, strength: 1, downbeat: true }],
        bindings: [{
          id: 'binding-1',
          enabled: true,
          target: {
            kind: 'effect-param',
            effectId,
            gpuEffectType: 'gpu-brightness',
            paramKey: 'brightness',
          },
          driver: 'beat',
          amount: 0.2,
          threshold: 0.5,
          sensitivity: 1,
          attackFrames: 0,
          releaseFrames: 4,
          everyNthBeat: 1,
          useStrength: true,
        }],
      },
    })

    removeEffect('a', effectId)
    expect(getEffects('a')).toHaveLength(0)
    expect(useItemsStore.getState().itemById.a?.audioReactive).toBeUndefined()

    useTimelineCommandStore.getState().undo()
    expect(getEffects('a')).toHaveLength(1)
    expect(useItemsStore.getState().itemById.a?.audioReactive?.bindings).toHaveLength(1)
  })

  it('removing an effect clears its effect keyframes and undo restores them', () => {
    addEffect('a', makeBrightness(0.5))
    const effectId = getEffects('a')[0]!.id
    const property = buildEffectAnimatableProperty('gpu-brightness', effectId, 'brightness')
    useKeyframesStore.getState()._addKeyframe('a', property, 0, 0.5)

    removeEffect('a', effectId)
    expect(getEffects('a')).toHaveLength(0)
    expect(useKeyframesStore.getState().getKeyframesForItem('a')?.properties ?? []).toHaveLength(0)

    useTimelineCommandStore.getState().undo()
    expect(getEffects('a')).toHaveLength(1)
    expect(
      useKeyframesStore.getState().getKeyframesForItem('a')?.properties[0]?.property,
    ).toBe(property)

    useTimelineCommandStore.getState().redo()
    expect(getEffects('a')).toHaveLength(0)
    expect(useKeyframesStore.getState().getKeyframesForItem('a')?.properties ?? []).toHaveLength(0)
  })

  it('removes mapped effects from multiple items as one undo step', () => {
    addEffect('a', makeBrightness(0.5))
    addEffect('b', makeBrightness(0.8))
    const effectA = getEffects('a')[0]!.id
    const effectB = getEffects('b')[0]!.id
    useTimelineCommandStore.getState().clearHistory()

    removeEffects([
      { itemId: 'a', effectId: effectA },
      { itemId: 'b', effectId: effectB },
    ])
    expect(getEffects('a')).toHaveLength(0)
    expect(getEffects('b')).toHaveLength(0)

    useTimelineCommandStore.getState().undo()
    expect(getEffects('a')).toHaveLength(1)
    expect(getEffects('b')).toHaveLength(1)

    useTimelineCommandStore.getState().redo()
    expect(getEffects('a')).toHaveLength(0)
    expect(getEffects('b')).toHaveLength(0)
  })

  it('undo and redo preserve the last edited effect values across removal', () => {
    addEffect('a', makeBrightness(0.5))
    const effectId = getEffects('a')[0]!.id

    updateEffect('a', effectId, { effect: makeBrightness(0.9) })
    expect(getEffects('a')[0]?.effect.params.brightness).toBe(0.9)

    removeEffect('a', effectId)
    expect(getEffects('a')).toHaveLength(0)

    useTimelineCommandStore.getState().undo()
    expect(getEffects('a')).toHaveLength(1)
    expect(getEffects('a')[0]?.id).toBe(effectId)
    expect(getEffects('a')[0]?.effect.params.brightness).toBe(0.9)

    useTimelineCommandStore.getState().undo()
    expect(getEffects('a')[0]?.effect.params.brightness).toBe(0.5)

    useTimelineCommandStore.getState().redo()
    expect(getEffects('a')[0]?.effect.params.brightness).toBe(0.9)

    useTimelineCommandStore.getState().redo()
    expect(getEffects('a')).toHaveLength(0)
  })

})
