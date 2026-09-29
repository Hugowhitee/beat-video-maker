import type {
  AudioReactiveBeat,
  AudioReactiveBinding,
  AudioReactiveState,
  AudioReactiveTransient,
  MusicMap,
} from '@/types/beatvideo'
import type { TimelineItem } from '@/types/timeline'
import type { ResolvedTransform } from '@/types/transform'

export interface AudioReactiveFrameState {
  pulse: number
  delta: number
  sourceStrength: number
  beatFrame: number | null
  downbeat: boolean
}

function clamp01(value: number): number {
  if (value <= 0) return 0
  if (value >= 1) return 1
  return value
}

function hashNoise(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
  return (value - Math.floor(value)) * 2 - 1
}

function clampDelta(value: number, binding: AudioReactiveBinding): number {
  let next = value
  if (binding.minOutput !== undefined) next = Math.max(binding.minOutput, next)
  if (binding.maxOutput !== undefined) next = Math.min(binding.maxOutput, next)
  return next
}

function lowerBoundFrame(
  events: readonly { frame: number }[],
  targetFrame: number,
): number {
  let low = 0
  let high = events.length
  while (low < high) {
    const middle = low + ((high - low) >> 1)
    if ((events[middle]?.frame ?? Number.POSITIVE_INFINITY) < targetFrame) {
      low = middle + 1
    } else {
      high = middle
    }
  }
  return low
}

export function hasEnabledAudioReactiveBindings(
  state: AudioReactiveState | undefined,
): boolean {
  return state?.enabled === true && state.bindings.some((binding) => binding.enabled)
}

/**
 * Project the corrected timeline-domain Beatvideo grid onto one visual item's
 * local frame space. Keeping sparse detector evidence on the item makes preview,
 * export and save/reload independent from UI state while remaining cheap for a
 * full-song still.
 */
export function projectAudioReactiveBeatsToItem(
  grid: MusicMap,
  item: Pick<TimelineItem, 'from' | 'durationInFrames'>,
  fps: number,
): AudioReactiveBeat[] {
  if (!Number.isFinite(fps) || fps <= 0 || item.durationInFrames <= 0) return []

  const start = item.from
  const end = item.from + item.durationInFrames

  return grid.beats.flatMap((beat) => {
    const timelineFrame = Math.round(beat.time * fps)
    if (timelineFrame < start || timelineFrame >= end) return []
    return [{
      frame: timelineFrame - start,
      index: beat.index,
      strength: clamp01(beat.strength),
      downbeat: beat.downbeat,
    }]
  })
}

export function projectAudioReactiveTransientsToItem(
  grid: MusicMap,
  item: Pick<TimelineItem, 'from' | 'durationInFrames'>,
  fps: number,
): AudioReactiveTransient[] {
  if (!Number.isFinite(fps) || fps <= 0 || item.durationInFrames <= 0) return []

  const start = item.from
  const end = item.from + item.durationInFrames

  return (grid.transients ?? []).flatMap((transient) => {
    const timelineFrame = Math.round(transient.time * fps)
    if (timelineFrame < start || timelineFrame >= end) return []
    return [{
      frame: timelineFrame - start,
      index: transient.index,
      strength: clamp01(transient.strength),
      low: clamp01(transient.low),
      mid: clamp01(transient.mid),
      high: clamp01(transient.high),
    }]
  })
}

/**
 * Evaluate one binding against sparse Beat This evidence. The authored/keyframed
 * value is deliberately not part of this function: callers compose its delta
 * onto the normal property path, so audio reaction never replaces edit state.
 */
