import { describe, expect, it } from 'vitest'
import {
  buildSparseMelFilterbank,
  computeRmsEnvelope,
  getBeatThisFrameCount,
  getBeatThisWindowStarts,
  pickBeatFrames,
  projectMagnitudeToLogMel,
  summarizeRhythm,
} from './beatThisCore'

describe('Beat This core', () => {
  it('uses the canonical 50 fps frame and overlap geometry', () => {
    expect(getBeatThisFrameCount(22_050)).toBe(51)
    expect(getBeatThisWindowStarts(100)).toEqual([-6])
    expect(getBeatThisWindowStarts(3_000)).toEqual([-6, 1_482, 1_506])
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
