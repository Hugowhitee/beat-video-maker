/**
 * Per-media scene-detection results.
 *
 * Stored at `media/{mediaId}/cache/ai/scenes.json` as an {@link AiOutput}
 * envelope. Scene cuts are a property of the source media (not the timeline
 * clip), so caching by `mediaId` survives trim/split edits.
 *
 * Detection parameters (method, sample interval, verification model) are
 * persisted in the envelope so consumers can skip the expensive recompute
 * when the requested parameters match, and re-run when they don't.
 */

import type { SceneCut } from '@/infrastructure/analysis/scene-detection-types'
import { createLogger } from '@/shared/logging/logger'

import { writeAiOutput, readAiOutput, deleteAiOutput } from './ai-outputs'
import type { ScenesPayload, SceneCutPayload } from './ai-outputs'

const logger = createLogger('WorkspaceFS:Scenes')

export interface SavedScenes {
  method: 'histogram' | 'adaptive'
  detectorVersion: number
  sampleIntervalMs?: number
  verificationModel?: string
  cuts: SceneCut[]
  review?: {
    cuts?: SceneCut[]
    ranges?: Record<string, { start: number; end: number }>
  }
}

interface SaveScenesInput extends SavedScenes {
  mediaId: string
  /** Stable provider id (e.g. `"scene-detect-histogram"`, `"scene-detect-adaptive"`). */
  service: string
  /** Detector/model identifier — for histogram this is just `"histogram"`. */
  model: string
}

function cutsToPayload(cuts: SceneCut[]): SceneCutPayload[] {
  return cuts.map((cut) => ({
    time: cut.time,
    score: cut.score,
    confidence: cut.confidence,
    type: cut.type,
    metrics: cut.metrics,
    verified: cut.verified,
  }))
}

export async function saveScenes(input: SaveScenesInput): Promise<SavedScenes> {
  try {
    const payload: ScenesPayload = {
      method: input.method,
      detectorVersion: input.detectorVersion,
      sampleIntervalMs: input.sampleIntervalMs,
      verificationModel: input.verificationModel,
      cuts: cutsToPayload(input.cuts),
      review: input.review && {
        cuts: input.review.cuts && cutsToPayload(input.review.cuts),
        ranges: input.review.ranges,
      },
    }
    await writeAiOutput({
      mediaId: input.mediaId,
      kind: 'scenes',
      service: input.service,
      model: input.model,
      params: {
        method: input.method,
        detectorVersion: input.detectorVersion,
        sampleIntervalMs: input.sampleIntervalMs ?? null,
        verificationModel: input.verificationModel ?? null,
      },
      data: payload,
    })
    return {
      method: input.method,
      detectorVersion: input.detectorVersion,
      sampleIntervalMs: input.sampleIntervalMs,
      verificationModel: input.verificationModel,
      cuts: input.cuts,
      review: input.review,
    }
  } catch (error) {
    logger.error(`saveScenes(${input.mediaId}) failed`, error)
    throw new Error(`Failed to save scenes: ${input.mediaId}`)
  }
}


/** Store non-destructive manual review edits without modifying detector evidence. */
export async function saveSceneReview(
  mediaId: string,
  review: ScenesPayload['review'],
): Promise<void> {
  const source = await readAiOutput(mediaId, 'scenes')
  if (!source) throw new Error('Detect this footage before reviewing cuts')
  await writeAiOutput({
    mediaId,
    kind: 'scenes',
    service: source.service,
    model: source.model,
    params: source.params,
    data: { ...source.data, review },
  })
}

export async function deleteScenes(mediaId: string): Promise<void> {
  try {
    await deleteAiOutput(mediaId, 'scenes')
  } catch (error) {
    logger.error(`deleteScenes(${mediaId}) failed`, error)
    throw new Error(`Failed to delete scenes: ${mediaId}`)
  }
}
