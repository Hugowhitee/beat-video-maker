import type { MusicMap, MusicSection, MusicSectionKind } from './types'
import type { BeatThisRhythmResult } from './beatThisCore'
import { BEAT_THIS_FPS } from './beatThisCore'

const DEFAULT_PHRASE_BARS = 8
const EPSILON = 1e-6

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function averageEnergy(
  energy: Float32Array,
  hopSeconds: number,
  start: number,
  end: number,
) {
  if (energy.length === 0 || hopSeconds <= 0 || end <= start) return 0

  const first = Math.max(0, Math.floor(start / hopSeconds))
  const last = Math.min(energy.length - 1, Math.ceil(end / hopSeconds))
  let sum = 0
  let count = 0

  for (let index = first; index <= last; index += 1) {
    const center = (index + 0.5) * hopSeconds
    if (center < start - EPSILON || center >= end + EPSILON) continue
    sum += energy[index] ?? 0
    count += 1
  }

  return count > 0 ? clamp01(sum / count) : 0
}

function deriveBarAnchors(
  beats: number[],
  downbeats: number[],
  beatsPerBar: number,
  duration: number,
) {
  const validDownbeats = downbeats.filter(
    (time) => Number.isFinite(time) && time >= 0 && time < duration,
  )
  if (validDownbeats.length >= 2) {
    return { anchors: validDownbeats, confidence: 0.9 }
  }

  const anchors: number[] = []
  for (let index = 0; index < beats.length; index += beatsPerBar) {
    const time = beats[index]
    if (time !== undefined && time >= 0 && time < duration) anchors.push(time)
  }

  return { anchors, confidence: anchors.length >= 2 ? 0.58 : 0.35 }
}

function phraseBoundaries(
  barAnchors: number[],
  duration: number,
  phraseBars = DEFAULT_PHRASE_BARS,
) {
  const boundaries = [0]

  for (let index = phraseBars; index < barAnchors.length; index += phraseBars) {
    const time = barAnchors[index]
    if (
      time !== undefined
      && time > (boundaries.at(-1) ?? 0) + 0.2
      && time < duration - 0.2
    ) {
      boundaries.push(time)
    }
  }

  if (duration > (boundaries.at(-1) ?? 0) + EPSILON) boundaries.push(duration)
  return boundaries
}

function median(values: number[]) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
}

function classifySection(
  index: number,
  energies: number[],
): MusicSectionKind {
  const current = energies[index] ?? 0
  const previous = energies[index - 1]
  const next = energies[index + 1]
  const typical = median(energies)

  if (index === 0) {
    if (energies.length > 1 && current <= Math.max(0.5, typical * 0.82)) {
      return 'intro'
    }
    return 'unknown'
  }

  if (index === energies.length - 1) {
    if (previous !== undefined && current <= previous - 0.12) return 'outro'
    return 'unknown'
  }

  if (
    previous !== undefined
    && current - previous >= 0.16
    && current >= Math.max(0.58, typical)
  ) {
    return 'drop'
  }

  if (next !== undefined && next - current >= 0.14) {
    return 'build'
  }

  if (
    previous !== undefined
    && current <= typical * 0.72
    && previous - current >= 0.1
  ) {
    return 'break'
  }

  return 'unknown'
}

function buildSections(
  result: BeatThisRhythmResult,
  duration: number,
  beatsPerBar: number,
): MusicSection[] {
  const { anchors, confidence: anchorConfidence } = deriveBarAnchors(
    result.beats,
    result.downbeats,
    beatsPerBar,
    duration,
  )
  const boundaries = phraseBoundaries(anchors, duration)

  if (boundaries.length < 2) {
    return [
      {
        id: 'section-1',
        start: 0,
        end: duration,
        kind: 'unknown',
        energy: averageEnergy(result.energy, result.energyHopSeconds, 0, duration),
        confidence: 0.3,
      },
    ]
  }

  const energies = boundaries.slice(0, -1).map((start, index) => {
    const end = boundaries[index + 1] ?? duration
    return averageEnergy(result.energy, result.energyHopSeconds, start, end)
  })

  return energies.map((energy, index) => {
    const start = boundaries[index] ?? 0
    const end = boundaries[index + 1] ?? duration
    const kind = classifySection(index, energies)
    const kindEvidence = kind === 'unknown' ? 0.72 : 1

    return {
      id: `section-${index + 1}`,
      start,
      end,
      kind,
      energy,
      confidence: clamp01(anchorConfidence * kindEvidence),
    }
  })
}

export function buildMusicMapFromRhythm(
  result: BeatThisRhythmResult,
  duration: number,
): MusicMap {
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('Music duration must be positive.')
  }

  const beatsPerBar = Math.max(1, Math.min(12, Math.round(result.meter || 4)))
  const downbeatTolerance = 0.5 / BEAT_THIS_FPS

  const beats = result.beats
    .filter((time) => Number.isFinite(time) && time >= 0 && time <= duration + EPSILON)
    .map((time, index) => ({
      time: Math.min(duration, Math.max(0, time)),
      index,
      downbeat: result.downbeats.some(
        (downbeat) => Math.abs(downbeat - time) <= downbeatTolerance,
      ),
      strength: clamp01(result.beatStrengths[index] ?? 0.5),
    }))

  return {
    duration,
    bpm: result.bpm > 0 ? result.bpm : null,
    beatsPerBar,
    beats,
    sections: buildSections(result, duration, beatsPerBar),
  }
}
