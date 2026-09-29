import type { MusicMap, MusicSection, MusicSectionKind } from './types'
import type { BeatThisRhythmResult } from './beatThisCore'
import { BEAT_THIS_FPS } from './beatThisCore'

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

function median(values: number[]) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
}

function average(values: readonly number[]) {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

type BarFeature = {
  start: number
  end: number
  energy: number
  transientDensity: number
  low: number
  mid: number
  high: number
}

function buildBarFeatures(
  result: BeatThisRhythmResult,
  barAnchors: readonly number[],
  duration: number,
): BarFeature[] {
  const starts = barAnchors
    .filter((time) => Number.isFinite(time) && time >= 0 && time < duration)
    .slice()
    .sort((left, right) => left - right)

  if ((starts[0] ?? 0) > 0.05) starts.unshift(0)
  if (starts.length === 0) starts.push(0)

  return starts
    .map((start, index) => {
      const end = Math.min(duration, starts[index + 1] ?? duration)
      const transients = (result.transients ?? []).filter(
        (transient) => transient.time >= start && transient.time < end,
      )
      const weight = Math.max(
        EPSILON,
        transients.reduce((sum, transient) => sum + transient.strength, 0),
      )
      const band = (key: 'low' | 'mid' | 'high') =>
        transients.reduce(
          (sum, transient) => sum + transient[key] * transient.strength,
          0,
        ) / weight

      return {
        start,
        end,
        energy: averageEnergy(result.energy, result.energyHopSeconds, start, end),
        transientDensity: clamp01(transients.length / 10),
        low: band('low'),
        mid: band('mid'),
        high: band('high'),
      }
    })
    .filter((bar) => bar.end > bar.start + EPSILON)
}

function featureWindow(features: readonly BarFeature[], start: number, end: number) {
  const window = features.slice(Math.max(0, start), Math.min(features.length, end))
  return {
    energy: average(window.map((feature) => feature.energy)),
    transientDensity: average(window.map((feature) => feature.transientDensity)),
    low: average(window.map((feature) => feature.low)),
    mid: average(window.map((feature) => feature.mid)),
    high: average(window.map((feature) => feature.high)),
  }
}

function sectionChangeScore(features: readonly BarFeature[], boundaryIndex: number): number {
  const left = featureWindow(features, boundaryIndex - 2, boundaryIndex)
  const right = featureWindow(features, boundaryIndex, boundaryIndex + 2)
  const energyAbs = Math.abs(left.energy - right.energy)
  const energyRelative =
    energyAbs / Math.max(0.18, (left.energy + right.energy) / 2)
  const spectralDelta =
    (Math.abs(left.low - right.low) +
      Math.abs(left.mid - right.mid) +
      Math.abs(left.high - right.high)) /
    3

  return clamp01(
    energyAbs * 0.32 +
      Math.min(1, energyRelative) * 0.36 +
      spectralDelta * 0.22 +
      Math.abs(left.transientDensity - right.transientDensity) * 0.1,
  )
}

function deriveSectionBoundaries(
  features: readonly BarFeature[],
  duration: number,
): { boundaries: number[]; scoreByTime: Map<number, number> } {
  if (features.length < 4) return { boundaries: [0, duration], scoreByTime: new Map() }

  const scored = features.slice(1, -1).map((feature, relativeIndex) => ({
    time: feature.start,
    barIndex: relativeIndex + 1,
    score: sectionChangeScore(features, relativeIndex + 1),
  }))
  const scores = scored.map((candidate) => candidate.score)
  const typical = median(scores)
  const threshold = Math.max(0.115, typical + 0.045)

  // Pick strongest changes first so one real transition does not become several
  // neighbouring boundaries because the 2-bar windows overlap.
  const selected: typeof scored = []
  for (const candidate of [...scored].sort((a, b) => b.score - a.score)) {
    if (candidate.score < threshold) continue
    if (candidate.barIndex < 3 || features.length - candidate.barIndex < 3) continue
    if (selected.some((other) => Math.abs(other.barIndex - candidate.barIndex) < 3)) continue
    selected.push(candidate)
  }
  selected.sort((a, b) => a.time - b.time)

  const boundaries = [0, ...selected.map((candidate) => candidate.time), duration]
  const scoreByTime = new Map(selected.map((candidate) => [candidate.time, candidate.score]))
  return { boundaries, scoreByTime }
}

function classifySection(index: number, energies: number[]): MusicSectionKind {
  const current = energies[index] ?? 0
  const previous = energies[index - 1]
  const next = energies[index + 1]
  const typical = median(energies)

  if (index === 0) {
    return energies.length > 1 && current <= Math.max(0.5, typical * 0.82)
      ? 'intro'
      : 'unknown'
  }
  if (index === energies.length - 1) {
    return previous !== undefined && current <= previous - 0.1 ? 'outro' : 'unknown'
  }
  if (previous !== undefined && current - previous >= 0.14 && current >= typical) return 'drop'
  if (next !== undefined && next - current >= 0.12) return 'build'
  if (previous !== undefined && current <= typical * 0.74 && previous - current >= 0.09) {
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
  const features = buildBarFeatures(result, anchors, duration)
  const { boundaries, scoreByTime } = deriveSectionBoundaries(features, duration)

  const energies = boundaries.slice(0, -1).map((start, index) =>
    averageEnergy(
      result.energy,
      result.energyHopSeconds,
      start,
      boundaries[index + 1] ?? duration,
    ),
  )

  return energies.map((energy, index) => {
    const start = boundaries[index] ?? 0
    const end = boundaries[index + 1] ?? duration
    const kind = classifySection(index, energies)
    const boundaryEvidence =
      index === 0 ? 0.72 : Math.min(1, 0.55 + (scoreByTime.get(start) ?? 0) * 2)
    const labelEvidence = kind === 'unknown' ? 0.82 : 1

    return {
      id: `section-${index + 1}`,
      start,
      end,
      kind,
      energy,
      confidence: clamp01(anchorConfidence * boundaryEvidence * labelEvidence),
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
  // Beat This can occasionally return a strong beat sequence but too little
  // downbeat evidence to draw usable bars. Keep section confidence conservative
  // (buildSections still sees the raw downbeats), while giving the editor a
  // deterministic bar grid anchored at the first detected beat.
  const displayDownbeats =
    result.downbeats.length >= 2
      ? result.downbeats
      : result.beats.filter((_, index) => index % beatsPerBar === 0)

  const beats = result.beats
    .filter((time) => Number.isFinite(time) && time >= 0 && time <= duration + EPSILON)
    .map((time, index) => ({
      time: Math.min(duration, Math.max(0, time)),
      index,
      downbeat: displayDownbeats.some(
        (downbeat) => Math.abs(downbeat - time) <= downbeatTolerance,
      ),
      strength: clamp01(result.beatStrengths[index] ?? 0.5),
    }))

  return {
    duration,
    bpm: result.bpm > 0 ? result.bpm : null,
    beatsPerBar,
    beats,
    transients: (result.transients ?? [])
      .filter(
        (transient) =>
          Number.isFinite(transient.time) &&
          transient.time >= 0 &&
          transient.time <= duration + EPSILON,
      )
      .map((transient, index) => ({
        ...transient,
        index,
        time: Math.min(duration, Math.max(0, transient.time)),
        strength: clamp01(transient.strength),
        low: clamp01(transient.low),
        mid: clamp01(transient.mid),
        high: clamp01(transient.high),
      })),
    sections: buildSections(result, duration, beatsPerBar),
  }
}
