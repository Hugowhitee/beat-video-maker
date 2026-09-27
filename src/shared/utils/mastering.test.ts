// @vitest-environment node

import { describe, expect, it } from 'vite-plus/test'
import { analyzeProgramLevel, createSaturationMixCurve, getMasteringPreset, resolveAutoLevelInputGainDb } from './mastering'

function sampleCurve(curve: Float32Array, x: number): number {
  const normalized = Math.max(0, Math.min(1, (x + 1) / 2))
  const index = Math.round(normalized * (curve.length - 1))
  return curve[index] ?? 0
}

describe('createSaturationMixCurve', () => {
  it('is effectively dry when mix is zero even with drive enabled', () => {
    const curve = createSaturationMixCurve(8, 0, -3, 4097)
    expect(sampleCurve(curve, -0.5)).toBeCloseTo(-0.5, 3)
    expect(sampleCurve(curve, 0)).toBeCloseTo(0, 3)
    expect(sampleCurve(curve, 0.5)).toBeCloseTo(0.5, 3)
  })

  it('adds saturation inside one transfer path instead of a parallel branch', () => {
    const dry = createSaturationMixCurve(6, 0, 0, 4097)
    const wet = createSaturationMixCurve(6, 1, 0, 4097)
    expect(sampleCurve(wet, 0.25)).toBeGreaterThan(sampleCurve(dry, 0.25))
    expect(sampleCurve(wet, 1)).toBeCloseTo(1, 3)
  })

  it('applies wet output gain only to the wet contribution', () => {
    const unity = createSaturationMixCurve(4, 0.5, 0, 4097)
    const attenuated = createSaturationMixCurve(4, 0.5, -6, 4097)
    expect(Math.abs(sampleCurve(attenuated, 0.5))).toBeLessThan(
      Math.abs(sampleCurve(unity, 0.5)),
    )
    expect(Math.abs(sampleCurve(attenuated, 0.5))).toBeGreaterThan(0.25)
  })
})


describe('mastering presets', () => {
  it('provides a complete Detroit recipe on the canonical master chain', () => {
    const preset = getMasteringPreset('detroit')
    expect(preset.id).toBe('detroit')
    expect(preset.settings.enabled).toBe(true)
    expect(preset.settings.compressor?.enabled).toBe(true)
    expect(preset.settings.saturator?.enabled).toBe(true)
    expect(preset.settings.limiter?.enabled).toBe(true)
    expect(preset.settings.limiter?.ceilingDb).toBeLessThan(0)
  })
})

describe('program level analysis', () => {
  it('ignores a long silent tail when estimating program RMS', () => {
    const sampleRate = 100
    const samples = new Float32Array(sampleRate * 8)
    samples.fill(0.25, 0, sampleRate * 4)

    const level = analyzeProgramLevel([samples], sampleRate)

    expect(level.rmsDb).toBeCloseTo(-12.041, 2)
    expect(level.peakDb).toBeCloseTo(-12.041, 2)
    expect(level.analyzedBlocks).toBeGreaterThan(0)
  })

  it('returns a bounded input gain for Auto level', () => {
    expect(resolveAutoLevelInputGainDb({ rmsDb: -17, peakDb: -4, analyzedBlocks: 10 })).toBe(6)
    expect(resolveAutoLevelInputGainDb({ rmsDb: -40, peakDb: -20, analyzedBlocks: 10 })).toBe(12)
    expect(resolveAutoLevelInputGainDb({ rmsDb: -120, peakDb: -120, analyzedBlocks: 0 })).toBe(0)
  })
})
