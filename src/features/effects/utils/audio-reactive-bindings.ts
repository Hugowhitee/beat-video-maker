import type { EffectParam } from '@/infrastructure/gpu-effects/types'
import type { AudioReactiveBinding } from '@/types/beatvideo'
import type { ItemEffect } from '@/types/effects'

function roundToStep(value: number, step: number): number {
  if (!Number.isFinite(step) || step <= 0) return value
  const decimals = Math.max(0, (step.toString().split('.')[1] ?? '').length)
  return Number((Math.round(value / step) * step).toFixed(decimals))
}

export function isAudioReactiveParam(param: EffectParam): boolean {
  return param.type === 'number' && param.animatable === true && param.quality !== true
}

export function getAudioReactiveBindingForParam(
  bindings: readonly AudioReactiveBinding[] | undefined,
  effectId: string,
  gpuEffectType: string,
  paramKey: string,
): AudioReactiveBinding | undefined {
  return bindings?.find(
    (binding) =>
      binding.target.kind === 'effect-param' &&
      binding.target.effectId === effectId &&
      binding.target.gpuEffectType === gpuEffectType &&
      binding.target.paramKey === paramKey,
  )
}

export function createDefaultAudioReactiveEffectBinding(params: {
  effect: ItemEffect
  paramKey: string
  param: EffectParam
  fps: number
  driver?: AudioReactiveBinding['driver']
}): AudioReactiveBinding | null {
  const { effect, paramKey, param, fps, driver = 'beat' } = params
  if (effect.effect.type !== 'gpu-effect' || !isAudioReactiveParam(param)) return null

  const min = typeof param.min === 'number' ? param.min : 0
  const max = typeof param.max === 'number' ? param.max : Math.max(1, min + 1)
  const step = typeof param.step === 'number' && param.step > 0 ? param.step : 0.01
  const span = Math.max(step, Math.abs(max - min))
  // ~8% of the native parameter range keeps first-use musical instead of flashy.
  const amount = Math.max(step, roundToStep(span * 0.08, step))

  return {
    id: crypto.randomUUID(),
    enabled: true,
    target: {
      kind: 'effect-param',
      effectId: effect.id,
      gpuEffectType: effect.effect.gpuEffectType,
      paramKey,
    },
    driver,
    amount,
    threshold: 0.58,
    sensitivity: 1,
    attackFrames: 0,
    releaseFrames: Math.max(1, Math.round(Math.max(1, fps) * 0.12)),
    everyNthBeat: 1,
    useStrength: true,
  }
}

export function getAudioReactiveAmountRange(
  param: EffectParam,
): { min: number; max: number; step: number } {
  const nativeMin = typeof param.min === 'number' ? param.min : 0
  const nativeMax = typeof param.max === 'number' ? param.max : Math.max(1, nativeMin + 1)
  const step = typeof param.step === 'number' && param.step > 0 ? param.step : 0.01
  const span = Math.max(step, Math.abs(nativeMax - nativeMin))
  const bound = Math.max(step, roundToStep(span * 0.5, step))
  return { min: -bound, max: bound, step }
}
