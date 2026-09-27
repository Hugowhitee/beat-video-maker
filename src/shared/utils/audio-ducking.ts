import type { TimelineItem, TimelineTrack } from '@/types/timeline'

export const DUCKING_DEFAULT_ATTACK_SEC = 0.08
export const DUCKING_DEFAULT_RELEASE_SEC = 0.25

function dbToGain(db: number): number {
  return Math.pow(10, db / 20)
}

function sourceGainDbAtFrame(params: {
  frame: number
  startFrame: number
  endFrame: number
  duckDb: number
  attackFrames: number
  releaseFrames: number
}): number {
  const { frame, startFrame, endFrame, duckDb, attackFrames, releaseFrames } = params
  if (frame < startFrame || frame > endFrame + releaseFrames) return 0
  if (attackFrames > 0 && frame < startFrame + attackFrames) {
    return duckDb * ((frame - startFrame) / attackFrames)
  }
  if (frame <= endFrame) return duckDb
  if (releaseFrames <= 0) return 0
  return duckDb * (1 - (frame - endFrame) / releaseFrames)
}

/**
 * Resolve the live preview gain for one root-timeline item from other items that
 * carry audioDucking. This mirrors the export mixer's envelope rules.
 *
 * Nested/pre-composition ducking remains owned by the composition runtime; this
 * helper intentionally scopes itself to the canonical root timeline used by the
 * Beatvideo producer-tag workflow.
 */
export function resolveTimelineDuckingGain(params: {
  frame: number
  targetItemId: string
  items: readonly TimelineItem[]
  tracks: readonly TimelineTrack[]
  fps: number
}): number {
  const target = params.items.find((item) => item.id === params.targetItemId)
  if (!target) return 1

  const fps = Math.max(1, params.fps)
  let deepestDb = 0

  for (const source of params.items) {
    if (source.id === target.id) continue
    if (source.type !== 'audio' && source.type !== 'video') continue
    if (source.type === 'video' && source.embeddedAudioMuted) continue

    const sourceTrack = params.tracks.find((track) => track.id === source.trackId)
    if (!sourceTrack || sourceTrack.visible === false || sourceTrack.muted) continue

    const ducking = source.audioDucking
    if (!ducking || !(ducking.duckOthersDb < 0)) continue
    if (ducking.targetTrackIds && !ducking.targetTrackIds.includes(target.trackId)) continue

    const sourceDb = sourceGainDbAtFrame({
      frame: params.frame,
      startFrame: source.from,
      endFrame: source.from + source.durationInFrames,
      duckDb: ducking.duckOthersDb,
      attackFrames: (ducking.attackSec ?? DUCKING_DEFAULT_ATTACK_SEC) * fps,
      releaseFrames: (ducking.releaseSec ?? DUCKING_DEFAULT_RELEASE_SEC) * fps,
    })
    if (sourceDb < deepestDb) deepestDb = sourceDb
  }

  return deepestDb === 0 ? 1 : dbToGain(deepestDb)
}
