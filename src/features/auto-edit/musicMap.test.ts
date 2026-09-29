import { describe, expect, it } from 'vitest'
import type { BeatThisRhythmResult } from './beatThisCore'
import { buildMusicMapFromRhythm } from './musicMap'

function rhythm(overrides: Partial<BeatThisRhythmResult> = {}): BeatThisRhythmResult {
  const duration = 64
  const beats = Array.from({ length: duration * 2 }, (_, index) => index * 0.5)
  const downbeats = Array.from({ length: duration / 2 }, (_, index) => index * 2)
  const energy = new Float32Array(duration * 4)

  for (let index = 0; index < energy.length; index += 1) {
    const time = index * 0.25
    energy[index] =
      time < 16 ? 0.2
        : time < 32 ? 0.3
          : time < 48 ? 0.9
            : 0.8
  }

  return {
    bpm: 120,
    beats,
    downbeats,
    beatStrengths: beats.map((_, index) => (index % 4 === 0 ? 0.95 : 0.7)),
    meter: 4,
    backend: 'webgpu',
    energy,
    energyHopSeconds: 0.25,
    ...overrides,
  }
}

describe('buildMusicMapFromRhythm', () => {
  it('preserves beat/downbeat evidence and creates sections from musical changes', () => {
    const map = buildMusicMapFromRhythm(rhythm(), 64)

    expect(map.bpm).toBe(120)
    expect(map.beatsPerBar).toBe(4)
    expect(map.beats[0]).toMatchObject({ time: 0, downbeat: true, strength: 0.95 })
    expect(map.beats[1]).toMatchObject({ time: 0.5, downbeat: false })
    expect(map.sections.some((section) => Math.abs(section.start - 32) < 0.1)).toBe(true)
    expect(map.sections.find((section) => Math.abs(section.start - 32) < 0.1)?.kind).toBe('drop')
  })

  it('detects a strong change away from the old fixed eight-bar boundary', () => {
    const source = rhythm()
    const energy = new Float32Array(64 * 4)
    for (let index = 0; index < energy.length; index += 1) {
      const time = index * 0.25
      energy[index] = time < 12 ? 0.2 : time < 38 ? 0.78 : 0.28
    }

    const map = buildMusicMapFromRhythm({ ...source, energy }, 64)

    expect(map.sections.some((section) => Math.abs(section.start - 12) < 0.1)).toBe(true)
    expect(map.sections.some((section) => Math.abs(section.start - 38) < 0.1)).toBe(true)
    expect(map.sections.every((section) => section.kind !== 'chorus' && section.kind !== 'verse')).toBe(true)
  })

  it('keeps section labels conservative but still provides bar lines when downbeats are unavailable', () => {
    const source = rhythm({ downbeats: [] })
    const map = buildMusicMapFromRhythm(source, 64)

    expect(map.beats.filter((beat) => beat.downbeat).slice(0, 3).map((beat) => beat.time)).toEqual([
      0,
      2,
      4,
    ])
    expect(map.sections.length).toBeGreaterThan(1)
    expect(Math.max(...map.sections.map((section) => section.confidence))).toBeLessThanOrEqual(0.58)
    expect(map.sections.every((section) => section.kind !== 'chorus' && section.kind !== 'verse')).toBe(true)
  })

  it('rejects a non-positive duration', () => {
    expect(() => buildMusicMapFromRhythm(rhythm(), 0)).toThrow(
      'Music duration must be positive.',
    )
  })
})
