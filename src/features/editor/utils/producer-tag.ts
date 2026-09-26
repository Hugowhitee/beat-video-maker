import type { MusicBeat } from '@/types/beatvideo'

export function resolveProducerTagRepeatFrames(params: {
  beats: readonly MusicBeat[]
  fps: number
  everyBars: number
  startFrame: number
  endFrame: number
  tagDurationInFrames: number
}): number[] {
  const fps = Math.max(1, params.fps)
  const everyBars = Math.max(1, Math.round(params.everyBars))
  const startFrame = Math.max(0, Math.round(params.startFrame))
  const tagDurationInFrames = Math.max(1, Math.round(params.tagDurationInFrames))
  const lastFullStart = Math.round(params.endFrame) - tagDurationInFrames
  if (lastFullStart < startFrame) return []

  return params.beats
    .filter((beat) => beat.downbeat)
    .sort((left, right) => left.time - right.time)
    .filter((_, index) => index % everyBars === 0)
    .map((beat) => Math.round(beat.time * fps))
    .filter((frame) => frame >= startFrame && frame <= lastFullStart)
    .filter((frame, index, frames) => index === 0 || frame !== frames[index - 1])
}