export function evaluateAudioReactiveBinding(
  state: AudioReactiveState | undefined,
  binding: AudioReactiveBinding,
  relativeFrame: number,
): AudioReactiveFrameState {
  const rest: AudioReactiveFrameState = {
    pulse: 0,
    delta: 0,
    sourceStrength: 0,
    beatFrame: null,
    downbeat: false,
  }
  if (!state?.enabled || !binding.enabled) return rest

  const threshold = clamp01(binding.threshold)
  const sensitivity = Math.max(0, binding.sensitivity)
  const attackFrames = Math.max(0, Math.round(binding.attackFrames))
  const releaseFrames = Math.max(1, Math.round(binding.releaseFrames))
  const everyNthBeat = Math.max(1, Math.round(binding.everyNthBeat))
  // `attackFrames` is an optional visual lead-in. Sparse event positions are
  // known ahead of time, so a non-zero value should anticipate the hit rather
  // than make the picture react late after the audio transient.
  const earliestFrame = relativeFrame - releaseFrames
  const latestFrame = relativeFrame + attackFrames
  const direction = binding.invert ? -1 : 1
  let winner = rest

  const considerEvent = (
    frame: number,
    index: number,
    sourceStrength: number,
    downbeat: boolean,
  ) => {
    if (index % everyNthBeat !== 0) return

    const strength = clamp01(sourceStrength)
    if (strength < threshold) return

    const elapsed = relativeFrame - frame
    if (elapsed < -attackFrames || elapsed > releaseFrames) return

    const envelope =
      elapsed < 0 && attackFrames > 0
        ? clamp01((attackFrames + elapsed) / attackFrames)
        : Math.exp((-4 * Math.max(0, elapsed)) / releaseFrames)
    const gatedStrength = binding.useStrength
      ? clamp01(((strength - threshold) / Math.max(0.001, 1 - threshold)) * sensitivity)
      : clamp01(sensitivity)
    const pulse = clamp01(envelope * gatedStrength)
    if (pulse <= winner.pulse) return

    winner = {
      pulse,
      delta: clampDelta(binding.amount * pulse * direction, binding),
      sourceStrength: strength,
      beatFrame: frame,
      downbeat,
    }
  }

  if (binding.driver === 'beat' || binding.driver === 'downbeat') {
    const beats = state.beats
    let index = lowerBoundFrame(beats, earliestFrame)
    for (; index < beats.length; index += 1) {
      const beat = beats[index]!
      if (beat.frame > latestFrame) break
      if (binding.driver === 'downbeat' && !beat.downbeat) continue
      considerEvent(beat.frame, beat.index, beat.strength, beat.downbeat)
    }
    return winner
  }

  const transients = state.transients ?? []
  let index = lowerBoundFrame(transients, earliestFrame)
  for (; index < transients.length; index += 1) {
    const transient = transients[index]!
    if (transient.frame > latestFrame) break
    const strength =
      binding.driver === 'audio'
        ? transient.strength
        : binding.driver === 'low'
          ? transient.low
          : binding.driver === 'mid'
            ? transient.mid
            : transient.high
    considerEvent(transient.frame, transient.index, strength, false)
  }

  return winner
}

export function applyAudioReactiveEffectParamValue(
  baseValue: number,
  state: AudioReactiveState | undefined,
  relativeFrame: number,
  target: { effectId: string; gpuEffectType: string; paramKey: string },
): number {
  if (!state?.enabled) return baseValue

  let value = baseValue
  for (const binding of state.bindings) {
    if (
      !binding.enabled ||
      binding.target.kind !== 'effect-param' ||
      binding.target.effectId !== target.effectId ||
      binding.target.gpuEffectType !== target.gpuEffectType ||
      binding.target.paramKey !== target.paramKey
    ) continue
    value += evaluateAudioReactiveBinding(state, binding, relativeFrame).delta
  }
  return value
}

export function applyAudioReactiveTransform(
  transform: ResolvedTransform,
  state: AudioReactiveState | undefined,
  relativeFrame: number,
  frameWidth: number,
  frameHeight: number,
): ResolvedTransform {
  if (!hasEnabledAudioReactiveBindings(state)) return transform

  let x = transform.x
  let y = transform.y
  let width = transform.width
  let height = transform.height
  let rotation = transform.rotation
  let opacity = transform.opacity
  let shakeX = 0
  let shakeY = 0
  let shakeRotation = 0

  for (const binding of state!.bindings) {
    if (!binding.enabled) continue
    const evaluated = evaluateAudioReactiveBinding(state, binding, relativeFrame)
    if (evaluated.pulse <= 0) continue

    if (binding.target.kind === 'transform') {
      switch (binding.target.property) {
        case 'scale': {
          const factor = Math.max(0.01, 1 + evaluated.delta)
          width *= factor
          height *= factor
          break
        }
        case 'x': x += evaluated.delta; break
        case 'y': y += evaluated.delta; break
        case 'rotation': rotation += evaluated.delta; break
        case 'opacity': opacity = clamp01(opacity + evaluated.delta); break
      }
      continue
    }

    if (binding.target.kind === 'transform-shake') {
      // Keep the full control range useful: Medium should read clearly on a
      // 1080p frame without turning into short-form-video chaos. The preset
      // uses only part of this bounded range, while Amount=1 remains modest.
      const maxShakePx = Math.max(0, Math.min(frameWidth, frameHeight) * 0.012)
      const intensity = Math.min(1, Math.abs(evaluated.delta))
      const seedBase = (evaluated.beatFrame ?? 0) * 17 + Math.round(relativeFrame) * 0.73
      shakeX += hashNoise(seedBase + 11) * maxShakePx * intensity
      shakeY += hashNoise(seedBase + 29) * maxShakePx * intensity
      shakeRotation += hashNoise(seedBase + 47) * 0.45 * intensity
    }
  }

  return {
    ...transform,
    x: x + shakeX,
    y: y + shakeY,
    width,
    height,
    rotation: rotation + shakeRotation,
    opacity,
  }
}
