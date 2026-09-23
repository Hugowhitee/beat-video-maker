/**
 * Beat This! browser runtime primitives.
 *
 * Beat/downbeat peak picking, chunk stitching geometry, BPM consensus, and
 * meter estimation follow the MIT-licensed Beat This!/Musetrical runtime
 * contracts. The neural model itself is loaded lazily by beatThis.worker.ts.
 */

export const BEAT_THIS_SAMPLE_RATE = 22_050
export const BEAT_THIS_N_FFT = 1_024
export const BEAT_THIS_HOP_LENGTH = 441
export const BEAT_THIS_FPS = 50
export const BEAT_THIS_MEL_BINS = 128
export const BEAT_THIS_LOG_MULTIPLIER = 1_000
export const BEAT_THIS_CHUNK_FRAMES = 1_500
export const BEAT_THIS_BORDER_FRAMES = 6

export const BEAT_THIS_MODEL_URL =
  'https://huggingface.co/musetric/beat-this-onnx/resolve/main/beat_this.onnx'
export const BEAT_THIS_FILTERBANK_URL =
  'https://huggingface.co/musetric/beat-this-onnx/resolve/main/mel-filterbank.bin'

export const BEAT_THIS_MODEL_SHA256 =
  '3472a3957f25f4c3a2d68b46ee4b784e065a8ebd46132796c1a6bdd817229253'
export const BEAT_THIS_FILTERBANK_SHA256 =
  '1ee975d96f44ccf2c3bfe37825c1c1f0b089f5703c7a12a84b1f0a3bce004533'

const PEAK_RADIUS = 3
const PEAK_THRESHOLD = 0
const DEDUPLICATE_WIDTH = 1
const MIN_BEATS = 2
const MIN_INTERVALS_FOR_IQR = 4
const DEFAULT_METER = 4
const MIN_PREFERRED_BPM = 60
const MAX_PREFERRED_BPM = 160

export type BeatThisBackend = 'webgpu' | 'wasm'

export type BeatThisRhythmResult = {
  bpm: number
  beats: number[]
  downbeats: number[]
  beatStrengths: number[]
  meter: number
  backend: BeatThisBackend
  energy: Float32Array
  energyHopSeconds: number
}

export type SparseMelFilterbank = {
  offsets: Uint32Array
  melIndices: Uint8Array
  weights: Float32Array
  bins: number
  melBins: number
}

export function getBeatThisFrameCount(sampleCount: number): number {
  return Math.floor(sampleCount / BEAT_THIS_HOP_LENGTH) + 1
}

export function getBeatThisWindowStarts(frames: number): number[] {
  const stride = BEAT_THIS_CHUNK_FRAMES - 2 * BEAT_THIS_BORDER_FRAMES
  const starts: number[] = []

  for (
    let start = -BEAT_THIS_BORDER_FRAMES;
    start < frames - BEAT_THIS_BORDER_FRAMES;
    start += stride
  ) {
    starts.push(start)
  }

  if (frames > stride && starts.length > 0) {
    starts[starts.length - 1] =
      frames - (BEAT_THIS_CHUNK_FRAMES - BEAT_THIS_BORDER_FRAMES)
  }

  return starts
}

export function buildSparseMelFilterbank(
  dense: Float32Array,
  bins = BEAT_THIS_N_FFT / 2 + 1,
  melBins = BEAT_THIS_MEL_BINS,
): SparseMelFilterbank {
  if (dense.length !== bins * melBins) {
    throw new Error(
      `Beat This mel filterbank has ${dense.length} values; expected ${bins * melBins}.`,
    )
  }

  const counts = new Uint32Array(bins)
  let nonZeroCount = 0

  for (let bin = 0; bin < bins; bin += 1) {
    const rowOffset = bin * melBins
    for (let mel = 0; mel < melBins; mel += 1) {
      const weight = dense[rowOffset + mel] ?? 0
      if (Math.abs(weight) <= 1e-12) continue
      counts[bin] = (counts[bin] ?? 0) + 1
      nonZeroCount += 1
    }
  }

  const offsets = new Uint32Array(bins + 1)
  for (let bin = 0; bin < bins; bin += 1) {
    offsets[bin + 1] = offsets[bin]! + counts[bin]!
  }

  const melIndices = new Uint8Array(nonZeroCount)
  const weights = new Float32Array(nonZeroCount)
  let cursor = 0

  for (let bin = 0; bin < bins; bin += 1) {
    const rowOffset = bin * melBins
    for (let mel = 0; mel < melBins; mel += 1) {
      const weight = dense[rowOffset + mel] ?? 0
      if (Math.abs(weight) <= 1e-12) continue
      melIndices[cursor] = mel
      weights[cursor] = weight
      cursor += 1
    }
  }

  return { offsets, melIndices, weights, bins, melBins }
}

