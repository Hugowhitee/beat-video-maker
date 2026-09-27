/**
 * Effect Actions - Visual effect operations with undo/redo support.
 */

import type { ItemEffect, VisualEffect } from '@/types/effects'
import type { AudioReactiveState } from '@/types/beatvideo'
import { useItemsStore } from '../items-store'
import { useTimelineSettingsStore } from '../timeline-settings-store'
import { execute } from './shared'
import { emitUiSound } from '@/shared/ui/ui-sound'

export function addEffect(itemId: string, effect: VisualEffect): void {
  execute(
    'ADD_EFFECT',
    () => {
      useItemsStore.getState()._addEffect(itemId, effect)
      useTimelineSettingsStore.getState().markDirty()
    },
    { itemId, effectType: effect.type },
  )
}

export function addEffects(updates: Array<{ itemId: string; effects: VisualEffect[] }>): void {
  execute(
    'ADD_EFFECTS',
    () => {
      useItemsStore.getState()._addEffects(updates)
      useTimelineSettingsStore.getState().markDirty()
    },
    { count: updates.length },
  )
}

export function updateEffect(
  itemId: string,
  effectId: string,
  updates: Partial<{ effect: VisualEffect; enabled: boolean }>,
): void {
  execute(
    'UPDATE_EFFECT',
    () => {
      useItemsStore.getState()._updateEffect(itemId, effectId, updates)
      useTimelineSettingsStore.getState().markDirty()
    },
    { itemId, effectId },
  )
}

export function removeEffect(itemId: string, effectId: string): void {
  execute(
    'REMOVE_EFFECT',
    () => {
      const store = useItemsStore.getState()
      const item = store.itemById[itemId]
      store._removeEffect(itemId, effectId)

      if (item?.audioReactive) {
        const bindings = item.audioReactive.bindings.filter(
          (binding) =>
            binding.target.kind !== 'effect-param' || binding.target.effectId !== effectId,
        )
        if (bindings.length !== item.audioReactive.bindings.length) {
          store._updateItem(itemId, {
            audioReactive:
              bindings.length > 0 ? { ...item.audioReactive, bindings } : undefined,
          })
        }
      }

      useTimelineSettingsStore.getState().markDirty()
    },
    { itemId, effectId },
  )
}

/**
 * Replace the full effects list on multiple items as one undo step.
 * Used for effect reordering and grade paste, where the new list is
 * derived from the existing one (retained effects keep their ids).
 */
export function setItemEffects(updates: Array<{ itemId: string; effects: ItemEffect[] }>): void {
  execute(
    'SET_ITEM_EFFECTS',
    () => {
      const store = useItemsStore.getState()
      store._setItemEffects(updates)

      for (const update of updates) {
        const item = store.itemById[update.itemId]
        if (!item?.audioReactive) continue
        const effectIds = new Set(update.effects.map((effect) => effect.id))
        const bindings = item.audioReactive.bindings.filter(
          (binding) =>
            binding.target.kind !== 'effect-param' || effectIds.has(binding.target.effectId),
        )
        if (bindings.length !== item.audioReactive.bindings.length) {
          store._updateItem(update.itemId, {
            audioReactive:
              bindings.length > 0 ? { ...item.audioReactive, bindings } : undefined,
          })
        }
      }

      useTimelineSettingsStore.getState().markDirty()
    },
    { count: updates.length },
  )
}

/**
 * Commit an effect stack and its canonical audio-reactive bindings together.
 * Quick reactive looks use this so adding a required GPU effect + its binding is
 * one undoable edit rather than two unrelated history entries.
 */
export function setItemEffectsAndAudioReactive(
  updates: Array<{
    itemId: string
    effects: ItemEffect[]
    audioReactive?: AudioReactiveState
  }>,
): void {
  if (updates.length === 0) return

  execute(
    'SET_REACTIVE_EFFECTS',
    () => {
      const store = useItemsStore.getState()
      store._setItemEffects(
        updates.map(({ itemId, effects }) => ({ itemId, effects })),
      )
      for (const update of updates) {
        if (!store.itemById[update.itemId]) continue
        store._updateItem(update.itemId, { audioReactive: update.audioReactive })
      }
      useTimelineSettingsStore.getState().markDirty()
    },
    { count: updates.length },
  )
}

export function toggleEffect(itemId: string, effectId: string): void {
  const wasEnabled = useItemsStore
    .getState()
    .items.find((item) => item.id === itemId)
    ?.effects?.find((effect) => effect.id === effectId)?.enabled
  execute(
    'TOGGLE_EFFECT',
    () => {
      useItemsStore.getState()._toggleEffect(itemId, effectId)
      useTimelineSettingsStore.getState().markDirty()
    },
    { itemId, effectId },
  )
  emitUiSound(wasEnabled ? 'toggleOff' : 'toggleOn')
}
