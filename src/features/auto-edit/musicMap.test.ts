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
  it('preserves true beat/downbeat evidence and builds eight-bar phrases', () => {
    const map = buildMusicMapFromRhythm(rhythm(), 64)

    expect(map.bpm).toBe(120)
    expect(map.beatsPerBar).toBe(4)
    expect(map.beats[0]).toMatchObject({ time: 0, downbeat: true, strength: 0.95 })
    expect(map.beats[1]).toMatchObject({ time: 0.5, downbeat: false })
    expect(map.sections.map((section) => [section.start, section.end])).toEqual([
      [0, 16],
      [16, 32],
      [32, 48],
      [48, 64],
    ])
    expect(map.sections[0]?.kind).toBe('intro')
    expect(map.sections[2]?.kind).toBe('drop')
    expect(map.sections[2]?.energy).toBeGreaterThan(0.8)
  })

  it('keeps section labels conservative when downbeats are unavailable', () => {
    const source = rhythm({ downbeats: [] })
    const map = buildMusicMapFromRhythm(source, 64)

    expect(map.beats.some((beat) => beat.downbeat)).toBe(false)
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
