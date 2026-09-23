import type { MusicMap } from './types'
import {
  BEAT_THIS_SAMPLE_RATE,
  type BeatThisBackend,
  type BeatThisRhythmResult,
} from './beatThisCore'
import { buildMusicMapFromRhythm } from './musicMap'
import {
  getMediaType,
  getOrDecodeAudio,
  resolveMediaUrl,
  useMediaLibraryStore,
} from './deps/freecut-contract'

export type MusicAnalysisPhase =
  | 'decode'
  | 'prepare'
  | 'model-download'
  | 'model-init'
  | 'features'
  | 'inference'
  | 'finalize'

export type MusicAnalysisProgress = {
  phase: MusicAnalysisPhase
  progress: number
  detail?: string
  overallProgress: number
}

export type MusicAnalysisOptions = {
  signal?: AbortSignal
  onProgress?: (progress: MusicAnalysisProgress) => void
}

export type MusicAnalysisResult = {
  musicMap: MusicMap
  rhythm: BeatThisRhythmResult
  warnings: string[]
}

type WorkerProgressMessage = {
  type: 'progress'
  phase: Exclude<MusicAnalysisPhase, 'decode' | 'prepare'>
  progress: number
  detail?: string
}

type WorkerWarningMessage = {
  type: 'warning'
  message: string
}

type WorkerResultMessage = {
  type: 'result'
  result: {
    bpm: number
    beats: number[]
    downbeats: number[]
    beatStrengths: number[]
    meter: number
    backend: BeatThisBackend
    energy: ArrayBuffer
    energyHopSeconds: number
  }
}

type WorkerErrorMessage = {
  type: 'error'
  message: string
}

type BeatThisWorkerMessage =
  | WorkerProgressMessage
  | WorkerWarningMessage
  | WorkerResultMessage
  | WorkerErrorMessage

const PHASE_RANGES: Record<
  MusicAnalysisPhase,
  { start: number; end: number }
> = {
  decode: { start: 0, end: 0.14 },
  prepare: { start: 0.14, end: 0.2 },
  'model-download': { start: 0.2, end: 0.48 },
  'model-init': { start: 0.48, end: 0.55 },
  features: { start: 0.55, end: 0.76 },
  inference: { start: 0.76, end: 0.96 },
  finalize: { start: 0.96, end: 1 },
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function reportProgress(
  options: MusicAnalysisOptions,
  phase: MusicAnalysisPhase,
  progress: number,
  detail?: string,
) {
  const clamped = clamp01(progress)
  const range = PHASE_RANGES[phase]
  options.onProgress?.({
    phase,
    progress: clamped,
    detail,
    overallProgress: range.start + (range.end - range.start) * clamped,
  })
}

function throwIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) {
    throw new DOMException('Music analysis aborted.', 'AbortError')
  }
}

function downmixToMono(buffer: AudioBuffer): Float32Array {
  const output = new Float32Array(buffer.length)
  const channelCount = Math.max(1, buffer.numberOfChannels)

  for (let channel = 0; channel < channelCount; channel += 1) {
    const data = buffer.getChannelData(channel)
    for (let index = 0; index < output.length; index += 1) {
      output[index]! += (data[index] ?? 0) / channelCount
    }
  }

  return output
}

async function renderMonoAtBeatThisRate(
  buffer: AudioBuffer,
  signal: AbortSignal | undefined,
): Promise<Float32Array> {
  throwIfAborted(signal)

  if (buffer.sampleRate === BEAT_THIS_SAMPLE_RATE) {
    return downmixToMono(buffer)
  }

  const frameCount = Math.max(
    1,
    Math.round(buffer.duration * BEAT_THIS_SAMPLE_RATE),
  )
  const context = new OfflineAudioContext(
    1,
    frameCount,
    BEAT_THIS_SAMPLE_RATE,
  )
  const source = context.createBufferSource()
  source.buffer = buffer
  source.connect(context.destination)
  source.start()

  const rendered = await context.startRendering()
  throwIfAborted(signal)
  return Float32Array.from(rendered.getChannelData(0))
}

