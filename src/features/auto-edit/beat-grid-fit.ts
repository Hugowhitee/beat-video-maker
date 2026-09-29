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
  const candidates = beats
    .map((time, index) => ({
      time,
      strength: Math.max(0, Math.min(1, strengths[index] ?? 0.5)),
    }))
    .filter((candidate) => Number.isFinite(candidate.time))
    .sort((left, right) => left.time - right.time)

  const first = candidates[0]
  if (!first || !Number.isFinite(period) || period <= 0) return []

  const observations: Observation[] = [{
    cycle: 0,
    time: first.time,
    strength: first.strength,
  }]
  let previous = observations[0]!

  for (let index = 1; index < candidates.length; index += 1) {
    const candidate = candidates[index]!
    const gap = candidate.time - previous.time
    if (!Number.isFinite(gap) || gap <= 0) continue

    const rawSteps = gap / period

    // A short extra peak is an off-beat candidate, not another musical cycle.
    // Keeping the current cycle here prevents a dense hat/snare from advancing
    // the index before the following real beat arrives.
    if (rawSteps < 0.55) {
      const predicted = phase + previous.cycle * period
      const previousDistance = Math.abs(previous.time - predicted)
      const candidateDistance = Math.abs(candidate.time - predicted)
      if (
        candidateDistance + 1e-6 < previousDistance ||
        (Math.abs(candidateDistance - previousDistance) <= 1e-6 &&
          candidate.strength > previous.strength)
      ) {
        previous.time = candidate.time
        previous.strength = candidate.strength
      }
      continue
    }

    // Infer missing beats from each local gap. Do not repeatedly round absolute
    // song time against the seed BPM: a seed a few tenths off can otherwise
    // accumulate enough phase error to slip an entire cycle late in a long song.
    const steps = Math.max(1, Math.round(rawSteps))
    const normalizedGap = gap / steps
    const localDeviation = Math.abs(normalizedGap - period) / period
    if (localDeviation > 0.3) continue

    const observation: Observation = {
      cycle: previous.cycle + steps,
      time: candidate.time,
      strength: candidate.strength,
    }
    observations.push(observation)
    previous = observation
  }

  return observations
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

function isRhythmicTempoTransient(transient: MusicTransient): boolean {
  // Tempo is periodicity, not instrument identity. A recurring clap/snare/hat
  // can therefore corroborate BPM when kicks are sparse. This broader evidence
  // is never used by the phase fitter below, which remains low-end weighted.
  return (
    transient.strength >= 0.36 &&
    Math.max(transient.low, transient.mid, transient.high) >= 0.34
  )
}

function collectLowEndTempoObservations(params: {
  phase: number
  period: number
  transients: readonly MusicTransient[]
}): Observation[] {
  const { phase, period, transients } = params
  if (!Number.isFinite(period) || period <= 0) return []

  const candidates = transients
    .filter(isLowEndTempoTransient)
    .slice()
    .sort((left, right) => left.time - right.time)
  const first = candidates[0]
  if (!first) return []

  const observations: Observation[] = [{
    cycle: Math.round((first.time - phase) / period),
    time: first.time,
    strength: first.strength,
  }]
  let previous = observations[0]!

  for (let index = 1; index < candidates.length; index += 1) {
    const transient = candidates[index]!
    const gap = transient.time - previous.time
    if (!Number.isFinite(gap) || gap <= 0) continue

    const rawSteps = gap / period

    // Multiple low-end attacks can occur inside one beat (808 articulation,
    // pickup, kick layer). Keep one representative for the current musical
    // cycle instead of letting the extra onset advance the tempo count.
    if (rawSteps < 0.55) {
      const predicted = phase + previous.cycle * period
      const previousDistance = Math.abs(previous.time - predicted)
      const candidateDistance = Math.abs(transient.time - predicted)
      if (
        candidateDistance + 1e-6 < previousDistance ||
        (Math.abs(candidateDistance - previousDistance) <= 1e-6 &&
          transient.strength > previous.strength)
      ) {
        previous.time = transient.time
        previous.strength = transient.strength
      }
      continue
    }

    // Infer skipped kick positions from the local gap. Because this decision is
    // local, a detector seed that is a few tenths of a BPM wrong cannot build
    // up enough absolute phase error to relabel later kicks by a whole beat.
    const steps = Math.max(1, Math.round(rawSteps))
    const normalizedGap = gap / steps
    const localDeviation = Math.abs(normalizedGap - period) / period
    if (localDeviation > 0.22) continue

    const observation: Observation = {
      cycle: previous.cycle + steps,
      time: transient.time,
      strength: transient.strength,
    }
    observations.push(observation)
    previous = observation
  }

  return observations
}

