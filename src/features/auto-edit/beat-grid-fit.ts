import type { MusicGridFit, MusicTransient } from '@/types/beatvideo'
import type { BeatThisRhythmResult } from './beatThisCore'

const EPSILON = 1e-9
const MIN_FIXED_BEATS = 10
const MAX_PHASE_SHIFT_SECONDS = 0.1

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
}

function percentile(values: readonly number[], ratio: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.max(
    0,
    Math.min(sorted.length - 1, Math.round((sorted.length - 1) * ratio)),
  )
  return sorted[index] ?? 0
}

type Observation = {
  cycle: number
  time: number
  strength: number
}

function linearFit(observations: readonly Observation[]): {
  phase: number
  period: number
} | null {
  if (observations.length < 2) return null

  let sumX = 0
  let sumY = 0
  let sumXX = 0
  let sumXY = 0
  for (const observation of observations) {
    sumX += observation.cycle
    sumY += observation.time
    sumXX += observation.cycle * observation.cycle
    sumXY += observation.cycle * observation.time
  }

  const n = observations.length
  const denominator = n * sumXX - sumX * sumX
  if (Math.abs(denominator) <= EPSILON) return null

  const period = (n * sumXY - sumX * sumY) / denominator
  const phase = (sumY - period * sumX) / n
  if (!Number.isFinite(period) || period <= 0 || !Number.isFinite(phase)) return null
  return { phase, period }
}

function uniqueCycleObservations(
  beats: readonly number[],
  strengths: readonly number[],
  phase: number,
  period: number,
): Observation[] {
  const byCycle = new Map<number, Observation>()

  beats.forEach((time, index) => {
    if (!Number.isFinite(time)) return
    const cycle = Math.round((time - phase) / period)
    const candidate: Observation = {
      cycle,
      time,
      strength: Math.max(0, Math.min(1, strengths[index] ?? 0.5)),
    }
    const existing = byCycle.get(cycle)
    if (!existing) {
      byCycle.set(cycle, candidate)
      return
    }

    const predicted = phase + cycle * period
    const existingDistance = Math.abs(existing.time - predicted)
    const nextDistance = Math.abs(candidate.time - predicted)
    if (
      nextDistance + 1e-6 < existingDistance ||
      (Math.abs(nextDistance - existingDistance) <= 1e-6 &&
        candidate.strength > existing.strength)
    ) {
      byCycle.set(cycle, candidate)
    }
  })

  return [...byCycle.values()].sort((left, right) => left.cycle - right.cycle)
}

function robustGridFit(
  beats: readonly number[],
  strengths: readonly number[],
  bpm: number,
): {
  phase: number
  period: number
  observations: Observation[]
  medianError: number
  p90Error: number
  localDriftRatio: number
} | null {
  if (beats.length < MIN_FIXED_BEATS || !Number.isFinite(bpm) || bpm <= 0) return null

  const expectedPeriod = 60 / bpm
  const origin = beats[0] ?? 0
  let observations = uniqueCycleObservations(beats, strengths, origin, expectedPeriod)
  if (observations.length < MIN_FIXED_BEATS) return null

  let fit = linearFit(observations)
  if (!fit) return null

  for (let pass = 0; pass < 2; pass += 1) {
    const errors = observations.map((observation) =>
      Math.abs(observation.time - (fit!.phase + observation.cycle * fit!.period)),
    )
    const med = median(errors)
    const threshold = Math.max(0.035, Math.min(0.11, med * 3.5))
    const filtered = observations.filter(
      (observation) =>
        Math.abs(observation.time - (fit!.phase + observation.cycle * fit!.period)) <= threshold,
    )
    if (filtered.length < MIN_FIXED_BEATS || filtered.length === observations.length) break
    observations = filtered
    fit = linearFit(observations)
    if (!fit) return null
  }

  const errors = observations.map((observation) =>
    Math.abs(observation.time - (fit!.phase + observation.cycle * fit!.period)),
  )
  const medianError = median(errors)
  const p90Error = percentile(errors, 0.9)

  const third = Math.max(4, Math.floor(observations.length / 3))
  const firstFit = linearFit(observations.slice(0, third))
  const lastFit = linearFit(observations.slice(-third))
  const localDriftRatio =
    firstFit && lastFit
      ? Math.abs(firstFit.period - lastFit.period) / Math.max(EPSILON, fit.period)
      : 0

  const expectedDeviation =
    Math.abs(fit.period - expectedPeriod) / Math.max(EPSILON, expectedPeriod)
  if (expectedDeviation > 0.035) return null

  return {
    ...fit,
    observations,
    medianError,
    p90Error,
    localDriftRatio,
  }
}

function lowerBoundTransient(transients: readonly MusicTransient[], time: number): number {
  let low = 0
  let high = transients.length
  while (low < high) {
    const middle = low + ((high - low) >> 1)
    if ((transients[middle]?.time ?? Number.POSITIVE_INFINITY) < time) low = middle + 1
    else high = middle
  }
  return low
}

function nearestMusicalTransient(
  transients: readonly MusicTransient[],
  time: number,
  radius: number,
): MusicTransient | null {
  const center = lowerBoundTransient(transients, time)
  let winner: MusicTransient | null = null
  let winnerScore = -1

  for (let index = Math.max(0, center - 3); index < Math.min(transients.length, center + 4); index += 1) {
    const transient = transients[index]!
    const distance = Math.abs(transient.time - time)
    if (distance > radius) continue

    // Low-end evidence gets a modest preference because kick/onset timing is
    // usually the most useful phase cue, but strong mid/high attacks can still
    // align beats when the kick is absent.
    const spectralWeight = 0.65 + transient.low * 0.35
    const proximity = 1 - distance / Math.max(radius, EPSILON)
    const score = transient.strength * spectralWeight * (0.45 + 0.55 * proximity)
    if (score > winnerScore) {
      winner = transient
      winnerScore = score
    }
  }

  return winner
}

