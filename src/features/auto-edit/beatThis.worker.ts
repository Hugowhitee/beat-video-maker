/// <reference lib="webworker" />

import FFT from 'fft.js'
import * as ort from 'onnxruntime-web/webgpu'
import {
  BEAT_THIS_BORDER_FRAMES,
  BEAT_THIS_CHUNK_FRAMES,
  BEAT_THIS_FILTERBANK_SHA256,
  BEAT_THIS_FILTERBANK_URL,
  BEAT_THIS_FPS,
  BEAT_THIS_HOP_LENGTH,
  BEAT_THIS_MEL_BINS,
  BEAT_THIS_MODEL_SHA256,
  BEAT_THIS_MODEL_URL,
  BEAT_THIS_N_FFT,
  BEAT_THIS_SAMPLE_RATE,
  buildSparseMelFilterbank,
  computeRmsEnvelope,
  consecutiveProbeBpms,
  getBeatThisFrameCount,
  getBeatThisWindowStarts,
  pickBeatFrames,
  projectMagnitudeToLogMel,
  summarizeRhythm,
  type BeatThisBackend,
} from './beatThisCore'

type AnalyzeMessage = {
  type: 'analyze'
  samples: ArrayBuffer
}

type DisposeMessage = {
  type: 'dispose'
}

type WorkerMessage = AnalyzeMessage | DisposeMessage

const MODEL_CACHE = 'beatvideo-rhythm-model-v1'
const EMPTY_LOGIT = -1_000
const FFT_SCALE = 1 / Math.sqrt(BEAT_THIS_N_FFT)

ort.env.logLevel = 'error'
ort.env.wasm.numThreads =
  typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated
    ? Math.max(1, Math.min(4, navigator.hardwareConcurrency || 1))
    : 1

let disposed = false
let activeSession: ort.InferenceSession | null = null

function post(message: Record<string, unknown>, transfer: Transferable[] = []) {
  self.postMessage(message, transfer)
}

function progress(phase: string, value: number, detail?: string) {
  post({
    type: 'progress',
    phase,
    progress: Math.max(0, Math.min(1, value)),
    detail,
  })
}

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

async function verifySha256(bytes: Uint8Array, expected: string, label: string) {
  const digestInput = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(digestInput).set(bytes)
  const digest = await crypto.subtle.digest('SHA-256', digestInput)
  const actual = toHex(digest)
  if (actual !== expected) {
    throw new Error(
      `${label} checksum mismatch. Expected ${expected.slice(0, 12)}…, got ${actual.slice(0, 12)}…`,
    )
  }
}

async function readResponseWithProgress(
  response: Response,
  phase: string,
  start: number,
  span: number,
) {
  const total = Number(response.headers.get('content-length') || 0)

  if (!response.body || !Number.isFinite(total) || total <= 0) {
    const bytes = new Uint8Array(await response.arrayBuffer())
    progress(phase, start + span)
    return bytes
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    if (!value) continue
    chunks.push(value)
    loaded += value.byteLength
    progress(
      phase,
      start + (loaded / total) * span,
      `${Math.round(loaded / 1_048_576)} / ${Math.round(total / 1_048_576)} MB`,
    )
  }

  const bytes = new Uint8Array(loaded)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

async function fetchPinnedAsset(
  url: string,
  expectedSha256: string,
  label: string,
  phaseStart: number,
  phaseSpan: number,
) {
  let cached: Response | undefined

  try {
    const cache = await caches.open(MODEL_CACHE)
    cached = (await cache.match(url)) ?? undefined
  } catch {
    cached = undefined
  }

  let response = cached
  if (!response) {
    response = await fetch(url, { cache: 'force-cache' })
    if (!response.ok) {
      throw new Error(`${label} download failed with HTTP ${response.status}.`)
    }

    try {
      const cache = await caches.open(MODEL_CACHE)
      await cache.put(url, response.clone())
    } catch {
      // Browser cache is only an optimization. Analysis remains functional
      // when storage quota/private mode prevents CacheStorage writes.
    }
  }

  const bytes = await readResponseWithProgress(
    response,
    'model-download',
    phaseStart,
    phaseSpan,
  )
  await verifySha256(bytes, expectedSha256, label)
  return bytes
}

async function loadAssets() {
  progress('model-download', 0, 'Loading Beat This model')

  const [filterbankBytes, modelBytes] = await Promise.all([
    fetchPinnedAsset(
      BEAT_THIS_FILTERBANK_URL,
      BEAT_THIS_FILTERBANK_SHA256,
      'Beat This mel filterbank',
      0,
      0.02,
    ),
    fetchPinnedAsset(
      BEAT_THIS_MODEL_URL,
      BEAT_THIS_MODEL_SHA256,
      'Beat This model',
      0.02,
      0.98,
    ),
  ])

  if (filterbankBytes.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) {
    throw new Error('Beat This mel filterbank byte length is invalid.')
  }

  const filterbank = new Float32Array(
    filterbankBytes.buffer,
    filterbankBytes.byteOffset,
    filterbankBytes.byteLength / Float32Array.BYTES_PER_ELEMENT,
  )

  return {
    filterbank: Float32Array.from(filterbank),
    modelBytes,
  }
}

async function createSession(modelBytes: Uint8Array) {
  const bytes = modelBytes.slice().buffer

  if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
    try {
      progress('model-init', 0.2, 'Starting WebGPU rhythm model')
      const session = await ort.InferenceSession.create(bytes, {
        executionProviders: ['webgpu'],
        graphOptimizationLevel: 'all',
      })
      return { session, backend: 'webgpu' as const }
    } catch (error) {
      post({
        type: 'warning',
        message: `WebGPU Beat This unavailable; using WASM instead: ${error instanceof Error ? error.message : String(error)}`,
      })
    }
  }

  progress('model-init', 0.55, 'Starting WASM rhythm model')
  const session = await ort.InferenceSession.create(bytes, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  })
  return { session, backend: 'wasm' as const }
}

