import type { MusicGridFit, MusicTransient } from '@/types/beatvideo'
import type { BeatThisRhythmResult } from './beatThisCore'

const EPSILON = 1e-9
const MIN_FIXED_BEATS = 10
// Allow an exact half-beat phase repair. Programmed beats can be detected on
// the backbeat/snare while the low-end onset marks the intended beat start.
// The scoring below only accepts this ambiguous correction when coherent
// low-frequency transient evidence clearly beats the detector phase.
const MAX_PHASE_SHIFT_BEAT_FRACTION = 0.5

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

function rawTempoDriftRatio(
  beats: readonly number[],
  expectedPeriod: number,
): number {
  if (beats.length < MIN_FIXED_BEATS || expectedPeriod <= 0) return 0

  const normalizedPeriods: number[] = []
  for (let index = 1; index < beats.length; index += 1) {
    const delta = (beats[index] ?? 0) - (beats[index - 1] ?? 0)
    if (!Number.isFinite(delta) || delta <= 0) continue

    // Beat trackers can occasionally skip one or more beats. Fold gaps of up
    // to four expected beats back to a one-beat period before comparing local
    // tempo, instead of treating a missed detection as real tempo drift.
    const multiple = Math.max(1, Math.min(4, Math.round(delta / expectedPeriod)))
    const normalized = delta / multiple
    const deviation = Math.abs(normalized - expectedPeriod) / expectedPeriod
    if (deviation <= 0.22) normalizedPeriods.push(normalized)
  }

  if (normalizedPeriods.length < 8) return 0
  const third = Math.max(3, Math.floor(normalizedPeriods.length / 3))
  const firstPeriod = median(normalizedPeriods.slice(0, third))
  const lastPeriod = median(normalizedPeriods.slice(-third))
  return Math.abs(firstPeriod - lastPeriod) / Math.max(EPSILON, expectedPeriod)
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
  const fittedLocalDriftRatio =
    firstFit && lastFit
      ? Math.abs(firstFit.period - lastFit.period) / Math.max(EPSILON, fit.period)
      : 0
  const localDriftRatio = Math.max(
    fittedLocalDriftRatio,
    rawTempoDriftRatio(beats, expectedPeriod),
  )

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

    // Phase should follow the front edge of the rhythm, not the loudest cymbal.
    // Low-frequency onsets are therefore the primary cue for programmed music;
    // mid/high attacks can still contribute when there is no convincing kick.
    const lowDominance = Math.max(0, transient.low - Math.max(transient.mid, transient.high))
    const spectralWeight = Math.min(
      1,
      0.28 + transient.low * 0.58 + transient.mid * 0.06 + lowDominance * 0.18,
    )
    const proximity = 1 - distance / Math.max(radius, EPSILON)
    const score = transient.strength * spectralWeight * (0.45 + 0.55 * proximity)
    if (score > winnerScore) {
      winner = transient
      winnerScore = score
    }
  }

  return winner
}

function isLowEndTempoTransient(transient: MusicTransient): boolean {
  return (
    transient.strength >= 0.34 &&
    transient.low >= 0.32 &&
    transient.low >= transient.mid * 0.5 &&
    transient.low >= transient.high * 0.7
  )
}

function collectLowEndTempoObservations(params: {
  phase: number
  period: number
  detectorObservations: readonly Observation[]
  transients: readonly MusicTransient[]
  radius: number
}): Observation[] {
  const { phase, period, detectorObservations, transients, radius } = params
  const usedTransientIndices = new Set<number>()
  const observations: Observation[] = []

  for (const detectorObservation of detectorObservations) {
    const predicted = phase + detectorObservation.cycle * period
    const start = lowerBoundTransient(transients, predicted - radius)
    let winnerIndex = -1
    let winnerScore = -1

    for (let index = start; index < transients.length; index += 1) {
      const transient = transients[index]!
      if (transient.time > predicted + radius) break
      if (usedTransientIndices.has(index) || !isLowEndTempoTransient(transient)) continue

      const distance = Math.abs(transient.time - predicted)
      const proximity = 1 - distance / Math.max(radius, EPSILON)
      const lowDominance = Math.max(
        0,
        transient.low - Math.max(transient.mid, transient.high),
      )
      const score =
        transient.strength *
        (0.72 + transient.low * 0.18 + lowDominance * 0.1) *
        (0.35 + 0.65 * proximity)

      if (score > winnerScore) {
        winnerIndex = index
        winnerScore = score
      }
    }

    if (winnerIndex < 0) continue
    const transient = transients[winnerIndex]!
    usedTransientIndices.add(winnerIndex)
    observations.push({
      cycle: detectorObservation.cycle,
      time: transient.time,
      strength: transient.strength,
    })
  }

  return observations
}

