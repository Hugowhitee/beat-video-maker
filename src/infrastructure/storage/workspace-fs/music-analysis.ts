/**
 * Source-level Beatvideo rhythm evidence.
 *
 * Stored at `media/{mediaId}/cache/ai/music-analysis.json`. Raw detector
 * evidence belongs to the source media; project-level Bar 1/BPM/drift edits
 * stay in Project.beatvideoMusic and are never written back into this cache.
 */

import type { MusicMap } from '@/types/beatvideo'
import type { MediaMetadata } from '@/types/storage'
import { createLogger } from '@/shared/logging/logger'
import {
  readAiOutput,
  writeAiOutput,
  type MusicAnalysisSourceFingerprint,
} from './ai-outputs'

const logger = createLogger('WorkspaceFS:MusicAnalysis')

export type BeatvideoMusicSourceMedia = Pick<
  MediaMetadata,
  'id' | 'contentHash' | 'fileSize' | 'fileLastModified' | 'duration' | 'mimeType'
>

export interface SavedBeatvideoMusicEvidence {
  mediaId: string
  analyzedAt: number
  analysisRevision: number
  sourceFingerprint: MusicAnalysisSourceFingerprint
  musicMap: MusicMap
  detectedBarOneTime: number | null
}

export function createBeatvideoMusicSourceFingerprint(
  media: BeatvideoMusicSourceMedia,
): MusicAnalysisSourceFingerprint {
  return {
    contentHash: media.contentHash,
    fileSize: media.fileSize,
    fileLastModified: media.fileLastModified,
    duration: media.duration,
    mimeType: media.mimeType,
  }
}

export function beatvideoMusicSourceFingerprintMatches(
  saved: MusicAnalysisSourceFingerprint,
  media: BeatvideoMusicSourceMedia,
): boolean {
  const current = createBeatvideoMusicSourceFingerprint(media)

  if (saved.contentHash && current.contentHash && saved.contentHash !== current.contentHash) {
    return false
  }
  if (saved.fileSize !== current.fileSize) return false
  if (saved.mimeType !== current.mimeType) return false
  if (Math.abs(saved.duration - current.duration) > 1e-6) return false
  if (
    saved.fileLastModified !== undefined &&
    current.fileLastModified !== undefined &&
    saved.fileLastModified !== current.fileLastModified
  ) {
    return false
  }
  return true
}

export async function loadBeatvideoMusicEvidence(
  media: BeatvideoMusicSourceMedia,
  analysisRevision: number,
): Promise<SavedBeatvideoMusicEvidence | undefined> {
  try {
    const envelope = await readAiOutput(media.id, 'music-analysis')
    if (!envelope) return undefined
    if (envelope.data.analysisRevision !== analysisRevision) return undefined
    if (!beatvideoMusicSourceFingerprintMatches(envelope.data.sourceFingerprint, media)) {
      return undefined
    }

    return {
      mediaId: media.id,
      analyzedAt: envelope.updatedAt,
      analysisRevision: envelope.data.analysisRevision,
      sourceFingerprint: envelope.data.sourceFingerprint,
      musicMap: envelope.data.musicMap,
      detectedBarOneTime: envelope.data.detectedBarOneTime,
    }
  } catch (error) {
    logger.warn('Could not read saved Beatvideo music analysis', {
      mediaId: media.id,
      error,
    })
    return undefined
  }
}

export async function saveBeatvideoMusicEvidence(input: {
  media: BeatvideoMusicSourceMedia
  analysisRevision: number
  musicMap: MusicMap
  detectedBarOneTime: number | null
}): Promise<SavedBeatvideoMusicEvidence> {
  const sourceFingerprint = createBeatvideoMusicSourceFingerprint(input.media)
  const envelope = await writeAiOutput({
    mediaId: input.media.id,
    kind: 'music-analysis',
    service: 'beatvideo-beat-this',
    model: 'beat-this',
    params: {
      analysisRevision: input.analysisRevision,
      sourceFingerprint,
    },
    data: {
      analysisRevision: input.analysisRevision,
      sourceFingerprint,
      musicMap: input.musicMap,
      detectedBarOneTime: input.detectedBarOneTime,
    },
  })

  return {
    mediaId: input.media.id,
    analyzedAt: envelope.updatedAt,
    analysisRevision: input.analysisRevision,
    sourceFingerprint,
    musicMap: input.musicMap,
    detectedBarOneTime: input.detectedBarOneTime,
  }
}
