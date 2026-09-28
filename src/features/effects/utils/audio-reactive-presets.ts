import { getGpuEffectDefaultParams } from '@/infrastructure/gpu-effects'
import type {
  AudioReactiveBinding,
  AudioReactiveState,
  MusicMap,
} from '@/types/beatvideo'
import type { ItemEffect } from '@/types/effects'
import type { TimelineItem } from '@/types/timeline'
import {
  projectAudioReactiveBeatsToItem,
  projectAudioReactiveTransientsToItem,
} from '@/shared/beatvideo/beat-reactive'

export type AudioReactivePresetId =
  | 'gentle-punch'
  | 'beat-flash'
  | 'glow-hit'
  | 'subtle-shake'
  | 'chromatic-hit'

export const AUDIO_REACTIVE_PRESETS: ReadonlyArray<{
  id: AudioReactivePresetId
  label: string
  description: string
}> = [
  {
    id: 'gentle-punch',
    label: 'Pulse',
    description: 'Small scale punch on strong low hits or beats.',
  },
  {
    id: 'subtle-shake',
    label: 'Shake',
    description: 'Restrained movement on strong low hits or downbeats.',
  },
  {
    id: 'beat-flash',
    label: 'Flash',
    description: 'Short brightness lift on strong downbeats.',
  },
  {
    id: 'glow-hit',
    label: 'Glow',
    description: 'Glow pulse on strong high-frequency hits or beats.',
  },
  {
    id: 'chromatic-hit',
    label: 'RGB',
    description: 'Brief chromatic split on strong mid hits or downbeats.',
  },
]

function sameTarget(a: AudioReactiveBinding, b: AudioReactiveBinding): boolean {
  if (a.target.kind !== b.target.kind) return false
  if (a.target.kind === 'transform' && b.target.kind === 'transform') {
    return a.target.property === b.target.property
  }
  if (a.target.kind === 'transform-shake' && b.target.kind === 'transform-shake') {
    return true
  }
  if (a.target.kind === 'effect-param' && b.target.kind === 'effect-param') {
    return (
      a.target.effectId === b.target.effectId &&
      a.target.gpuEffectType === b.target.gpuEffectType &&
      a.target.paramKey === b.target.paramKey
    )
  }
  return false
}

function upsertBinding(
  bindings: readonly AudioReactiveBinding[],
  next: AudioReactiveBinding,
): AudioReactiveBinding[] {
  const existing = bindings.find((binding) => sameTarget(binding, next))
  if (!existing) return [...bindings, next]
  return bindings.map((binding) =>
    binding.id === existing.id ? { ...next, id: existing.id } : binding,
  )
}

function ensureGpuEffect(
  effects: readonly ItemEffect[],
  gpuEffectType: string,
  neutralParamKey?: string,
): { effects: ItemEffect[]; effect: ItemEffect } {
  const existing = effects.find(
    (entry) =>
      entry.effect.type === 'gpu-effect' &&
      entry.effect.gpuEffectType === gpuEffectType,
  )
  if (existing) {
    if (existing.enabled) return { effects: [...effects], effect: existing }
    const enabled = { ...existing, enabled: true }
    return {
      effects: effects.map((entry) => (entry.id === existing.id ? enabled : entry)),
      effect: enabled,
    }
  }

  const defaultParams = getGpuEffectDefaultParams(gpuEffectType)
  const effect: ItemEffect = {
    id: crypto.randomUUID(),
    enabled: true,
    effect: {
      type: 'gpu-effect',
      gpuEffectType,
      params:
        neutralParamKey && typeof defaultParams[neutralParamKey] === 'number'
          ? { ...defaultParams, [neutralParamKey]: 0 }
          : defaultParams,
    },
  }
  return { effects: [...effects, effect], effect }
}

function audioDriver(
  grid: MusicMap,
  preferred: AudioReactiveBinding['driver'],
  fallback: AudioReactiveBinding['driver'],
): AudioReactiveBinding['driver'] {
  if (preferred === 'beat' || preferred === 'downbeat') return preferred
  return (grid.transients?.length ?? 0) > 0 ? preferred : fallback
}

function baseBinding(
  target: AudioReactiveBinding['target'],
  fps: number,
  overrides: Partial<AudioReactiveBinding>,
): AudioReactiveBinding {
  return {
    id: crypto.randomUUID(),
    enabled: true,
    target,
    driver: 'beat',
    amount: 0,
    threshold: 0.6,
    sensitivity: 1,
    attackFrames: 0,
    releaseFrames: Math.max(1, Math.round(Math.max(1, fps) * 0.11)),
    everyNthBeat: 1,
    useStrength: true,
    ...overrides,
  }
}

function bindingMatchesPreset(
  binding: AudioReactiveBinding,
  presetId: AudioReactivePresetId,
): boolean {
  if (presetId === 'gentle-punch') {
    return binding.target.kind === 'transform' && binding.target.property === 'scale'
  }
  if (presetId === 'subtle-shake') {
    return binding.target.kind === 'transform-shake'
  }
  if (binding.target.kind !== 'effect-param' || binding.target.paramKey !== 'amount') {
    return false
  }

  const effectType =
    presetId === 'beat-flash'
      ? 'gpu-brightness'
      : presetId === 'glow-hit'
        ? 'gpu-glow'
        : 'gpu-rgb-split'
  return binding.target.gpuEffectType === effectType
}