function validateMediaForMusicAnalysis(mediaId: string) {
  const media = useMediaLibraryStore.getState().mediaById[mediaId]
  if (!media) {
    throw new Error('The selected beat is no longer in the media library.')
  }

  const mediaType = getMediaType(media.mimeType)
  if (mediaType !== 'audio' && mediaType !== 'video') {
    throw new Error('Beat analysis requires an audio file or a video with audio.')
  }

  if (mediaType === 'video' && !media.audioCodec) {
    throw new Error('The selected video has no detectable audio track.')
  }

  return media
}

async function runBeatThisWorker(
  samples: Float32Array,
  options: MusicAnalysisOptions,
): Promise<{ rhythm: BeatThisRhythmResult; warnings: string[] }> {
  throwIfAborted(options.signal)

  const worker = new Worker(new URL('./beatThis.worker.ts', import.meta.url), {
    type: 'module',
    name: 'beatvideo-beat-this',
  })
  const warnings: string[] = []

  return new Promise((resolve, reject) => {
    let settled = false

    const cleanup = () => {
      options.signal?.removeEventListener('abort', onAbort)
      worker.removeEventListener('message', onMessage)
      worker.removeEventListener('error', onError)
      worker.terminate()
    }

    const rejectOnce = (error: Error | DOMException) => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }

    const resolveOnce = (rhythm: BeatThisRhythmResult) => {
      if (settled) return
      settled = true
      cleanup()
      resolve({ rhythm, warnings })
    }

    const onAbort = () => {
      try {
        worker.postMessage({ type: 'dispose' })
      } catch {
        // Termination below is authoritative.
      }
      rejectOnce(new DOMException('Music analysis aborted.', 'AbortError'))
    }

    const onError = (event: ErrorEvent) => {
      rejectOnce(new Error(event.message || 'Beat This worker failed.'))
    }

    const onMessage = (event: MessageEvent<BeatThisWorkerMessage>) => {
      const message = event.data

      if (message.type === 'progress') {
        reportProgress(
          options,
          message.phase,
          message.progress,
          message.detail,
        )
        return
      }

      if (message.type === 'warning') {
        warnings.push(message.message)
        return
      }

      if (message.type === 'error') {
        rejectOnce(new Error(message.message))
        return
      }

      const rhythm: BeatThisRhythmResult = {
        ...message.result,
        energy: new Float32Array(message.result.energy),
      }
      resolveOnce(rhythm)
    }

    options.signal?.addEventListener('abort', onAbort, { once: true })
    worker.addEventListener('message', onMessage)
    worker.addEventListener('error', onError)

    const transferable = samples.buffer as ArrayBuffer
    worker.postMessage({ type: 'analyze', samples: transferable }, [transferable])
  })
}

export async function analyzeMusicMedia(
  mediaId: string,
  options: MusicAnalysisOptions = {},
): Promise<MusicAnalysisResult> {
  const media = validateMediaForMusicAnalysis(mediaId)
  throwIfAborted(options.signal)

  reportProgress(options, 'decode', 0, 'Preparing beat audio')
  const sourceUrl = await resolveMediaUrl(mediaId)
  if (!sourceUrl) {
    throw new Error('The beat source could not be opened.')
  }

  const decoded = await getOrDecodeAudio(mediaId, sourceUrl)
  throwIfAborted(options.signal)
  reportProgress(options, 'decode', 1, 'Audio decoded')

  reportProgress(options, 'prepare', 0, 'Preparing rhythm input')
  const samples = await renderMonoAtBeatThisRate(decoded, options.signal)
  throwIfAborted(options.signal)
  reportProgress(options, 'prepare', 1, 'Rhythm input ready')

  const { rhythm, warnings } = await runBeatThisWorker(samples, options)
  throwIfAborted(options.signal)

  const duration = Number.isFinite(media.duration) && media.duration > 0
    ? media.duration
    : decoded.duration
  const musicMap = buildMusicMapFromRhythm(rhythm, duration)
  reportProgress(options, 'finalize', 1, 'Beat map ready')

  return { musicMap, rhythm, warnings }
}
