// @vitest-environment node

import { describe, expect, it } from 'vite-plus/test'
import {
  AUTO_LEVEL_LIMITER_CEILING_DB,
  analyzeProgramLevel,
  createSaturationMixCurve,
  getMasteringPreset,
  resolveAutoLevelInputGainDb,
  resolveAutoLevelPlan,
  resolveMasterFxSettings,
} from './mastering'

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


describe('master rack order', () => {
  it('keeps legacy projects on the canonical processor order', () => {
    expect(resolveMasterFxSettings(undefined).order).toEqual([
      'eq',
      'compressor',
      'saturator',
      'limiter',
    ])
  })

  it('keeps a valid custom rack and treats omitted processors as empty slots', () => {
    const resolved = resolveMasterFxSettings({
      order: ['limiter', 'eq', 'limiter'],
      processorInstanceIds: { limiter: 'slot-limit', eq: 'slot-eq' },
    })
    expect(resolved.order).toEqual(['limiter', 'eq'])
    expect(resolved.processorInstanceIds).toEqual({ limiter: 'slot-limit', eq: 'slot-eq' })
  })
})

describe('mastering presets', () => {
  it('keeps the legacy preset id compatible while exposing a genre-neutral recipe', () => {
    const preset = getMasteringPreset('detroit')
    expect(preset.id).toBe('detroit')
    expect(preset.label).toBe('Dry Punch')
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
    expect(resolveAutoLevelInputGainDb({ rmsDb: -17, peakDb: -4, analyzedBlocks: 10 })).toBeCloseTo(3.2, 5)
    expect(resolveAutoLevelInputGainDb({ rmsDb: -40, peakDb: -20, analyzedBlocks: 10 })).toBe(12)
    expect(resolveAutoLevelInputGainDb({ rmsDb: -120, peakDb: -120, analyzedBlocks: 0 })).toBe(0)
  })

  it('uses only real pre-FX peak headroom for positive trim', () => {
    const plan = resolveAutoLevelPlan({ rmsDb: -17, peakDb: -4, analyzedBlocks: 10 })

    expect(plan.inputGainDb).toBeCloseTo(3.2, 5)
    expect(plan.projectedRmsDb).toBeCloseTo(-13.8, 5)
    expect(plan.projectedPeakDb).toBeCloseTo(AUTO_LEVEL_LIMITER_CEILING_DB, 5)
    expect(plan.limitedByPeak).toBe(true)
    expect(plan.estimatedLimiterReductionDb).toBeCloseTo(0, 5)
  })

  it('does not make an already near-ceiling beat louder to chase RMS', () => {
    const plan = resolveAutoLevelPlan({ rmsDb: -13, peakDb: -0.1, analyzedBlocks: 10 })

    expect(plan.inputGainDb).toBeCloseTo(-0.7, 5)
    expect(plan.projectedPeakDb).toBeCloseTo(AUTO_LEVEL_LIMITER_CEILING_DB, 5)
    expect(plan.estimatedLimiterReductionDb).toBeCloseTo(0, 5)
  })

  it('can leave a healthy mastered source effectively unchanged', () => {
    const plan = resolveAutoLevelPlan({ rmsDb: -11.5, peakDb: -1, analyzedBlocks: 10 })

    expect(plan.inputGainDb).toBe(0)
    expect(plan.projectedPeakDb).toBe(-1)
    expect(plan.estimatedLimiterReductionDb).toBe(0)
  })

  it('backs off before the limiter instead of budgeting limiter reduction', () => {
    const plan = resolveAutoLevelPlan({ rmsDb: -20, peakDb: -2, analyzedBlocks: 10 })

    expect(plan.inputGainDb).toBeCloseTo(1.2, 5)
    expect(plan.limitedByPeak).toBe(true)
    expect(plan.projectedRmsDb).toBeLessThan(plan.targetRmsDb)
    expect(plan.projectedPeakDb).toBeCloseTo(AUTO_LEVEL_LIMITER_CEILING_DB, 5)
    expect(plan.estimatedLimiterReductionDb).toBeCloseTo(0, 5)
  })
})