export function isAudioReactivePresetApplied(
  item: TimelineItem,
  presetId: AudioReactivePresetId,
): boolean {
  return item.audioReactive?.bindings.some((binding) => bindingMatchesPreset(binding, presetId)) ?? false
}

export function buildAudioReactivePresetRemovalUpdate(params: {
  item: TimelineItem
  presetId: AudioReactivePresetId
}): {
  itemId: string
  effects: ItemEffect[]
  audioReactive?: AudioReactiveState
} | null {
  const { item, presetId } = params
  const current = item.audioReactive
  if (!current) return null

  const removedBindings = current.bindings.filter((binding) =>
    bindingMatchesPreset(binding, presetId),
  )
  if (removedBindings.length === 0) return null

  const remainingBindings = current.bindings.filter(
    (binding) => !bindingMatchesPreset(binding, presetId),
  )
  const removedEffectIds = new Set(
    removedBindings.flatMap((binding) =>
      binding.target.kind === 'effect-param' ? [binding.target.effectId] : [],
    ),
  )
  const remainingBoundEffectIds = new Set(
    remainingBindings.flatMap((binding) =>
      binding.target.kind === 'effect-param' ? [binding.target.effectId] : [],
    ),
  )

  const effects = (item.effects ?? []).filter((effect) => {
    if (!removedEffectIds.has(effect.id) || remainingBoundEffectIds.has(effect.id)) return true
    if (effect.effect.type !== 'gpu-effect') return true
    const amount = effect.effect.params.amount
    // Quick-start-created visual effects have a neutral zero baseline. Remove
    // those shells when their final reactive binding is removed, while
    // preserving any authored effect with a non-neutral base value.
    return typeof amount !== 'number' || Math.abs(amount) > 1e-9
  })

  return {
    itemId: item.id,
    effects,
    audioReactive:
      remainingBindings.length > 0
        ? { ...current, bindings: remainingBindings }
        : undefined,
  }
}

export function buildAudioReactivePresetUpdate(params: {
  item: TimelineItem
  grid: MusicMap
  fps: number
  presetId: AudioReactivePresetId
}): {
  itemId: string
  effects: ItemEffect[]
  audioReactive: AudioReactiveState
} | null {
  const { item, grid, fps, presetId } = params
  if (item.type === 'audio') return null

  let effects = [...(item.effects ?? [])]
  let bindings = [...(item.audioReactive?.bindings ?? [])]
  let binding: AudioReactiveBinding

  if (presetId === 'gentle-punch') {
    if (item.type === 'adjustment') return null
    binding = baseBinding(
      { kind: 'transform', property: 'scale' },
      fps,
      {
        driver: audioDriver(grid, 'low', 'beat'),
        amount: 0.028,
        threshold: 0.5,
        releaseFrames: Math.max(1, Math.round(fps * 0.1)),
      },
    )
  } else if (presetId === 'subtle-shake') {
    if (item.type === 'adjustment') return null
    binding = baseBinding(
      { kind: 'transform-shake' },
      fps,
      {
        driver: audioDriver(grid, 'low', 'downbeat'),
        amount: 0.3,
        threshold: 0.62,
        releaseFrames: Math.max(1, Math.round(fps * 0.08)),
      },
    )
  } else {
    const effectType =
      presetId === 'beat-flash'
        ? 'gpu-brightness'
        : presetId === 'glow-hit'
          ? 'gpu-glow'
          : 'gpu-rgb-split'
    const ensured = ensureGpuEffect(effects, effectType, 'amount')
    effects = ensured.effects

    if (ensured.effect.effect.type !== 'gpu-effect') return null
    const paramKey = 'amount'
    const amount =
      presetId === 'beat-flash'
        ? 0.2
        : presetId === 'glow-hit'
          ? 0.5
          : 0.01

    binding = baseBinding(
      {
        kind: 'effect-param',
        effectId: ensured.effect.id,
        gpuEffectType: effectType,
        paramKey,
      },
      fps,
      {
        driver:
          presetId === 'glow-hit'
            ? audioDriver(grid, 'high', 'beat')
            : presetId === 'chromatic-hit'
              ? audioDriver(grid, 'mid', 'downbeat')
              : 'downbeat',
        amount,
        threshold:
          presetId === 'beat-flash'
            ? 0.6
            : presetId === 'glow-hit'
              ? 0.58
              : 0.62,
        releaseFrames: Math.max(
          1,
          Math.round(fps * (presetId === 'glow-hit' ? 0.16 : 0.1)),
        ),
      },
    )
  }

  bindings = upsertBinding(bindings, binding)

  return {
    itemId: item.id,
    effects,
    audioReactive: {
      version: 1,
      enabled: true,
      beats: projectAudioReactiveBeatsToItem(grid, item, fps),
      transients: projectAudioReactiveTransientsToItem(grid, item, fps),
      bindings,
    },
  }
}
