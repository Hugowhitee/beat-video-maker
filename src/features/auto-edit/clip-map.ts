import type { MediaMetadata } from '@/types/storage'
import type { ClipMap, ClipSource } from './types'
import {
  importSceneDetection,
  readAiOutput,
  saveScenes,
  SCENE_DETECTOR_VERSION,
} from './deps/analysis-contract'
import { resolveMediaUrl } from './deps/editor-runtime-contract'

const FALLBACK_VIDEO_FPS = 30
const MIN_AUTO_EDIT_SHOT_SECONDS = 0.18

type AutoEditMedia = Pick<
  MediaMetadata,
  'id' | 'fileName' | 'duration' | 'fps' | 'mimeType'
>

interface SceneCutLike {
  time: number
  confidence?: number
}

export interface ClipMapBuildProgress {
  mediaId: string
  fileName: string
  completedSources: number
  totalSources: number
  phase: 'cache' | 'analyzing' | 'ready'
  analysisPercent?: number
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function uniqueUsableCuts(cuts: readonly SceneCutLike[], duration: number) {
  const sorted = [...cuts]
    .filter(
      (cut) =>
        Number.isFinite(cut.time) &&
        cut.time > MIN_AUTO_EDIT_SHOT_SECONDS &&
        cut.time < duration - MIN_AUTO_EDIT_SHOT_SECONDS,
    )
    .sort((left, right) => left.time - right.time)

  const accepted: SceneCutLike[] = []
  for (const cut of sorted) {
    const previousTime = accepted.at(-1)?.time ?? 0
    if (cut.time - previousTime < MIN_AUTO_EDIT_SHOT_SECONDS) continue
    accepted.push(cut)
  }

  if (
    accepted.length > 0 &&
    duration - (accepted.at(-1)?.time ?? 0) < MIN_AUTO_EDIT_SHOT_SECONDS
  ) {
    accepted.pop()
  }
  return accepted
}

export function buildClipSourceFromSceneCuts(
  media: AutoEditMedia,
  cuts: readonly SceneCutLike[],
): ClipSource {
  if (!(media.duration > 0)) {
    throw new Error(`Footage "${media.fileName}" has no usable duration.`)
  }

  const usableCuts = uniqueUsableCuts(cuts, media.duration)
  const boundaries = [
    { time: 0, confidence: 1 },
    ...usableCuts.map((cut) => ({
      time: cut.time,
      confidence: clamp01(cut.confidence ?? 0.5),
    })),
    { time: media.duration, confidence: 1 },
  ]

  const shots = boundaries.slice(0, -1).flatMap((boundary, index) => {
    const next = boundaries[index + 1]
    if (!next || next.time <= boundary.time) return []

    return [
      {
        id: `${media.id}:shot:${index + 1}`,
        sourceId: media.id,
        start: boundary.time,
        end: next.time,
        motion: 0.5,
        quality: 0.5,
        motionEvidence: 'unavailable' as const,
        qualityEvidence: 'unavailable' as const,
        boundaryKind: index === 0 ? ('source-start' as const) : ('hard-cut' as const),
        boundaryConfidence: boundary.confidence,
      },
    ]
  })

  return {
    id: media.id,
    name: media.fileName,
    duration: media.duration,
    role: 'footage',
    shots,
  }
}

async function loadCachedCuts(mediaId: string): Promise<SceneCutLike[] | null> {
  const envelope = await readAiOutput(mediaId, 'scenes').catch(() => undefined)
  if (!envelope) return null
  return envelope.data.cuts
}

async function loadVideoMetadata(
  media: AutoEditMedia,
  signal: AbortSignal | undefined,
): Promise<HTMLVideoElement> {
  if (typeof document === 'undefined') {
    throw new Error('Scene analysis requires a browser environment.')
  }

  const url = await resolveMediaUrl(media.id)
  const video = document.createElement('video')
  video.src = url
  video.muted = true
  video.preload = 'auto'

  await new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }

    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort)
      video.onloadedmetadata = null
      video.onerror = null
    }
    const onAbort = () => {
      cleanup()
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    video.onloadedmetadata = () => {
      cleanup()
      resolve()
    }
    video.onerror = () => {
      cleanup()
      reject(new Error(`Could not load footage "${media.fileName}" for scene analysis.`))
    }
  })

  return video
}

async function detectCutsForMedia(params: {
  media: AutoEditMedia
  signal?: AbortSignal
  onAnalysisProgress?: (percent: number) => void
}): Promise<SceneCutLike[]> {
  const { media, signal, onAnalysisProgress } = params
  const video = await loadVideoMetadata(media, signal)

  try {
    const { detectScenes } = await importSceneDetection()
    const cuts = await detectScenes(video, {
      method: 'histogram',
      mediaId: media.id,
      sourceFps: media.fps || FALLBACK_VIDEO_FPS,
      signal,
      onProgress: (progress) => onAnalysisProgress?.(progress.percent),
    })

    // Save even an empty result: "one continuous shot" is useful evidence and
    // should not force a repeat analysis every time Auto Arrange is pressed.
    await saveScenes({
      mediaId: media.id,
      service: 'scene-detect-histogram',
      model: 'histogram',
      method: 'histogram',
      detectorVersion: SCENE_DETECTOR_VERSION,
      sampleIntervalMs: 250,
      cuts,
    })

    return cuts
  } finally {
    video.removeAttribute('src')
    video.load()
  }
}

export async function buildClipMapForMedia(params: {
  media: readonly AutoEditMedia[]
  signal?: AbortSignal
  analyzeMissing?: boolean
  onProgress?: (progress: ClipMapBuildProgress) => void
}): Promise<ClipMap> {
  const footage = params.media.filter(
    (media) => media.mimeType.startsWith('video/') && media.duration > 0,
  )
  if (footage.length === 0) {
    throw new Error('Auto Arrange needs at least one imported video source.')
  }

  const sources: ClipSource[] = []
  for (let index = 0; index < footage.length; index++) {
    if (params.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }

    const media = footage[index]!
    const cachedCuts = await loadCachedCuts(media.id)
    params.onProgress?.({
      mediaId: media.id,
      fileName: media.fileName,
      completedSources: index,
      totalSources: footage.length,
      phase: 'cache',
    })

    const cuts =
      cachedCuts ??
      (params.analyzeMissing === false
        ? []
        : await detectCutsForMedia({
            media,
            signal: params.signal,
            onAnalysisProgress: (analysisPercent) =>
              params.onProgress?.({
                mediaId: media.id,
                fileName: media.fileName,
                completedSources: index,
                totalSources: footage.length,
                phase: 'analyzing',
                analysisPercent,
              }),
          }))

    sources.push(buildClipSourceFromSceneCuts(media, cuts))
    params.onProgress?.({
      mediaId: media.id,
      fileName: media.fileName,
      completedSources: index + 1,
      totalSources: footage.length,
      phase: 'ready',
      analysisPercent: 100,
    })
  }

  return { sources }
}
