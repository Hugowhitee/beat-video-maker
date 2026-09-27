import type { BeatReactiveSettings } from '@/types/beatvideo'
import type { ResolvedTransform } from '@/types/transform'

export interface BeatReactiveFrameState {
  pulse: number
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

/**
 * Evaluate one sparse, frame-rate-independent beat envelope.
 *
 * A threshold gates detector evidence rather than changing BPM. The strongest
 * overlapping hit wins, so dense grids do not stack into runaway zoom/flash.
 */
export function evaluateBeatReactiveFrame(
  settings: BeatReactiveSettings | undefined,
  relativeFrame: number,
): BeatReactiveFrameState {
  const rest: BeatReactiveFrameState = {
    pulse: 0,
    sourceStrength: 0,
    beatFrame: null,
    downbeat: false,
  }
  if (!settings?.enabled || settings.beats.length === 0) return rest

  const threshold = clamp01(settings.threshold)
  const releaseFrames = Math.max(1, Math.round(settings.releaseFrames))
  let winner = rest

  for (const beat of settings.beats) {
    if (settings.downbeatsOnly && !beat.downbeat) continue
    const strength = clamp01(beat.strength)
    if (strength < threshold) continue

    const elapsed = relativeFrame - beat.frame
    if (elapsed < 0 || elapsed > releaseFrames) continue

    // Immediate attack, smooth musical decay. Keep detector strength audible in
    // the motion while the threshold only decides whether a hit may trigger.
    const decay = Math.exp((-4 * elapsed) / releaseFrames)
    const downbeatBoost = beat.downbeat ? Math.max(1, settings.downbeatBoost) : 1
    const pulse = clamp01(decay * strength * downbeatBoost)
    if (pulse <= winner.pulse) continue

    winner = {
      pulse,
      sourceStrength: strength,
      beatFrame: beat.frame,
      downbeat: beat.downbeat,
    }
  }

  return winner
}

/**
 * Add a restrained beat punch after ordinary keyframes/procedural motion.
 * Shake is deterministic and deliberately bounded so it reads as impact rather
 * than handheld-camera noise.
 */
export function applyBeatReactiveTransform(
  transform: ResolvedTransform,
  settings: BeatReactiveSettings | undefined,
  relativeFrame: number,
  frameWidth: number,
  frameHeight: number,
): ResolvedTransform {
  const state = evaluateBeatReactiveFrame(settings, relativeFrame)
  if (!settings?.enabled || state.pulse <= 0) return transform

  const zoom = Math.max(0, Math.min(0.12, settings.zoom)) * state.pulse
  const scale = 1 + zoom
  const shake = clamp01(settings.shake) * state.pulse
  const maxShakePx = Math.max(0, Math.min(frameWidth, frameHeight) * 0.004)
  const seedBase = (state.beatFrame ?? 0) * 17 + Math.round(relativeFrame) * 0.73
  const dx = hashNoise(seedBase + 11) * maxShakePx * shake
  const dy = hashNoise(seedBase + 29) * maxShakePx * shake
  const dr = hashNoise(seedBase + 47) * 0.18 * shake

  return {
    ...transform,
    x: transform.x + dx,
    y: transform.y + dy,
    width: transform.width * scale,
    height: transform.height * scale,
    rotation: transform.rotation + dr,
  }
}