type SparsePeriodEvidence = {
  period: number
  spread: number
  sampleCount: number
}

function estimateSparsePeriodEvidence(
  times: readonly number[],
  seedPeriod: number,
): SparsePeriodEvidence | null {
  if (times.length < 4 || !Number.isFinite(seedPeriod) || seedPeriod <= 0) return null

  const periods: number[] = []
  for (let left = 0; left < times.length - 1; left += 1) {
    const maxRight = Math.min(times.length, left + 13)
    for (let right = left + 1; right < maxRight; right += 1) {
      const gap = (times[right] ?? 0) - (times[left] ?? 0)
      if (!Number.isFinite(gap) || gap <= 0) continue

      // Syncopated low-end patterns commonly repeat at x.5-beat spans.
      // Quantize pair distance in half-beats, then recover the full beat period.
      // Short adjacent attacks stay excluded so local articulation cannot own BPM.
      const halfSteps = Math.round((gap / seedPeriod) * 2)
      if (halfSteps < 3 || halfSteps > 32) continue

      const beatSpan = halfSteps / 2
      const candidate = gap / beatSpan
      const deviation = Math.abs(candidate - seedPeriod) / seedPeriod
      if (deviation <= 0.025) periods.push(candidate)
    }
  }

  if (periods.length < 6) return null

  const center = median(periods)
  const kept = periods.filter(
    (candidate) => Math.abs(candidate - center) / Math.max(EPSILON, center) <= 0.012,
  )
  if (kept.length < 5) return null

  const period = median(kept)
  const spread =
    (percentile(kept, 0.9) - percentile(kept, 0.1)) / Math.max(EPSILON, period)
  if (!Number.isFinite(period) || period <= 0 || spread > 0.015) return null

  return { period, spread, sampleCount: kept.length }
}

type DistributedPeriodEvidence = SparsePeriodEvidence & {
  regionCount: number
}

function estimateDistributedPeriodEvidence(params: {
  transients: readonly MusicTransient[]
  seedPeriod: number
  firstDetectorTime: number
  lastDetectorTime: number
  minimumRegions: number
}): DistributedPeriodEvidence | null {
  const {
    transients,
    seedPeriod,
    firstDetectorTime,
    lastDetectorTime,
    minimumRegions,
  } = params
  if (transients.length < 6) return null

  const detectorSpan = lastDetectorTime - firstDetectorTime
  if (detectorSpan <= seedPeriod * 12) return null

  const firstOnset = transients[0]?.time ?? firstDetectorTime
  const lastOnset = transients.at(-1)?.time ?? firstOnset
  const evidenceCoverage = (lastOnset - firstOnset) / Math.max(EPSILON, detectorSpan)
  if (evidenceCoverage < 0.5) return null

  const globalEvidence = estimateSparsePeriodEvidence(
    transients.map((transient) => transient.time),
    seedPeriod,
  )
  if (!globalEvidence) return null

  // Overlapping early/middle/late measurements prevent one local fill or one
  // unusually busy phrase from retuning the entire song.
  const regionWidth = detectorSpan * 0.44
  const regionStarts = [
    firstDetectorTime,
    firstDetectorTime + detectorSpan * 0.28,
    Math.max(firstDetectorTime, lastDetectorTime - regionWidth),
  ]
  const regionEvidence = regionStarts
    .map((start) => {
      const end = start + regionWidth
      return estimateSparsePeriodEvidence(
        transients
          .filter((transient) => transient.time >= start && transient.time <= end)
          .map((transient) => transient.time),
        seedPeriod,
      )
    })
    .filter((evidence): evidence is SparsePeriodEvidence => evidence !== null)

  if (regionEvidence.length < minimumRegions) return null

  const periods = [globalEvidence.period, ...regionEvidence.map((evidence) => evidence.period)]
  const period = median(periods)
  const spread =
    (Math.max(...periods) - Math.min(...periods)) / Math.max(EPSILON, period)
  const allowedSpread = minimumRegions >= 3 ? 0.0055 : 0.0075
  if (spread > allowedSpread) return null

  const deviation = Math.abs(period - seedPeriod) / Math.max(EPSILON, seedPeriod)
  if (deviation > 0.025) return null

  return {
    period,
    spread,
    sampleCount:
      globalEvidence.sampleCount +
      regionEvidence.reduce((sum, evidence) => sum + evidence.sampleCount, 0),
    regionCount: regionEvidence.length,
  }
}

