// @vitest-environment node

import { describe, expect, it } from 'vite-plus/test'
import { createSaturationMixCurve } from './mastering'

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
