/**
 * Adapter exports for effects dependencies.
 * Editor modules should import effects components/helpers from here.
 */

export { EffectsSection } from '@/features/effects/components/effects-section'
export { ColorGradeSection } from '@/features/effects/components/color-grade-section'
export { EffectThumbnail } from '@/features/effects/components/effect-thumbnail'
export { prewarmEffectPreviews } from '@/features/effects/components/effect-thumbnail/engine'
export { useGpuEffectPreviewData } from '@/features/effects/hooks/use-gpu-effect-preview-data'

export {
  AUDIO_REACTIVE_PRESETS,
  buildAudioReactivePresetRemovalUpdate,
  buildAudioReactivePresetUpdate,
  isAudioReactivePresetApplied,
  type AudioReactivePresetId,
} from '@/features/effects/utils/audio-reactive-presets'
export { isAudioReactiveParam } from '@/features/effects/utils/audio-reactive-bindings'