function robustObservationFit(
  input: readonly Observation[],
  minimumCount: number,
): {
  phase: number
  period: number
  observations: Observation[]
  medianError: number
  p90Error: number
} | null {
  if (input.length < minimumCount) return null

  let observations = [...input]
  let fit = linearFit(observations)
  if (!fit) return null

  for (let pass = 0; pass < 2; pass += 1) {
    const errors = observations.map((observation) =>
      Math.abs(observation.time - (fit!.phase + observation.cycle * fit!.period)),
    )
    const med = median(errors)
    const threshold = Math.max(0.025, Math.min(0.085, med * 3.5))
    const filtered = observations.filter(
      (observation) =>
        Math.abs(observation.time - (fit!.phase + observation.cycle * fit!.period)) <=
        threshold,
    )
    if (filtered.length < minimumCount || filtered.length === observations.length) break
    observations = filtered
    fit = linearFit(observations)
    if (!fit) return null
  }

  const errors = observations.map((observation) =>
    Math.abs(observation.time - (fit!.phase + observation.cycle * fit!.period)),
  )
  return {
    ...fit,
    observations,
    medianError: median(errors),
    p90Error: percentile(errors, 0.9),
  }
}

function refinePeriodWithLowEndTransients(params: {
  phase: number
  period: number
  detectorObservations: readonly Observation[]
  transients: readonly MusicTransient[]
}): { period: number; supportRatio: number; consensusSpread: number } | null {
  const { phase, period, detectorObservations, transients } = params
  if (detectorObservations.length < 16 || transients.length === 0) return null

  // First pass is intentionally wide enough to observe a slowly accumulating
  // detector-vs-audio drift. Once a candidate slope is known, rematch with a
  // tighter radius across the full song. This corrects tempo, not just phase.
  const wideRadius = Math.min(0.22, period * 0.34)
  const firstObservations = collectLowEndTempoObservations({
    phase,
    period,
    detectorObservations,
    transients,
    radius: wideRadius,
  })
  const firstFit = robustObservationFit(firstObservations, 8)
  if (!firstFit) return null

  const firstCycle = firstFit.observations[0]?.cycle ?? 0
  const lastCycle = firstFit.observations.at(-1)?.cycle ?? firstCycle
  if (lastCycle - firstCycle < 12) return null

  const deviation = Math.abs(firstFit.period - period) / Math.max(EPSILON, period)
  if (deviation > 0.02) return null

  const tightRadius = Math.min(0.12, firstFit.period * 0.2)
  const rematched = collectLowEndTempoObservations({
    phase: firstFit.phase,
    period: firstFit.period,
    detectorObservations,
    transients,
    radius: tightRadius,
  })
  const finalFit = robustObservationFit(rematched, 8) ?? firstFit
  const finalFirstCycle = finalFit.observations[0]?.cycle ?? 0
  const finalLastCycle = finalFit.observations.at(-1)?.cycle ?? finalFirstCycle
  if (finalLastCycle - finalFirstCycle < 12) return null

  const supportRatio =
    finalFit.observations.length / Math.max(1, detectorObservations.length)
  if (supportRatio < 0.16 || finalFit.medianError > 0.035 || finalFit.p90Error > 0.075) {
    return null
  }

  // Require multiple independent regions of the song to agree. A bass fill or
  // one repeating phrase must not redefine the global DAW tempo.
  const regionSize = Math.max(3, Math.floor(finalFit.observations.length / 3))
  const regionFits = [
    finalFit.observations.slice(0, regionSize),
    finalFit.observations.slice(
      Math.max(0, Math.floor((finalFit.observations.length - regionSize) / 2)),
      Math.max(0, Math.floor((finalFit.observations.length - regionSize) / 2)) +
        regionSize,
    ),
    finalFit.observations.slice(-regionSize),
  ]
    .map((region) => linearFit(region))
    .filter((fit): fit is { phase: number; period: number } => fit !== null)

  if (regionFits.length < 2) return null
  const regionPeriods = regionFits.map((fit) => fit.period)
  const consensusSpread =
    (Math.max(...regionPeriods) - Math.min(...regionPeriods)) /
    Math.max(EPSILON, finalFit.period)
  if (consensusSpread > 0.008) return null

  return {
    period: finalFit.period,
    supportRatio,
    consensusSpread,
  }
}