function reflectIndex(index: number, sampleCount: number) {
  if (sampleCount <= 1) return 0

  let value = index
  while (value < 0 || value >= sampleCount) {
    if (value < 0) value = -value
    if (value >= sampleCount) value = 2 * sampleCount - 2 - value
  }
  return value
}

function computeLogMelSpectrogram(
  audio: Float32Array,
  denseFilterbank: Float32Array,
) {
  const frames = getBeatThisFrameCount(audio.length)
  const filterbank = buildSparseMelFilterbank(denseFilterbank)
  const spectrogram = new Float32Array(frames * BEAT_THIS_MEL_BINS)
  const fft = new FFT(BEAT_THIS_N_FFT)
  const frameInput = new Float64Array(BEAT_THIS_N_FFT)
  const spectrum = fft.createComplexArray()
  const magnitudes = new Float32Array(BEAT_THIS_N_FFT / 2 + 1)
  const mel = new Float32Array(BEAT_THIS_MEL_BINS)
  const pad = BEAT_THIS_N_FFT / 2

  for (let frame = 0; frame < frames; frame += 1) {
    const frameStart = frame * BEAT_THIS_HOP_LENGTH - pad

    for (let sample = 0; sample < BEAT_THIS_N_FFT; sample += 1) {
      const index = reflectIndex(frameStart + sample, audio.length)
      const window =
        0.5
        - 0.5 * Math.cos((2 * Math.PI * sample) / BEAT_THIS_N_FFT)
      frameInput[sample] = (audio[index] ?? 0) * window
    }

    fft.realTransform(spectrum, frameInput)

    for (let bin = 0; bin < magnitudes.length; bin += 1) {
      const real = Number(spectrum[2 * bin] ?? 0)
      const imaginary = Number(spectrum[2 * bin + 1] ?? 0)
      magnitudes[bin] = Math.hypot(real, imaginary) * FFT_SCALE
    }

    projectMagnitudeToLogMel(magnitudes, filterbank, mel)
    spectrogram.set(mel, frame * BEAT_THIS_MEL_BINS)

    if (frame % 128 === 0 || frame === frames - 1) {
      progress(
        'features',
        (frame + 1) / frames,
        `Analyzing audio features ${frame + 1} / ${frames}`,
      )
    }
  }

  return { spectrogram, frames }
}

function copyWindow(
  spectrogram: Float32Array,
  frames: number,
  start: number,
  output: Float32Array,
) {
  output.fill(0)

  for (let localFrame = 0; localFrame < BEAT_THIS_CHUNK_FRAMES; localFrame += 1) {
    const sourceFrame = start + localFrame
    if (sourceFrame < 0 || sourceFrame >= frames) continue

    const sourceStart = sourceFrame * BEAT_THIS_MEL_BINS
    const targetStart = localFrame * BEAT_THIS_MEL_BINS
    output.set(
      spectrogram.subarray(sourceStart, sourceStart + BEAT_THIS_MEL_BINS),
      targetStart,
    )
  }
}

function tensorDataAsFloat32(tensor: ort.Tensor) {
  const data = tensor.data
  if (data instanceof Float32Array) return data
  return Float32Array.from(data as ArrayLike<number>)
}

