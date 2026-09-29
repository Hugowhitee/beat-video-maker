import { describe, expect, it } from 'vitest'
import {
  BEAT_THIS_CHUNK_FRAMES,
  buildSparseMelFilterbank,
  computeRmsEnvelope,
  consecutiveProbeBpms,
  getBeatThisFrameCount,
  getBeatThisWindowStarts,
  pickBeatFrames,
  projectMagnitudeToLogMel,
  summarizeRhythm,
} from './beatThisCore'

describe('Beat This core', () => {
  it('uses the canonical 50 fps frame and overlap geometry', () => {
    expect(BEAT_THIS_CHUNK_FRAMES).toBe(513)
    expect(getBeatThisFrameCount(22_050)).toBe(51)
    expect(getBeatThisWindowStarts(100)).toEqual([-6])
    expect(getBeatThisWindowStarts(3_000)).toEqual([-6, 495, 996, 1_497, 1_998, 2_493])
  })

  it('projects sparse mel weights without changing the dense result', () => {
    const dense = new Float32Array([
      1, 0,
      0.5, 0.25,
      0, 2,
    ])
    const sparse = buildSparseMelFilterbank(dense, 3, 2)
    const output = new Float32Array(2)

    projectMagnitudeToLogMel(new Float32Array([2, 4, 1]), sparse, output)

    expect(output[0]).toBeCloseTo(Math.log1p(4_000), 5)
    expect(output[1]).toBeCloseTo(Math.log1p(3_000), 5)
  })

  it('picks local beat peaks and snaps downbeats onto the beat grid', () => {
    const beats = new Float32Array([0, 4, 0, 0, 0, 0, 3, 0, 0, 0])
    const downbeats = new Float32Array([0, 0, 2, 0, 0, 0, 0, 2, 0, 0])

    const result = pickBeatFrames(beats, downbeats)

    expect(result.beatFrames).toEqual([1, 6])
    expect(result.downbeatFrames).toEqual([1, 6])
    expect(result.beatStrengths[0]).toBeGreaterThan(result.beatStrengths[1] ?? 0)
  })

  it('summarizes a stable 4/4 120 BPM grid', () => {
    const beats = Array.from({ length: 17 }, (_, index) => index * 0.5)
    const downbeats = [0, 2, 4, 6, 8]

    const result = summarizeRhythm(beats, downbeats, [120, 120.2, 119.8])

    expect(result.bpm).toBeCloseTo(120, 0)
    expect(result.meter).toBe(4)
    expect(result.beats).toEqual(beats)
    expect(result.downbeats).toEqual(downbeats)
  })

  it('averages Beat This frame jitter over long spans without forcing an integer tempo', () => {
    const period = 60 / 98
    const beats = Array.from({ length: 129 }, (_, index) =>
      index * period + (index % 3 === 0 ? 0.01 : index % 3 === 1 ? -0.01 : 0),
    )
    const downbeats = beats.filter((_, index) => index % 4 === 0)

    const result = summarizeRhythm(beats, downbeats, [])

    expect(result.bpm).toBeCloseTo(98, 0)
    expect(result.bpm).not.toBe(98)
  })

  it('keeps a stable programmed tempo when one detector beat is missing', () => {
    const period = 60 / 100
    const fullBeats = Array.from({ length: 81 }, (_, index) => index * period)
    const beats = fullBeats.filter((_, index) => index !== 31)
    const downbeats = fullBeats.filter((_, index) => index % 4 === 0)

    const result = summarizeRhythm(beats, downbeats, [])

    expect(result.bpm).toBeCloseTo(100, 0)
    expect(result.meter).toBe(4)
  })

  it('rejects a short false 3/4 downbeat pattern and keeps a safe 4/4 grid', () => {
    const period = 60 / 95
    const beats = Array.from({ length: 16 }, (_, index) => index * period)
    const downbeats = beats.filter((_, index) => index % 3 === 0)

    const result = summarizeRhythm(beats, downbeats, [95, 95.1, 94.9])

    expect(result.bpm).toBeCloseTo(95, 0)
    expect(result.meter).toBe(4)
  })

  it('preserves a stable 3/4 meter when it repeats long enough to be credible', () => {
    const period = 60 / 105
    const beats = Array.from({ length: 37 }, (_, index) => index * period)
    const downbeats = beats.filter((_, index) => index % 3 === 0)

    const result = summarizeRhythm(beats, downbeats, [105, 105.1, 104.9])

    expect(result.bpm).toBeCloseTo(105, 0)
    expect(result.meter).toBe(3)
  })

  it('recovers a 90 BPM project grid from stable 45 BPM half-time detections', () => {
    const rawPeriod = 60 / 45
    const beats = Array.from({ length: 17 }, (_, index) => index * rawPeriod)
    const downbeats = beats.filter((_, index) => index % 2 === 0)

    const result = summarizeRhythm(beats, downbeats, [45, 45.1, 44.9])

    expect(result.bpm).toBeCloseTo(90, 0)
    expect(result.meter).toBe(4)
    expect(result.beats[1]).toBeCloseTo(60 / 90, 5)
    expect(result.downbeats[1]).toBeCloseTo((60 / 90) * 4, 5)
  })

  it('recovers a 90 BPM project grid from stable 180 BPM double-time detections', () => {
    const rawPeriod = 60 / 180
    const beats = Array.from({ length: 65 }, (_, index) => index * rawPeriod)
    const downbeats = beats.filter((_, index) => index % 8 === 0)

    const result = summarizeRhythm(beats, downbeats, [180, 179.9, 180.1])

    expect(result.bpm).toBeCloseTo(90, 0)
    expect(result.beats[1]).toBeCloseTo(60 / 90, 5)
    expect(result.meter).toBe(4)
  })

  it('does not force a clearly fractional programmed tempo to an integer', () => {
    const period = 60 / 97.5
    const beats = Array.from({ length: 97 }, (_, index) => index * period)
    const downbeats = beats.filter((_, index) => index % 4 === 0)

    const result = summarizeRhythm(beats, downbeats, [])

    expect(result.bpm).toBeCloseTo(97.5, 4)
  })

  it('keeps a precise near-integer tempo instead of introducing long-song drift', () => {
    const bpm = 89.72
    const period = 60 / bpm
    const beats = Array.from({ length: 270 }, (_, index) =>
      0.31 + index * period + (index % 3 === 0 ? 0.008 : index % 3 === 1 ? -0.006 : 0),
    )
    const downbeats = beats.filter((_, index) => index % 4 === 0)

    const result = summarizeRhythm(
      beats,
      downbeats,
      consecutiveProbeBpms(beats, beats.at(-1) ?? 180),
    )

    expect(Math.abs(result.bpm - bpm)).toBeLessThan(0.1)
    expect(Math.abs(result.bpm - 90)).toBeGreaterThan(0.15)
  })

  it('takes distributed overlapping tempo probes across a normal full song', () => {
    const bpm = 96.4
    const period = 60 / bpm
    const duration = 150
    const beats = Array.from(
      { length: Math.floor(duration / period) },
      (_, index) => 0.27 + index * period,
    )

    const probes = consecutiveProbeBpms(beats, duration)

    expect(probes.length).toBeGreaterThanOrEqual(5)
    for (const probe of probes) expect(probe).toBeCloseTo(bpm, 1)
  })

  it('normalizes RMS energy without inventing values above one', () => {
    const audio = new Float32Array(100)
    audio.fill(1, 0, 50)
    audio.fill(0.25, 50)

    const result = computeRmsEnvelope(audio, 100, 0.5)

    expect(result.energy).toHaveLength(2)
    expect(result.energy[0]).toBeCloseTo(1, 6)
    expect(result.energy[1]).toBeCloseTo(0.5, 6)
    expect(Math.max(...result.energy)).toBeLessThanOrEqual(1)
  })
})
