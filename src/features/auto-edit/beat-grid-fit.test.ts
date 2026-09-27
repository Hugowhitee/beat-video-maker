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