async function runModel(
  session: ort.InferenceSession,
  spectrogram: Float32Array,
  frames: number,
) {
  const starts = getBeatThisWindowStarts(frames)
  const beat = new Float32Array(frames).fill(EMPTY_LOGIT)
  const downbeat = new Float32Array(frames).fill(EMPTY_LOGIT)
  const window = new Float32Array(BEAT_THIS_CHUNK_FRAMES * BEAT_THIS_MEL_BINS)

  for (let reverseIndex = starts.length - 1; reverseIndex >= 0; reverseIndex -= 1) {
    const start = starts[reverseIndex] ?? -BEAT_THIS_BORDER_FRAMES
    copyWindow(spectrogram, frames, start, window)

    const input = new ort.Tensor(
      'float32',
      window,
      [1, BEAT_THIS_CHUNK_FRAMES, BEAT_THIS_MEL_BINS],
    )

    const outputs = await session.run({ spect: input })
    const beatWindow = outputs.beat
    const downbeatWindow = outputs.downbeat

    if (!beatWindow || !downbeatWindow) {
      input.dispose()
      throw new Error('Beat This model did not return beat/downbeat logits.')
    }

    const beatData = tensorDataAsFloat32(beatWindow)
    const downbeatData = tensorDataAsFloat32(downbeatWindow)
    const targetFrame = start + BEAT_THIS_BORDER_FRAMES
    const count = Math.max(
      0,
      Math.min(
        BEAT_THIS_CHUNK_FRAMES - 2 * BEAT_THIS_BORDER_FRAMES,
        frames - targetFrame,
      ),
    )

    if (count > 0) {
      beat.set(
        beatData.subarray(BEAT_THIS_BORDER_FRAMES, BEAT_THIS_BORDER_FRAMES + count),
        targetFrame,
      )
      downbeat.set(
        downbeatData.subarray(
          BEAT_THIS_BORDER_FRAMES,
          BEAT_THIS_BORDER_FRAMES + count,
        ),
        targetFrame,
      )
    }

    input.dispose()
    beatWindow.dispose()
    downbeatWindow.dispose()

    const completed = starts.length - reverseIndex
    progress(
      'inference',
      completed / Math.max(1, starts.length),
      `Tracking beats ${completed} / ${starts.length}`,
    )
  }

  return { beat, downbeat }
}

function nearestStrength(
  time: number,
  rawTimes: number[],
  rawStrengths: number[],
) {
  if (rawTimes.length === 0) return 0.5

  let bestIndex = 0
  let bestDistance = Math.abs((rawTimes[0] ?? time) - time)

  for (let index = 1; index < rawTimes.length; index += 1) {
    const distance = Math.abs((rawTimes[index] ?? time) - time)
    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = index
    }
  }

  return rawStrengths[bestIndex] ?? 0.5
}

async function analyze(audio: Float32Array) {
  if (audio.length < BEAT_THIS_SAMPLE_RATE) {
    throw new Error('Beat analysis needs at least one second of audio.')
  }

  progress('energy', 0.1, 'Measuring track energy')
  const envelope = computeRmsEnvelope(audio)
  const { filterbank, modelBytes } = await loadAssets()

  if (disposed) return

  progress('model-init', 0.05, 'Initializing Beat This')
  const runtime = await createSession(modelBytes)
  activeSession = runtime.session

  try {
    const { spectrogram, frames } = computeLogMelSpectrogram(audio, filterbank)
    const logits = await runModel(runtime.session, spectrogram, frames)

    progress('finalize', 0.3, 'Building musical grid')
    const picked = pickBeatFrames(logits.beat, logits.downbeat)
    const rawBeats = picked.beatFrames.map((frame) => frame / BEAT_THIS_FPS)
    const rawDownbeats = picked.downbeatFrames.map((frame) => frame / BEAT_THIS_FPS)
    const duration = audio.length / BEAT_THIS_SAMPLE_RATE
    const summary = summarizeRhythm(
      rawBeats,
      rawDownbeats,
      consecutiveProbeBpms(rawBeats, duration),
    )
    const beatStrengths = summary.beats.map((time) =>
      nearestStrength(time, rawBeats, picked.beatStrengths),
    )

    progress('finalize', 1, 'Music analysis complete')
    post(
      {
        type: 'result',
        result: {
          bpm: summary.bpm,
          beats: summary.beats,
          downbeats: summary.downbeats,
          beatStrengths,
          meter: summary.meter,
          backend: runtime.backend satisfies BeatThisBackend,
          energy: envelope.energy.buffer,
          energyHopSeconds: envelope.hopSeconds,
        },
      },
      [envelope.energy.buffer],
    )
  } finally {
    await runtime.session.release()
    if (activeSession === runtime.session) activeSession = null
  }
}

self.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
  const message = event.data

  if (message.type === 'dispose') {
    disposed = true
    void activeSession?.release()
    activeSession = null
    self.close()
    return
  }

  if (message.type === 'analyze') {
    disposed = false
    const audio = new Float32Array(message.samples)
    void analyze(audio).catch((error) => {
      if (disposed) return
      post({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      })
    })
  }
})
