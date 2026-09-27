import { getGpuEffectDefaultParams } from '@/infrastructure/gpu-effects'
import type {
  AudioReactiveBinding,
  AudioReactiveState,
  MusicMap,
} from '@/types/beatvideo'
import type { ItemEffect } from '@/types/effects'
import type { TimelineItem } from '@/types/timeline'
import { projectAudioReactiveBeatsToItem } from '@/shared/beatvideo/beat-reactive'

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
    label: 'Gentle punch',
    description: 'Small scale hit on strong beats.',
  },
  {
    id: 'beat-flash',
    label: 'Beat flash',
    description: 'Short brightness lift on strong downbeats.',
  },
  {
    id: 'glow-hit',
    label: 'Glow hit',
    description: 'Adds a restrained glow pulse on strong beats.',
  },
  {
    id: 'subtle-shake',
    label: 'Subtle shake',
    description: 'Barely perceptible deterministic movement on downbeats.',
  },
  {
    id: 'chromatic-hit',
    label: 'Chromatic hit',
    description: 'Brief RGB separation on strong downbeats.',
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

  const effect: ItemEffect = {
    id: crypto.randomUUID(),
    enabled: true,
    effect: {
      type: 'gpu-effect',
      gpuEffectType,
      params: getGpuEffectDefaultParams(gpuEffectType),
    },
  }
  return { effects: [...effects, effect], effect }
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
    target,
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
        driver: 'beat',
        amount: 0.018,
        threshold: 0.58,
        releaseFrames: Math.max(1, Math.round(fps * 0.1)),
      },
    )
  } else if (presetId === 'subtle-shake') {
    if (item.type === 'adjustment') return null
    binding = baseBinding(
      { kind: 'transform-shake' },
      fps,
      {
        driver: 'downbeat',
        amount: 0.14,
        threshold: 0.72,
        releaseFrames: Math.max(1, Math.round(fps * 0.09)),
      },
    )
  } else {
    const effectType =
      presetId === 'beat-flash'
        ? 'gpu-brightness'
        : presetId === 'glow-hit'
          ? 'gpu-glow'
          : 'gpu-rgb-split'
    const ensured = ensureGpuEffect(effects, effectType)
    effects = ensured.effects

    if (ensured.effect.effect.type !== 'gpu-effect') return null
    const paramKey = 'amount'
    const amount =
      presetId === 'beat-flash'
        ? 0.16
        : presetId === 'glow-hit'
          ? 0.4
          : 0.006

    binding = baseBinding(
      {
        kind: 'effect-param',
        effectId: ensured.effect.id,
        gpuEffectType: effectType,
        paramKey,
      },
      fps,
      {
        driver: presetId === 'glow-hit' ? 'beat' : 'downbeat',
        amount,
        threshold:
          presetId === 'beat-flash'
            ? 0.66
            : presetId === 'glow-hit'
              ? 0.64
              : 0.7,
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
      bindings,
    },
  }
}
