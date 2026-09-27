/**
 * Effect Actions - Visual effect operations with undo/redo support.
 */

import type { ItemEffect, VisualEffect } from '@/types/effects'
import type { AudioReactiveState } from '@/types/beatvideo'
import { parseEffectAnimatableProperty } from '@/types/keyframe'
import { useItemsStore } from '../items-store'
import { useKeyframesStore } from '../keyframes-store'
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

function cleanupRemovedEffectState(itemId: string, removedEffectIds: ReadonlySet<string>): void {
  if (removedEffectIds.size === 0) return

  const itemStore = useItemsStore.getState()
  const item = itemStore.itemById[itemId]

  if (item?.audioReactive) {
    const bindings = item.audioReactive.bindings.filter(
      (binding) =>
        binding.target.kind !== 'effect-param' || !removedEffectIds.has(binding.target.effectId),
    )
    if (bindings.length !== item.audioReactive.bindings.length) {
      itemStore._updateItem(itemId, {
        audioReactive:
          bindings.length > 0 ? { ...item.audioReactive, bindings } : undefined,
      })
    }
  }

  const keyframeStore = useKeyframesStore.getState()
  const keyframes = keyframeStore.getKeyframesForItem(itemId)
  if (!keyframes) return

  for (const property of keyframes.properties) {
    const parsed = parseEffectAnimatableProperty(property.property)
    if (parsed && removedEffectIds.has(parsed.effectId)) {
      keyframeStore._removeKeyframesForProperty(itemId, property.property)
    }
  }
}

export function removeEffect(itemId: string, effectId: string): void {
  removeEffects([{ itemId, effectId }])
}

/**
 * Remove effect instances across one or many items as one undoable edit.
 * This is the canonical removal path for the inspector so a multi-selection
 * can never end up half-restored after one Undo.
 */
export function removeEffects(
  removals: Array<{ itemId: string; effectId: string }>,
): void {
  if (removals.length === 0) return

  execute(
    'REMOVE_EFFECTS',
    () => {
      const store = useItemsStore.getState()
      const grouped = new Map<string, Set<string>>()
      for (const { itemId, effectId } of removals) {
        const ids = grouped.get(itemId) ?? new Set<string>()
        ids.add(effectId)
        grouped.set(itemId, ids)
      }

      for (const [itemId, effectIds] of grouped) {
        for (const effectId of effectIds) {
          store._removeEffect(itemId, effectId)
        }
        cleanupRemovedEffectState(itemId, effectIds)
      }

      useTimelineSettingsStore.getState().markDirty()
    },
    { count: removals.length },
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
      const removedByItem = updates.map((update) => {
        const previous = store.itemById[update.itemId]?.effects ?? []
        const nextIds = new Set(update.effects.map((effect) => effect.id))
        return {
          itemId: update.itemId,
          removedIds: new Set(
            previous.filter((effect) => !nextIds.has(effect.id)).map((effect) => effect.id),
          ),
        }
      })

      store._setItemEffects(updates)

      for (const { itemId, removedIds } of removedByItem) {
        cleanupRemovedEffectState(itemId, removedIds)
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
