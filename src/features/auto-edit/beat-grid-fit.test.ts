import { describe, expect, it } from 'vite-plus/test'
import type { BeatThisRhythmResult } from './beatThisCore'
import { stabilizeBeatGrid } from './beat-grid-fit'

function rhythm(params: {
  beats: number[]
  bpm?: number
  downbeats?: number[]
  transients?: BeatThisRhythmResult['transients']
}): BeatThisRhythmResult {
  return {
    bpm: params.bpm ?? 120,
    beats: params.beats,
    downbeats: params.downbeats ?? params.beats.filter((_, index) => index % 4 === 0),
    beatStrengths: params.beats.map(() => 0.8),
    transients: params.transients,
    meter: 4,
    backend: 'webgpu',
    energy: new Float32Array([0.5]),
    energyHopSeconds: 0.25,
  }
}

describe('stabilizeBeatGrid', () => {
  it('turns jittery detector points into one stable programmed-tempo grid', () => {
    const beats = Array.from({ length: 64 }, (_, index) =>
      0.42 + index * 0.5 + (index % 3 === 0 ? 0.012 : index % 3 === 1 ? -0.009 : 0.004),
    )
    const result = stabilizeBeatGrid(rhythm({ beats }), 33)

    expect(result.fit.mode).toBe('fixed')
    expect(result.fit.confidence).toBeGreaterThan(0.6)
    expect(result.rhythm.bpm).toBeCloseTo(120, 1)
    const intervals = result.rhythm.beats
      .slice(1)
      .map((time, index) => time - result.rhythm.beats[index]!)
    expect(Math.max(...intervals) - Math.min(...intervals)).toBeLessThan(1e-6)
  })

  it('shifts the fitted phase toward coherent audio onsets instead of late model peaks', () => {
    const beats = Array.from({ length: 48 }, (_, index) => 0.53 + index * 0.5)
    const transients = beats.map((time, index) => ({
      time: time - 0.035,
      index,
      strength: 0.9,
      low: 0.9,
      mid: 0.25,
      high: 0.1,
    }))
    const result = stabilizeBeatGrid(rhythm({ beats, transients }), 25)

    expect(result.fit.mode).toBe('fixed')
    expect(result.fit.phaseShiftMs).toBeLessThan(-20)
    expect(result.rhythm.beats[0]).toBeCloseTo(0.495, 2)
  })

  it('repairs a stable 95 BPM grid when tempo is right but beat phase is far off', () => {
    const period = 60 / 95
    const audiblePhase = 0.31
    const detectorPhase = audiblePhase + 0.21
    const beats = Array.from({ length: 48 }, (_, index) => detectorPhase + index * period)
    const transients = Array.from({ length: 48 }, (_, index) => ({
      time: audiblePhase + index * period,
      index,
      strength: 0.94,
      low: 0.92,
      mid: 0.24,
      high: 0.08,
    }))

    const result = stabilizeBeatGrid(
      rhythm({ beats, bpm: 95, downbeats: beats.filter((_, index) => index % 4 === 0), transients }),
      31,
    )

    expect(result.fit.mode).toBe('fixed')
    expect(result.rhythm.bpm).toBeCloseTo(95, 1)
    expect(result.fit.phaseShiftMs).toBeLessThan(-170)
    expect(result.rhythm.beats[0]).toBeCloseTo(audiblePhase, 2)
  })

  it('repairs a half-beat detector phase when coherent kick onsets define the beat start', () => {
    const period = 0.5
    const kickPhase = 0.3
    const detectorPhase = kickPhase + period / 2
    const beats = Array.from({ length: 48 }, (_, index) => detectorPhase + index * period)
    const transients = Array.from({ length: 48 }, (_, index) => [
      {
        time: kickPhase + index * period,
        index: index * 2,
        strength: 0.86,
        low: 0.96,
        mid: 0.14,
        high: 0.04,
      },
      {
        time: detectorPhase + index * period,
        index: index * 2 + 1,
        strength: 1,
        low: 0.06,
        mid: 0.74,
        high: 0.58,
      },
    ]).flat()

    const result = stabilizeBeatGrid(rhythm({ beats, bpm: 120, transients }), 25)

    expect(result.fit.mode).toBe('fixed')
    expect(result.fit.phaseShiftMs).toBeLessThan(-230)
    expect(result.rhythm.beats[0]).toBeCloseTo(kickPhase, 2)
    expect(result.rhythm.downbeats[0]).toBeCloseTo(kickPhase, 2)
    expect(result.fit.anchorTime).toBeCloseTo(kickPhase, 2)
  })

  it('does not let a loud broadband snare field invent a half-beat kick phase', () => {
    const period = 0.5
    const phase = 0.3
    const beats = Array.from({ length: 48 }, (_, index) => phase + index * period)
    const transients = beats.flatMap((time, index) => [
      {
        time,
        index: index * 2,
        strength: 0.42,
        low: 0.08,
        mid: 0.42,
        high: 0.2,
      },
      {
        time: time + period / 2,
        index: index * 2 + 1,
        strength: 1,
        low: 0.24,
        mid: 1,
        high: 0.25,
      },
    ])

    const result = stabilizeBeatGrid(rhythm({ beats, bpm: 120, transients }), 25)

    expect(result.fit.mode).toBe('fixed')
    expect(Math.abs(result.fit.phaseShiftMs)).toBeLessThan(40)
    expect(result.rhythm.beats[0]).toBeCloseTo(phase, 2)
  })

  it('does not let strong off-beat hats steal the grid from low-end beat onsets', () => {
    const period = 0.5
    const phase = 0.4
    const beats = Array.from({ length: 48 }, (_, index) => phase + index * period)
    const transients = beats.flatMap((time, index) => [
      {
        time,
        index: index * 2,
        strength: 0.84,
        low: 0.9,
        mid: 0.22,
        high: 0.08,
      },
      {
        time: time + period / 2,
        index: index * 2 + 1,
        strength: 1,
        low: 0.04,
        mid: 0.24,
        high: 0.98,
      },
    ])

    const result = stabilizeBeatGrid(rhythm({ beats, bpm: 120, transients }), 25)

    expect(result.fit.mode).toBe('fixed')
    expect(Math.abs(result.fit.phaseShiftMs)).toBeLessThan(40)
    expect(result.rhythm.beats[0]).toBeCloseTo(phase, 2)
  })

  it('fits a long stable grid without cycle slip when the seed BPM is slightly wrong', () => {
    const actualBpm = 89.72
    const seedBpm = 90
    const period = 60 / actualBpm
    const phase = 0.37
    const duration = 180
    const beats = Array.from(
      { length: Math.floor((duration - phase) / period) },
      (_, index) =>
        phase + index * period + (index % 4 === 0 ? 0.009 : index % 4 === 1 ? -0.006 : 0),
    )

    const result = stabilizeBeatGrid(
      rhythm({
        beats,
        bpm: seedBpm,
        downbeats: beats.filter((_, index) => index % 4 === 0),
      }),
      duration,
    )

    expect(result.fit.mode).toBe('fixed')
    expect(result.rhythm.bpm).toBeCloseTo(actualBpm, 1)
    const lateBeat = result.rhythm.beats.findLast((time) => time < 170)
    expect(lateBeat).toBeDefined()
    const cycle = Math.round(((lateBeat ?? phase) - phase) / period)
    expect(Math.abs((lateBeat ?? 0) - (phase + cycle * period))).toBeLessThan(0.03)
  })

  it('uses recurring low-end onset measurements to correct cumulative BPM drift', () => {
    const detectorBpm = 119.4
    const actualBpm = 120
    const detectorPeriod = 60 / detectorBpm
    const actualPeriod = 60 / actualBpm
    const phase = 0.31
    const duration = 180
    const count = Math.floor((duration - phase) / detectorPeriod)
    const beats = Array.from({ length: count }, (_, index) => phase + index * detectorPeriod)
    const transients = Array.from(
      { length: Math.floor((duration - phase) / actualPeriod) },
      (_, index) => ({
        time: phase + index * actualPeriod,
        index,
        strength: 0.94,
        low: 0.95,
        mid: 0.18,
        high: 0.04,
      }),
    )

    const result = stabilizeBeatGrid(
      rhythm({
        beats,
        bpm: detectorBpm,
        downbeats: beats.filter((_, index) => index % 4 === 0),
        transients,
      }),
      duration,
    )

    expect(result.fit.mode).toBe('fixed')
    expect(result.rhythm.bpm).toBeCloseTo(actualBpm, 1)
    expect(result.rhythm.beats[0]).toBeCloseTo(phase, 2)
    const lateBeat = result.rhythm.beats.findLast((time) => time < 170)
    expect(lateBeat).toBeDefined()
    const nearestActualCycle = Math.round(((lateBeat ?? phase) - phase) / actualPeriod)
    const nearestActualBeat = phase + nearestActualCycle * actualPeriod
    expect(Math.abs((lateBeat ?? 0) - nearestActualBeat)).toBeLessThan(0.035)
  })

  it('does not retune the whole song from low-end evidence confined to one region', () => {
    const detectorBpm = 119.4
    const actualBpm = 120
    const detectorPeriod = 60 / detectorBpm
    const actualPeriod = 60 / actualBpm
    const phase = 0.31
    const duration = 180
    const beats = Array.from(
      { length: Math.floor((duration - phase) / detectorPeriod) },
      (_, index) => phase + index * detectorPeriod,
    )
    const transients = Array.from({ length: 80 }, (_, index) => ({
      time: phase + index * actualPeriod,
      index,
      strength: 0.94,
      low: 0.95,
      mid: 0.18,
      high: 0.04,
    }))

    const result = stabilizeBeatGrid(
      rhythm({
        beats,
        bpm: detectorBpm,
        downbeats: beats.filter((_, index) => index % 4 === 0),
        transients,
      }),
      duration,
    )

    expect(result.fit.mode).toBe('fixed')
    expect(result.rhythm.bpm).toBeCloseTo(detectorBpm, 2)
  })

  it('does not retune tempo from sparse isolated low-end fills', () => {
    const bpm = 120
    const period = 60 / bpm
    const phase = 0.31
    const beats = Array.from({ length: 240 }, (_, index) => phase + index * period)
    const transients = [
      {
        time: phase + 0.08,
        index: 0,
        strength: 1,
        low: 1,
        mid: 0.1,
        high: 0.02,
      },
      {
        time: phase + period * 80 - 0.06,
        index: 1,
        strength: 0.95,
        low: 0.9,
        mid: 0.1,
        high: 0.02,
      },
      {
        time: phase + period * 160 + 0.07,
        index: 2,
        strength: 0.95,
        low: 0.9,
        mid: 0.1,
        high: 0.02,
      },
    ]

    const result = stabilizeBeatGrid(rhythm({ beats, bpm, transients }), 125)

    expect(result.fit.mode).toBe('fixed')
    expect(result.rhythm.bpm).toBeCloseTo(120, 3)
    expect(result.rhythm.beats[0]).toBeCloseTo(phase, 2)
  })

  it('can recover kick phase when low-end onsets are missing on alternating beats', () => {
    const period = 0.5
    const kickPhase = 0.28
    const detectorPhase = kickPhase + period / 2
    const beats = Array.from({ length: 48 }, (_, index) => detectorPhase + index * period)
    const transients = beats.flatMap((time, index) => {
      const evidence = [{
        time,
        index: index * 2 + 1,
        strength: 1,
        low: 0.05,
        mid: 0.8,
        high: 0.45,
      }]
      if (index % 2 === 0) {
        evidence.push({
          time: kickPhase + index * period,
          index: index * 2,
          strength: 0.92,
          low: 0.97,
          mid: 0.16,
          high: 0.04,
        })
      }
      return evidence
    })

    const result = stabilizeBeatGrid(rhythm({ beats, bpm: 120, transients }), 25)

    expect(result.fit.mode).toBe('fixed')
    expect(result.fit.phaseShiftMs).toBeLessThan(-220)
    expect(result.rhythm.beats[0]).toBeCloseTo(kickPhase, 2)
  })

  it('does not move a whole grid from one isolated low-end attack in a sustained passage', () => {
    const period = 0.5
    const kickPhase = 0.28
    const detectorPhase = kickPhase + period / 2
    const beats = Array.from({ length: 48 }, (_, index) => detectorPhase + index * period)
    const transients = [{
      time: kickPhase,
      index: 0,
      strength: 1,
      low: 1,
      mid: 0.1,
      high: 0,
    }]

    const result = stabilizeBeatGrid(rhythm({ beats, bpm: 120, transients }), 25)

    expect(result.fit.mode).toBe('fixed')
    expect(Math.abs(result.fit.phaseShiftMs)).toBeLessThan(80)
    expect(result.rhythm.beats[0]).toBeCloseTo(detectorPhase, 2)
  })

  it('keeps the first fitted downbeat when detector jitter lands just after the fitted phase', () => {
    const period = 0.5
    const musicalPhase = 0.42
    const beats = Array.from({ length: 48 }, (_, index) =>
      musicalPhase + index * period + (index === 0 ? 0.012 : index % 3 === 1 ? -0.006 : 0.004),
    )
    const downbeats = beats.filter((_, index) => index % 4 === 0)

    const result = stabilizeBeatGrid(rhythm({ beats, bpm: 120, downbeats }), 25)

    expect(result.fit.mode).toBe('fixed')
    expect(result.rhythm.beats[0]).toBeLessThan(0.5)
    expect(result.rhythm.downbeats[0]).toBeLessThan(0.5)
    expect(result.fit.anchorTime).toBe(result.rhythm.downbeats[0])
  })

  it('preserves a musical Bar 1 after a long quiet intro instead of pulling the grid to zero', () => {
    const period = 60 / 96
    const firstBeat = 8.31
    const beats = Array.from({ length: 48 }, (_, index) => firstBeat + index * period)
    const downbeats = beats.filter((_, index) => index % 4 === 0)

    const result = stabilizeBeatGrid(rhythm({ beats, bpm: 96, downbeats }), 40)

    expect(result.fit.mode).toBe('fixed')
    expect(result.fit.anchorTime).toBeCloseTo(firstBeat, 2)
    expect(result.rhythm.downbeats[0]).toBeCloseTo(firstBeat, 2)
    expect(result.rhythm.beats[0]).toBeGreaterThan(8)
  })

  it('keeps a drifting live-tempo sequence as a variable beat map', () => {
    const beats: number[] = []
    let time = 0.4
    for (let index = 0; index < 64; index += 1) {
      beats.push(time)
      time += 0.46 + index * 0.0018
    }
    const result = stabilizeBeatGrid(rhythm({ beats, bpm: 120 }), time + 1)

    expect(result.fit.mode).toBe('variable')
    expect(result.rhythm.beats).toEqual(beats)
  })

  it('keeps bar one aligned to the nearest fitted beat instead of forcing zero', () => {
    const beats = Array.from({ length: 40 }, (_, index) => 0.37 + index * 0.5)
    const downbeats = beats.filter((_, index) => index % 4 === 0)
    const result = stabilizeBeatGrid(rhythm({ beats, downbeats }), 21)

    expect(result.fit.mode).toBe('fixed')
    expect(result.fit.anchorTime).not.toBeNull()
    expect(result.fit.anchorTime!).toBeGreaterThan(0.2)
  })
})
