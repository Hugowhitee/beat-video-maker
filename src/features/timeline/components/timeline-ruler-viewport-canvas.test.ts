import { describe, expect, it } from 'vite-plus/test'
import {
  getTimelineRulerInterval,
  getTimelineRulerPalette,
} from './timeline-ruler-viewport-canvas'

describe('main timeline ruler viewport canvas', () => {
  it('chooses bounded ruler intervals across the zoom range', () => {
    expect(getTimelineRulerInterval(200)).toEqual({
      intervalInSeconds: 0.5,
      minorTicks: 3,
    })
    expect(getTimelineRulerInterval(80)).toEqual({
      intervalInSeconds: 1,
      minorTicks: 4,
    })
    expect(getTimelineRulerInterval(0.1)).toEqual({
      intervalInSeconds: 1800,
      minorTicks: 2,
    })
  })

  it('uses near-black marks and labels on the light producer ruler', () => {
    const palette = getTimelineRulerPalette('light')
    expect(palette.major).toContain('23, 25, 23')
    expect(palette.label).toContain('0.82')
    expect(palette.labelShadow).toBe('none')
  })
})
