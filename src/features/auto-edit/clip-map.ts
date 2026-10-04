import type { MediaMetadata } from '@/types/storage'
import type { ClipMap, ClipSource } from './types'
import {
  importSceneDetection,
  readAiOutput,
  saveScenes,
  saveSceneReview,
  SCENE_DETECTOR_VERSION,
} from './deps/analysis-contract'
import { resolveMediaUrl } from './deps/editor-runtime-contract'

const FALLBACK_VIDEO_FPS = 30
const MIN_AUTO_EDIT_SHOT_SECONDS = 0.18
const HISTOGRAM_FALLBACK_INTERVAL_MS = 250

// Adaptive per-frame classification is more reliable for music-video motion
// and has source-frame timestamps; never silently invoke the large VLM verifier.
export function isCurrentAutoEditSceneCache(data: {
  method: string
  detectorVersion: number
  sampleIntervalMs?: number
  verificationModel?: string
}): boolean {
  if (data.detectorVersion !== SCENE_DETECTOR_VERSION || data.verificationModel) return false
  return data.method === 'adaptive' ||
    (data.method === 'histogram' && data.sampleIntervalMs === HISTOGRAM_FALLBACK_INTERVAL_MS)
}

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
  reviewedRanges: Readonly<Record<string, { start: number; end: number }>> = {},
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

    const shotId = `${media.id}:shot:${index + 1}`
    const review = reviewedRanges[shotId]
    const reviewed = review && Number.isFinite(review.start) && Number.isFinite(review.end) &&
      review.start >= boundary.time && review.end <= next.time &&
      review.end - review.start >= MIN_AUTO_EDIT_SHOT_SECONDS
      ? review
      : null
    return [
      {
        id: shotId,
        sourceId: media.id,
        start: reviewed?.start ?? boundary.time,
        end: reviewed?.end ?? next.time,
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

export type ReviewedShotEdit =
  | { kind: 'trim'; shotId: string; start: number; end: number }
  | { kind: 'reset-trim'; shotId: string }
  | { kind: 'merge-left'; shotId: string }
  | { kind: 'split'; shotId: string; time: number }
  | { kind: 'reset-scenes' }

/**
 * Human corrections live alongside raw detector cuts, not inside the video.
 * A source revision/detector change naturally invalidates the reviewed cache.
 */
export async function reviewClipSourceShots(
  media: AutoEditMedia,
  action: ReviewedShotEdit,
): Promise<ClipSource> {
  const envelope = await readAiOutput(media.id, 'scenes')
  if (!envelope || !isCurrentAutoEditSceneCache(envelope.data)) {
    throw new Error('Detect the source before editing its shot boundaries.')
  }
  if (action.kind === 'reset-scenes') {
    await saveSceneReview(media.id, undefined)
    return buildClipSourceFromSceneCuts(media, envelope.data.cuts)
  }

  const cuts = [...(envelope.data.review?.cuts ?? envelope.data.cuts)]
  const ranges = { ...envelope.data.review?.ranges }
  const rawSource = buildClipSourceFromSceneCuts(media, cuts)
  const index = rawSource.shots.findIndex((shot) => shot.id === action.shotId)
  const shot = rawSource.shots[index]
  if (!shot) throw new Error('This shot no longer matches the current source revision.')
  const tolerance = 1 / Math.max(1, media.fps || FALLBACK_VIDEO_FPS)

  if (action.kind === 'trim') {
    if (!Number.isFinite(action.start) || !Number.isFinite(action.end) ||
      action.start < shot.start - tolerance || action.end > shot.end + tolerance ||
      action.end - action.start < MIN_AUTO_EDIT_SHOT_SECONDS) {
      throw new Error('Keep the selected In/Out range inside this scene.')
    }
    const start = Math.max(shot.start, action.start)
    const end = Math.min(shot.end, action.end)
    if (end - start < MIN_AUTO_EDIT_SHOT_SECONDS) {
      throw new Error('This shot is too short after trimming.')
    }
    ranges[action.shotId] = { start, end }
  } else if (action.kind === 'reset-trim') {
    delete ranges[action.shotId]
  } else if (action.kind === 'merge-left') {
    if (index === 0) throw new Error('The first shot has no previous cut to merge.')
    cuts.splice(index - 1, 1)
    // IDs currently encode the ordinal shot index. Keep unrelated later trims
    // attached to their actual media segment after removing a boundary.
    for (const [key, range] of Object.entries(ranges)) {
      const n = Number(key.slice(`${media.id}:shot:`.length))
      if (!key.startsWith(`${media.id}:shot:`) || !Number.isInteger(n)) continue
      delete ranges[key]
      if (n < index || n === index || n === index + 1) {
        if (n < index) ranges[key] = range
      } else {
        ranges[`${media.id}:shot:${n - 1}`] = range
      }
    }
  } else if (action.kind === 'split') {
    if (!Number.isFinite(action.time) ||
      action.time - shot.start < MIN_AUTO_EDIT_SHOT_SECONDS ||
      shot.end - action.time < MIN_AUTO_EDIT_SHOT_SECONDS) {
      throw new Error('Move the Source playhead inside this shot before splitting.')
    }
    cuts.splice(index, 0, {
      time: action.time,
      type: 'cut',
      score: 100,
      confidence: 1,
      metrics: { kind: 'manual' },
    })
    const shifted: typeof ranges = {}
    for (const [key, range] of Object.entries(ranges)) {
      const n = Number(key.slice(`${media.id}:shot:`.length))
      if (!key.startsWith(`${media.id}:shot:`) || !Number.isInteger(n)) continue
      if (n !== index + 1) shifted[`${media.id}:shot:${n > index + 1 ? n + 1 : n}`] = range
    }
    Object.keys(ranges).forEach((key) => delete ranges[key])
    Object.assign(ranges, shifted)
  }

  await saveSceneReview(media.id, {
    cuts: action.kind === 'merge-left' || action.kind === 'split'
      ? cuts
      : envelope.data.review?.cuts,
    ranges,
  })
  return buildClipSourceFromSceneCuts(media, cuts, ranges)
}

async function loadCachedCuts(mediaId: string): Promise<{
  cuts: SceneCutLike[]
  ranges: Record<string, { start: number; end: number }>
} | null> {
  const envelope = await readAiOutput(mediaId, 'scenes').catch(() => undefined)
  if (!envelope || !isCurrentAutoEditSceneCache(envelope.data)) return null
  return {
    cuts: envelope.data.review?.cuts ?? envelope.data.cuts,
    ranges: envelope.data.review?.ranges ?? {},
  }
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
    let method: 'adaptive' | 'histogram' = 'adaptive'
    let cuts: Awaited<ReturnType<typeof detectScenes>>
    const onProgress = (progress: {percent: number}) => onAnalysisProgress?.(progress.percent)
    try {
      cuts = await detectScenes(video, {
        method: 'adaptive',
        // The deterministic frame analyzer needs no AI model download.
        verificationModel: null,
        mediaId: media.id,
        sourceFps: media.fps || FALLBACK_VIDEO_FPS,
        signal,
        onProgress,
      })
    } catch (error) {
      if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        throw error
      }
      // Unsupported codecs/WebCodecs: keep footage usable via the existing
      // fast histogram detector; cache the actual method, not the desired one.
      method = 'histogram'
      cuts = await detectScenes(video, {
        method: 'histogram',
        sampleIntervalMs: HISTOGRAM_FALLBACK_INTERVAL_MS,
        verificationModel: null,
        mediaId: media.id,
        sourceFps: media.fps || FALLBACK_VIDEO_FPS,
        signal,
        onProgress,
      })
    }

    // An empty result is valid: one continuous shot. Persist detector revision
    // and exact method so reopening never silently mixes old/coarse timings.
    await saveScenes({
      mediaId: media.id,
      service: `scene-detect-${method}`,
      model: method,
      method,
      detectorVersion: SCENE_DETECTOR_VERSION,
      sampleIntervalMs: method === 'histogram' ? HISTOGRAM_FALLBACK_INTERVAL_MS : undefined,
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
      cachedCuts?.cuts ??
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

    sources.push(buildClipSourceFromSceneCuts(media, cuts, cachedCuts?.ranges))
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