function wrapPhaseShift(shift: number, period: number): number {
  if (!Number.isFinite(shift) || !Number.isFinite(period) || period <= 0) return 0
  let wrapped = shift % period
  if (wrapped > period / 2) wrapped -= period
  if (wrapped < -period / 2) wrapped += period
  return wrapped
}

function phaseCandidateScore(params: {
  phase: number
  shift: number
  period: number
  observations: readonly Observation[]
  transients: readonly MusicTransient[]
  radius: number
}): { score: number; supportRatio: number; lowSupportRatio: number; offsets: number[] } {
  const { phase, shift, period, observations, transients, radius } = params
  let score = 0
  let support = 0
  let lowSupport = 0
  const offsets: number[] = []

  for (const observation of observations) {
    const predicted = phase + shift + observation.cycle * period
    const transient = nearestMusicalTransient(transients, predicted, radius)
    if (!transient || transient.strength < 0.28) continue

    const distance = Math.abs(transient.time - predicted)
    const proximity = 1 - distance / Math.max(radius, EPSILON)
    // Prefer kick/low-end evidence strongly enough that a louder snare/hat does
    // not own phase merely because it has the largest broadband transient.
    const lowDominance = Math.max(0, transient.low - Math.max(transient.mid, transient.high))
    const spectralWeight = Math.min(
      1,
      0.2 + transient.low * 0.68 + transient.mid * 0.04 + lowDominance * 0.18,
    )
    const detectorWeight = 0.72 + observation.strength * 0.28
    score += transient.strength * spectralWeight * detectorWeight * (0.32 + 0.68 * proximity)
    support += 1
    if (
      transient.low >= 0.35 &&
      transient.low >= transient.mid * 0.5 &&
      transient.low >= transient.high * 0.7
    ) {
      lowSupport += 1
    }
    offsets.push(transient.time - predicted)
  }

  return {
    score: score / Math.max(1, observations.length),
    supportRatio: support / Math.max(1, observations.length),
    lowSupportRatio: lowSupport / Math.max(1, observations.length),
    offsets,
  }
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

  const radius = Math.min(0.095, period * 0.16)
  const maxShift = period * MAX_PHASE_SHIFT_BEAT_FRACTION
  const candidateShifts = new Set<number>([0])

  for (const transient of transients) {
    if (transient.strength < 0.32) continue
    // Generate phase candidates from plausible low-end attacks first. This
    // avoids letting a dense hat/snare field propose dozens of equally loud
    // off-grid phases. If a track has no low-end evidence, the detector phase
    // remains the safe baseline instead of inventing a kick.
    if (transient.low < 0.2 && transient.low < transient.high * 0.65) continue
    const cycle = Math.round((transient.time - phase) / period)
    const rawShift = transient.time - (phase + cycle * period)
    const shift = wrapPhaseShift(rawShift, period)
    if (Math.abs(shift) > maxShift + EPSILON) continue

    // Five-millisecond bins keep the search bounded while remaining much finer
    // than both the Beat This frame rate and a visible timeline correction.
    candidateShifts.add(Math.round(shift / 0.005) * 0.005)
  }

  const baseline = phaseCandidateScore({
    phase,
    shift: 0,
    period,
    observations,
    transients,
    radius,
  })
  let winner = { shift: 0, ...baseline }

  for (const shift of candidateShifts) {
    if (Math.abs(shift) <= EPSILON) continue
    const candidate = phaseCandidateScore({
      phase,
      shift,
      period,
      observations,
      transients,
      radius,
    })
    if (
      candidate.score > winner.score + 1e-6 ||
      (Math.abs(candidate.score - winner.score) <= 1e-6 &&
        candidate.supportRatio > winner.supportRatio)
    ) {
      winner = { shift, ...candidate }
    }
  }

  if (
    Math.abs(winner.shift) <= EPSILON ||
    winner.supportRatio < 0.24 ||
    winner.offsets.length < 6
  ) {
    return { phase, phaseShift: 0, supportRatio: baseline.supportRatio }
  }

  // A large correction needs meaningfully better onset evidence than the raw
  // detector phase. This lets tempo be correct while phase is repaired, but
  // prevents a loud off-beat texture from moving an already-good grid.
  const requiredGain =
    Math.abs(winner.shift) > 0.1
      ? Math.max(0.025, baseline.score * 0.1)
      : 0.008
  if (winner.score < baseline.score + requiredGain) {
    return { phase, phaseShift: 0, supportRatio: baseline.supportRatio }
  }

  // Large corrections are ambiguous by definition. Require recurring low-band
  // onset evidence, not just broadband/snare support, before moving the whole
  // musical grid far away from the detector phase.
  if (Math.abs(winner.shift) > 0.1 && winner.lowSupportRatio < 0.25) {
    return { phase, phaseShift: 0, supportRatio: baseline.supportRatio }
  }

  const residual = median(winner.offsets)
  const refinedShift = Math.max(
    -maxShift,
    Math.min(maxShift, winner.shift + Math.max(-radius, Math.min(radius, residual))),
  )

  return {
    phase: phase + refinedShift,
    phaseShift: refinedShift,
    supportRatio: winner.supportRatio,
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
  /** Signed onset correction applied to every detector landmark. */
  phaseShift: number
  meter: number
}) {
  const {
    phase,
    period,
    duration,
    rawBeats,
    rawStrengths,
    rawDownbeats,
    phaseShift,
    meter,
  } = params
  const firstCycle = Math.ceil((0 - phase) / period - 1e-7)
  const lastCycle = Math.floor((duration - phase) / period + 1e-7)
  const firstRawDownbeat = rawDownbeats.find((time) => Number.isFinite(time))
  const downbeatCycle =
    firstRawDownbeat === undefined
      ? null
      : Math.round((firstRawDownbeat + phaseShift - phase) / period)

  const beats: number[] = []
  const downbeats: number[] = []
  const strengths: number[] = []

  for (let cycle = firstCycle; cycle <= lastCycle; cycle += 1) {
    const time = phase + cycle * period
    if (time < -1e-6 || time > duration + 1e-6) continue
    const normalized = Math.max(0, Math.min(duration, time))
    beats.push(normalized)
    strengths.push(nearestStrength(normalized - phaseShift, rawBeats, rawStrengths))

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

  const initialPhase = refinePhaseWithTransients({
    phase: fitted.phase,
    period: fitted.period,
    observations: fitted.observations,
    transients: result.transients ?? [],
  })
  const tempoEvidence = refinePeriodWithLowEndTransients({
    phase: initialPhase.phase,
    period: fitted.period,
    detectorObservations: fitted.observations,
    transients: result.transients ?? [],
  })
  const stablePeriod = tempoEvidence?.period ?? fitted.period

  // Re-evaluate phase on the refined tempo. If the detector was only a few
  // tenths of a BPM off, this second pass removes the cumulative drift while
  // preserving the already-proven kick/downbeat phase decision.
  const finalPhase = tempoEvidence
    ? refinePhaseWithTransients({
        phase: initialPhase.phase,
        period: stablePeriod,
        observations: fitted.observations,
        transients: result.transients ?? [],
      })
    : initialPhase
  const totalPhaseShift = wrapPhaseShift(finalPhase.phase - fitted.phase, stablePeriod)

  const stable = buildStableBeats({
    phase: finalPhase.phase,
    period: stablePeriod,
    duration,
    rawBeats: result.beats,
    rawStrengths: result.beatStrengths,
    rawDownbeats: result.downbeats,
    phaseShift: totalPhaseShift,
    meter: Math.max(1, Math.round(result.meter || 4)),
  })
  const bpm = 60 / stablePeriod
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
      phaseShiftMs: Math.round(totalPhaseShift * 1000),
      onsetSupport: Math.max(
        finalPhase.supportRatio,
        tempoEvidence?.supportRatio ?? 0,
      ),
    },
  }
}