export function projectMagnitudeToLogMel(
  magnitude: ArrayLike<number>,
  filterbank: SparseMelFilterbank,
  output: Float32Array,
): void {
  if (magnitude.length < filterbank.bins) {
    throw new Error('Magnitude spectrum is shorter than the Beat This filterbank.')
  }
  if (output.length !== filterbank.melBins) {
    throw new Error('Beat This mel output has the wrong length.')
  }

  output.fill(0)

  for (let bin = 0; bin < filterbank.bins; bin += 1) {
    const value = magnitude[bin] ?? 0
    const start = filterbank.offsets[bin] ?? 0
    const end = filterbank.offsets[bin + 1] ?? start

    for (let index = start; index < end; index += 1) {
      const mel = filterbank.melIndices[index] ?? 0
      output[mel] = (output[mel] ?? 0) + value * (filterbank.weights[index] ?? 0)
    }
  }

  for (let mel = 0; mel < output.length; mel += 1) {
    output[mel] = Math.log1p(BEAT_THIS_LOG_MULTIPLIER * Math.max(0, output[mel] ?? 0))
  }
}

function localMaxima(logits: Float32Array, radius: number): number[] {
  const peaks: number[] = []

  for (let index = 0; index < logits.length; index += 1) {
    const from = Math.max(0, index - radius)
    const to = Math.min(logits.length - 1, index + radius)
    let best = logits[from] ?? Number.NEGATIVE_INFINITY

    for (let candidate = from + 1; candidate <= to; candidate += 1) {
      best = Math.max(best, logits[candidate] ?? Number.NEGATIVE_INFINITY)
    }

    const value = logits[index] ?? Number.NEGATIVE_INFINITY
    if (value === best && value > PEAK_THRESHOLD) {
      peaks.push(index)
    }
  }

  return peaks
}

function deduplicatePeaks(peaks: number[], width: number): number[] {
  const result: number[] = []
  let current = 0
  let count = 0

  for (const peak of peaks) {
    if (count > 0 && peak - current <= width) {
      count += 1
      current += (peak - current) / count
      continue
    }

    if (count > 0) result.push(current)
    current = peak
    count = 1
  }

  if (count > 0) result.push(current)
  return result
}

function nearestTarget(value: number, targets: number[]): number {
  let best = targets[0] ?? value
  let distance = Math.abs(best - value)

  for (const target of targets) {
    const candidate = Math.abs(target - value)
    if (candidate < distance) {
      best = target
      distance = candidate
    }
  }

  return best
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right)
}

export function pickBeatFrames(
  beatLogits: Float32Array,
  downbeatLogits: Float32Array,
): {
  beatFrames: number[]
  downbeatFrames: number[]
  beatStrengths: number[]
} {
  const beatFrames = deduplicatePeaks(localMaxima(beatLogits, PEAK_RADIUS), DEDUPLICATE_WIDTH)
  const rawDownbeats = deduplicatePeaks(
    localMaxima(downbeatLogits, PEAK_RADIUS),
    DEDUPLICATE_WIDTH,
  )
  const downbeatFrames =
    beatFrames.length === 0
      ? rawDownbeats
      : uniqueSorted(rawDownbeats.map((frame) => nearestTarget(frame, beatFrames)))

  const beatStrengths = beatFrames.map((frame) => {
    const logit = beatLogits[Math.max(0, Math.min(beatLogits.length - 1, Math.round(frame)))] ?? 0
    return 1 / (1 + Math.exp(-logit))
  })

  return { beatFrames, downbeatFrames, beatStrengths }
}

function percentile(sorted: number[], ratio: number): number {
  const position = ratio * (sorted.length - 1)
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sorted[lower] ?? 0

  const lowerValue = sorted[lower] ?? 0
  const upperValue = sorted[upper] ?? lowerValue
  return lowerValue + (position - lower) * (upperValue - lowerValue)
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  return percentile([...values].sort((left, right) => left - right), 0.5)
}

function differences(values: number[]): number[] {
  return values.slice(1).map((value, index) => value - (values[index] ?? value))
}

function withoutOutliers(intervals: number[]): number[] {
  const sorted = [...intervals].sort((left, right) => left - right)
  const q1 = percentile(sorted, 0.25)
  const q3 = percentile(sorted, 0.75)
  const iqr = q3 - q1
  const low = q1 - 1.5 * iqr
  const high = q3 + 1.5 * iqr
  const filtered = intervals.filter((interval) => interval >= low && interval <= high)
  return filtered.length > 0 ? filtered : intervals
}

export function estimateBpm(beats: number[]): number {
  if (beats.length < MIN_BEATS) return 0
  const intervals = differences(beats)
  const kept =
    intervals.length >= MIN_INTERVALS_FOR_IQR ? withoutOutliers(intervals) : intervals
  const interval = median(kept)
  return interval > 0 ? 60 / interval : 0
}