function refinePhaseWithTransients(params: {
  phase: number
  period: number
  observations: readonly Observation[]
  transients: readonly MusicTransient[]
}): { phase: number; phaseShift: number; supportRatio: number } {
  const { phase, period, observations, transients } = params
  if (transients.length === 0 || observations.length === 0) {
    return { phase, phaseShift: 0, supportRatio: 0 }
  }

  const radius = Math.min(0.11, period * 0.22)
  const offsets: number[] = []

  for (const observation of observations) {
    const predicted = phase + observation.cycle * period
    const transient = nearestMusicalTransient(transients, predicted, radius)
    if (!transient || transient.strength < 0.3) continue
    offsets.push(transient.time - predicted)
  }

  const supportRatio = offsets.length / observations.length
  if (offsets.length < 6 || supportRatio < 0.22) {
    return { phase, phaseShift: 0, supportRatio }
  }

  const phaseShift = median(offsets)
  const spread = median(offsets.map((offset) => Math.abs(offset - phaseShift)))
  if (Math.abs(phaseShift) > MAX_PHASE_SHIFT_SECONDS || spread > 0.04) {
    return { phase, phaseShift: 0, supportRatio }
  }

  return {
    phase: phase + phaseShift,
    phaseShift,
    supportRatio,
  }
}

function nearestStrength(
  time: number,
  beats: readonly number[],
  strengths: readonly number[],
): number {
  if (beats.length === 0) return 0.55
  let winner = 0
  let distance = Number.POSITIVE_INFINITY
  for (let index = 0; index < beats.length; index += 1) {
    const next = Math.abs((beats[index] ?? time) - time)
    if (next < distance) {
      winner = index
      distance = next
    }
  }
  return strengths[winner] ?? 0.55
}

function buildStableBeats(params: {
  phase: number
  period: number
  duration: number
  rawBeats: readonly number[]
  rawStrengths: readonly number[]
  rawDownbeats: readonly number[]
  meter: number
}) {
  const {
    phase,
    period,
    duration,
    rawBeats,
    rawStrengths,
    rawDownbeats,
    meter,
  } = params
  const firstCycle = Math.ceil((0 - phase) / period - 1e-7)
  const lastCycle = Math.floor((duration - phase) / period + 1e-7)
  const firstRawDownbeat = rawDownbeats.find((time) => Number.isFinite(time))
  const downbeatCycle =
    firstRawDownbeat === undefined
      ? null
      : Math.round((firstRawDownbeat - phase) / period)

  const beats: number[] = []
  const downbeats: number[] = []
  const strengths: number[] = []

  for (let cycle = firstCycle; cycle <= lastCycle; cycle += 1) {
    const time = phase + cycle * period
    if (time < -1e-6 || time > duration + 1e-6) continue
    const normalized = Math.max(0, Math.min(duration, time))
    beats.push(normalized)
    strengths.push(nearestStrength(normalized, rawBeats, rawStrengths))

    if (
      downbeatCycle !== null &&
      ((cycle - downbeatCycle) % Math.max(1, meter) + Math.max(1, meter)) %
        Math.max(1, meter) ===
        0
    ) {
      downbeats.push(normalized)
    }
  }

  return { beats, downbeats, strengths }
}

export function stabilizeBeatGrid(
  result: BeatThisRhythmResult,
  duration: number,
): { rhythm: BeatThisRhythmResult; fit: MusicGridFit } {
  const fallback: MusicGridFit = {
    mode: 'variable',
    confidence: 0,
    bpm: result.bpm > 0 ? result.bpm : null,
    anchorTime: result.downbeats[0] ?? result.beats[0] ?? null,
    medianErrorMs: null,
    phaseShiftMs: 0,
    onsetSupport: 0,
  }

  const fitted = robustGridFit(result.beats, result.beatStrengths, result.bpm)
  if (!fitted) return { rhythm: result, fit: fallback }

  const tempoStable =
    fitted.medianError <= 0.045 &&
    fitted.p90Error <= 0.095 &&
    fitted.localDriftRatio <= 0.012

  const confidence = clamp01(
    0.45 * (1 - fitted.medianError / 0.06) +
      0.3 * (1 - fitted.p90Error / 0.12) +
      0.25 * (1 - fitted.localDriftRatio / 0.018),
  )
  if (!tempoStable || confidence < 0.48) {
    return {
      rhythm: result,
      fit: {
        ...fallback,
        confidence,
        medianErrorMs: Math.round(fitted.medianError * 1000),
      },
    }
  }

  const phase = refinePhaseWithTransients({
    phase: fitted.phase,
    period: fitted.period,
    observations: fitted.observations,
    transients: result.transients ?? [],
  })
  const stable = buildStableBeats({
    phase: phase.phase,
    period: fitted.period,
    duration,
    rawBeats: result.beats,
    rawStrengths: result.beatStrengths,
    rawDownbeats: result.downbeats,
    meter: Math.max(1, Math.round(result.meter || 4)),
  })
  const bpm = 60 / fitted.period
  const anchorTime = stable.downbeats[0] ?? stable.beats[0] ?? null

  return {
    rhythm: {
      ...result,
      bpm,
      beats: stable.beats,
      downbeats: stable.downbeats,
      beatStrengths: stable.strengths,
    },
    fit: {
      mode: 'fixed',
      confidence,
      bpm,
      anchorTime,
      medianErrorMs: Math.round(fitted.medianError * 1000),
      phaseShiftMs: Math.round(phase.phaseShift * 1000),
      onsetSupport: phase.supportRatio,
    },
  }
}