function lowEndPeriodScore(params: {
  phase: number
  period: number
  observations: readonly Observation[]
  lowEndTransients: readonly MusicTransient[]
}): { score: number; supportRatio: number } {
  const { phase, period, observations, lowEndTransients } = params
  if (observations.length === 0 || lowEndTransients.length === 0) {
    return { score: 0, supportRatio: 0 }
  }

  const radius = Math.min(0.095, period * 0.16)
  let score = 0
  let support = 0

  for (const observation of observations) {
    const predicted = phase + observation.cycle * period
    const transient = nearestMusicalTransient(lowEndTransients, predicted, radius)
    if (!transient) continue

    const distance = Math.abs(transient.time - predicted)
    const proximity = 1 - distance / Math.max(radius, EPSILON)
    score += transient.strength * (0.35 + 0.65 * proximity)
    support += 1
  }

  return {
    score: score / Math.max(1, observations.length),
    supportRatio: support / Math.max(1, observations.length),
  }
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

  const firstDetectorTime = detectorObservations[0]?.time ?? 0
  const lastDetectorTime = detectorObservations.at(-1)?.time ?? firstDetectorTime

  const lowEndTransients = transients
    .filter(isLowEndTempoTransient)
    .slice()
    .sort((left, right) => left.time - right.time)
  const rhythmicTransients = transients
    .filter(isRhythmicTempoTransient)
    .slice()
    .sort((left, right) => left.time - right.time)

  // Independent measurements 1–4: low-end global + distributed song regions.
  const lowConsensus = estimateDistributedPeriodEvidence({
    transients: lowEndTransients,
    seedPeriod: period,
    firstDetectorTime,
    lastDetectorTime,
    minimumRegions: 2,
  })

  // Independent measurements 5–8: all rhythmic attacks. This is intentionally
  // stricter (all three regions + tighter spread) because clap/snare/hat timing
  // is excellent BPM evidence but ambiguous phase evidence.
  const rhythmicConsensus = estimateDistributedPeriodEvidence({
    transients: rhythmicTransients,
    seedPeriod: period,
    firstDetectorTime,
    lastDetectorTime,
    minimumRegions: 3,
  })

  if (!lowConsensus && !rhythmicConsensus) return null
  if (
    lowConsensus &&
    rhythmicConsensus &&
    Math.abs(lowConsensus.period - rhythmicConsensus.period) /
      Math.max(EPSILON, lowConsensus.period) >
      0.008
  ) {
    return null
  }

  const consensusPeriod =
    lowConsensus && rhythmicConsensus
      ? median([lowConsensus.period, rhythmicConsensus.period])
      : (lowConsensus?.period ?? rhythmicConsensus!.period)
  const consensusSpread = Math.max(
    lowConsensus?.spread ?? 0,
    rhythmicConsensus?.spread ?? 0,
  )

  // Measurement 9: the sequential kick-cycle fit remains a cross-check only.
  // It cannot own tempo because its cycle labels can alias after long drift.
  const onsetObservations = collectLowEndTempoObservations({
    phase,
    period,
    transients: lowEndTransients,
  })
  const onsetFit = robustObservationFit(onsetObservations, 6)
  if (
    onsetFit &&
    Math.abs(onsetFit.period - consensusPeriod) / Math.max(EPSILON, consensusPeriod) > 0.014
  ) {
    return null
  }

  const baseline = lowEndPeriodScore({
    phase,
    period,
    observations: detectorObservations,
    lowEndTransients,
  })
  const candidate = lowEndPeriodScore({
    phase,
    period: consensusPeriod,
    observations: detectorObservations,
    lowEndTransients,
  })
  const requiredGain = Math.max(0.004, baseline.score * 0.05)
  const improvesLowEndAlignment =
    candidate.score >= baseline.score + requiredGain ||
    (candidate.supportRatio >= baseline.supportRatio + 0.04 &&
      candidate.score >= baseline.score - 0.002)

  // When low-end evidence itself formed a consensus, the new lattice must
  // explain those onsets better. With sparse kicks, the broad-rhythm fallback
  // may rescue BPM only under strong three-region consensus.
  if (lowConsensus) {
    if (candidate.supportRatio < 0.08 || !improvesLowEndAlignment) return null
  } else if (
    !rhythmicConsensus ||
    rhythmicConsensus.sampleCount < 24 ||
    rhythmicConsensus.regionCount < 3 ||
    rhythmicConsensus.spread > 0.0055
  ) {
    return null
  }

  const rhythmicSupport =
    rhythmicTransients.length / Math.max(1, detectorObservations.length)

  return {
    period: consensusPeriod,
    supportRatio: Math.min(
      1,
      Math.max(
        candidate.supportRatio,
        rhythmicSupport,
        onsetFit
          ? onsetFit.observations.length / Math.max(1, detectorObservations.length)
          : 0,
      ),
    ),
    consensusSpread,
  }
}

