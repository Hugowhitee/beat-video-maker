import type { MusicTransient } from '@/types/beatvideo'

const DEFAULT_LOW_END = 32
const DEFAULT_MID_END = 80
const DEFAULT_PEAK_THRESHOLD = 0.22
const DEFAULT_MIN_GAP_FRAMES = 3

function clamp01(value: number): number {
  if (value <= 0) return 0
  if (value >= 1) return 1
  return value
}

function percentile95(values: Float32Array): number {
  const positive = Array.from(values).filter((value) => Number.isFinite(value) && value > 0)
  if (positive.length === 0) return 1
  positive.sort((left, right) => left - right)
  const index = Math.min(positive.length - 1, Math.floor((positive.length - 1) * 0.95))
  return Math.max(1e-6, positive[index] ?? 1)
}

function bandFlux(
  spectrogram: Float32Array,
  frame: number,
  melBins: number,
  startBin: number,
  endBin: number,
): number {
  const width = Math.max(1, endBin - startBin)
  const currentOffset = frame * melBins
  const previousOffset = (frame - 1) * melBins
  let sum = 0

  for (let bin = startBin; bin < endBin; bin += 1) {
    const delta =
      (spectrogram[currentOffset + bin] ?? 0) -
      (spectrogram[previousOffset + bin] ?? 0)
    if (delta > 0) sum += delta
  }

  return sum / width
}

function isLocalPeak(values: Float32Array, frame: number): boolean {
  const value = values[frame] ?? 0
  return value >= (values[frame - 1] ?? 0) && value > (values[frame + 1] ?? 0)
}

/**
 * Derive lightweight, deterministic source-audio transient evidence from the
 * log-mel tensor Beat This already computed for rhythm inference.
 *
 * "low", "mid" and "high" are broad perceptual frequency regions. They are
 * deliberately not named kick/snare/hat because this is spectral evidence, not
 * an instrument classifier.
 */
export function deriveSpectralTransients(params: {
  spectrogram: Float32Array
  frames: number
  fps: number
  melBins?: number
  peakThreshold?: number
  minGapFrames?: number
}): MusicTransient[] {
  const {
    spectrogram,
    frames,
    fps,
    melBins = 128,
    peakThreshold = DEFAULT_PEAK_THRESHOLD,
    minGapFrames = DEFAULT_MIN_GAP_FRAMES,
  } = params

  if (
    frames < 2 ||
    fps <= 0 ||
    melBins < 3 ||
    spectrogram.length < frames * melBins
  ) {
    return []
  }

  const lowEnd = Math.max(1, Math.min(melBins - 2, Math.round((DEFAULT_LOW_END / 128) * melBins)))
  const midEnd = Math.max(
    lowEnd + 1,
    Math.min(melBins - 1, Math.round((DEFAULT_MID_END / 128) * melBins)),
  )
  const lowFlux = new Float32Array(frames)
  const midFlux = new Float32Array(frames)
  const highFlux = new Float32Array(frames)

  for (let frame = 1; frame < frames; frame += 1) {
    lowFlux[frame] = bandFlux(spectrogram, frame, melBins, 0, lowEnd)
    midFlux[frame] = bandFlux(spectrogram, frame, melBins, lowEnd, midEnd)
    highFlux[frame] = bandFlux(spectrogram, frame, melBins, midEnd, melBins)
  }

  const lowScale = percentile95(lowFlux)
  const midScale = percentile95(midFlux)
  const highScale = percentile95(highFlux)
  const candidates: MusicTransient[] = []

  for (let frame = 1; frame < frames - 1; frame += 1) {
    const low = clamp01((lowFlux[frame] ?? 0) / lowScale)
    const mid = clamp01((midFlux[frame] ?? 0) / midScale)
    const high = clamp01((highFlux[frame] ?? 0) / highScale)
    const strength = Math.max(low, mid, high)
    if (strength < peakThreshold) continue

    const peakInAnyBand =
      (low >= peakThreshold && isLocalPeak(lowFlux, frame)) ||
      (mid >= peakThreshold && isLocalPeak(midFlux, frame)) ||
      (high >= peakThreshold && isLocalPeak(highFlux, frame))
    if (!peakInAnyBand) continue

    candidates.push({
      time: frame / fps,
      index: candidates.length,
      strength,
      low,
      mid,
      high,
    })
  }

  if (candidates.length <= 1) return candidates

  const deduplicated: MusicTransient[] = []
  for (const candidate of candidates) {
    const previous = deduplicated.at(-1)
    if (!previous) {
      deduplicated.push(candidate)
      continue
    }

    const frame = Math.round(candidate.time * fps)
    const previousFrame = Math.round(previous.time * fps)
    if (frame - previousFrame >= Math.max(1, minGapFrames)) {
      deduplicated.push(candidate)
      continue
    }

    if (candidate.strength > previous.strength) {
      deduplicated[deduplicated.length - 1] = candidate
    }
  }

  return deduplicated.map((transient, index) => ({ ...transient, index }))
}