function mapProbeBpm(bpm: number): number {
  if (bpm >= MIN_PREFERRED_BPM && bpm <= MAX_PREFERRED_BPM) return bpm
  if (bpm > MAX_PREFERRED_BPM) {
    const half = bpm / 2
    if (half >= MIN_PREFERRED_BPM && half <= MAX_PREFERRED_BPM) return half
  }
  return 0
}

export function consecutiveProbeBpms(beats: number[], duration: number): number[] {
  if (duration < 20) return [estimateBpm(beats)]

  const length = Math.min(60, duration)
  const bpms: number[] = []

  for (
    let start = 0;
    start + 20 <= duration && bpms.length < 5;
    start += length
  ) {
    const window = beats
      .filter((time) => time >= start && time < start + length)
      .map((time) => time - start)
    bpms.push(estimateBpm(window))
  }

  return bpms
}

function consensusBpm(bpms: number[]): number {
  const mapped = bpms.map(mapProbeBpm).filter((value) => value > 0)
  if (mapped.length === 0) return 0

  const sorted = [...mapped].sort((left, right) => left - right)
  let bestStart = 0
  let bestSize = 1
  let start = 0

  for (let end = 0; end < sorted.length; end += 1) {
    while ((sorted[end] ?? 0) / Math.max(sorted[start] ?? 1, 1e-9) > 1.08) {
      start += 1
    }
    const size = end - start + 1
    if (size > bestSize) {
      bestSize = size
      bestStart = start
    }
  }

  return median(sorted.slice(bestStart, bestStart + bestSize))
}

function everyOtherBeat(beats: number[], origin: number): number[] {
  if (beats.length < MIN_BEATS) return beats
  const intervals = differences(beats)
  const step = median(intervals)
  if (step <= 0) return beats

  const kept = beats.filter((time) => {
    const index = Math.round((time - origin) / step)
    return index % 2 === 0
  })

  return kept.length >= MIN_BEATS ? kept : beats
}

function roundHalfToEven(value: number): number {
  const floor = Math.floor(value)
  if (value - floor !== 0.5) return Math.round(value)
  return floor % 2 === 0 ? floor : floor + 1
}

function estimateMeter(beats: number[], downbeats: number[]): number {
  if (downbeats.length < MIN_BEATS || beats.length < MIN_BEATS) {
    return DEFAULT_METER
  }

  const counts: number[] = []
  const epsilon = 1e-3

  for (let index = 0; index < downbeats.length - 1; index += 1) {
    const start = (downbeats[index] ?? 0) - epsilon
    const end = (downbeats[index + 1] ?? start) - epsilon
    const inBar = beats.filter((beat) => beat >= start && beat < end).length
    if (inBar > 0) counts.push(inBar)
  }

  return counts.length > 0 ? roundHalfToEven(median(counts)) : DEFAULT_METER
}

export function summarizeRhythm(
  beats: number[],
  downbeats: number[],
  probeBpms: number[],
): {
  bpm: number
  beats: number[]
  downbeats: number[]
  meter: number
} {
  const bpm = consensusBpm(probeBpms.length > 0 ? probeBpms : [estimateBpm(beats)])
  const rawBpm = estimateBpm(beats)

  if (bpm <= 0 || rawBpm <= 0 || rawBpm / bpm < 1.5) {
    return { bpm, beats, downbeats, meter: estimateMeter(beats, downbeats) }
  }

  const origin = downbeats[0] ?? beats[0] ?? 0
  const foldedBeats = everyOtherBeat(beats, origin)
  const foldedSet = new Set(foldedBeats)
  const foldedDownbeats = downbeats.filter((time) => foldedSet.has(time))

  return {
    bpm,
    beats: foldedBeats,
    downbeats: foldedDownbeats,
    meter: estimateMeter(foldedBeats, foldedDownbeats),
  }
}

export function computeRmsEnvelope(
  audio: Float32Array,
  sampleRate = BEAT_THIS_SAMPLE_RATE,
  hopSeconds = 0.25,
): { energy: Float32Array; hopSeconds: number } {
  const hopSamples = Math.max(1, Math.round(sampleRate * hopSeconds))
  const frameCount = Math.max(1, Math.ceil(audio.length / hopSamples))
  const energy = new Float32Array(frameCount)

  let peak = 0
  for (let frame = 0; frame < frameCount; frame += 1) {
    const start = frame * hopSamples
    const end = Math.min(audio.length, start + hopSamples)
    let sum = 0
    let count = 0

    for (let sample = start; sample < end; sample += 1) {
      const value = audio[sample] ?? 0
      sum += value * value
      count += 1
    }

    const rms = count > 0 ? Math.sqrt(sum / count) : 0
    energy[frame] = rms
    peak = Math.max(peak, rms)
  }

  if (peak > 1e-9) {
    for (let index = 0; index < energy.length; index += 1) {
      energy[index] = Math.min(1, Math.sqrt((energy[index] ?? 0) / peak))
    }
  }

  return { energy, hopSeconds }
}