function wrapPhaseShift(shift: number, period: number): number {
  if (!Number.isFinite(shift) || !Number.isFinite(period) || period <= 0) return 0
  let wrapped = shift % period
  const halfPeriod = period / 2
  const tieTolerance = Math.max(EPSILON, period * 1e-7)
  if (wrapped > halfPeriod + tieTolerance) wrapped -= period
  if (wrapped < -halfPeriod - tieTolerance) wrapped += period
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

  // An exact/near half-beat flip is the most dangerous ambiguity in
  // syncopated hip-hop: a correct detector phase can have real kicks every
  // few beats while denser 808 articulations live on the half-beat. If the
  // original phase already has recurring low-end support, keep it. A true
  // half-beat detector error (e.g. detector follows the snare) still repairs
  // because its baseline has essentially no low-end support.
  const nearHalfBeat = Math.abs(winner.shift) >= period * 0.42
  if (nearHalfBeat && baseline.lowSupportRatio >= 0.16) {
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
  const firstRawBeat = rawBeats.find((time) => Number.isFinite(time))
  const correctedFirstRawBeat =
    firstRawBeat === undefined ? phase : firstRawBeat + phaseShift
  const firstCycle = Math.max(
    Math.ceil((0 - phase) / period - 1e-7),
    Math.round((correctedFirstRawBeat - phase) / period),
  )
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

  // Measure tempo before phase. Period evidence uses long spans and distributed
  // song regions, so a slightly wrong BPM must be corrected before transient
  // phase scoring; otherwise late-song drift can make a syncopated half-beat
  // pattern look like the dominant phase.
  const tempoEvidence = refinePeriodWithLowEndTransients({
    phase: fitted.phase,
    period: fitted.period,
    detectorObservations: fitted.observations,
    transients: result.transients ?? [],
  })
  const stablePeriod = tempoEvidence?.period ?? fitted.period

  // Phase is evaluated once on the best available period. This keeps tempo and
  // phase as separate decisions: distributed rhythmic evidence may repair BPM,
  // while low-end onset evidence decides whether Bar 1 should move.
  const finalPhase = refinePhaseWithTransients({
    phase: fitted.phase,
    period: stablePeriod,
    observations: fitted.observations,
    transients: result.transients ?? [],
  })
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
