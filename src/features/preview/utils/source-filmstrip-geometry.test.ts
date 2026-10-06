import { describe, expect, it } from 'vite-plus/test'
import {
  frameFromSourceStripRatio,
  framePercentInSourceWindow,
  resolveSourceFilmstripWindow,
} from './source-filmstrip-geometry'

describe('source filmstrip geometry', () => {
  it('retains an overview of the full source at 1x', () => {
    expect(resolveSourceFilmstripWindow(300, 1, 280)).toEqual({ start: 0, end: 300 })
  })

  it('zooms around a boundary without passing the source end', () => {
    expect(resolveSourceFilmstripWindow(300, 4, 280)).toEqual({ start: 225, end: 300 })
  })

  it('keeps frame-perfect exclusive out and inclusive seek positions', () => {
    const range = { start: 225, end: 300 }
    expect(frameFromSourceStripRatio(range, 0)).toBe(225)
    expect(frameFromSourceStripRatio(range, 1)).toBe(299)
    expect(frameFromSourceStripRatio(range, 1, true)).toBe(300)
    expect(frameFromSourceStripRatio(range, -3)).toBe(225)
    expect(framePercentInSourceWindow(range, 262.5)).toBe(50)
  })

  it('keeps short sources bounded even at maximum zoom', () => {
    expect(resolveSourceFilmstripWindow(1, 32, 1)).toEqual({ start: 0, end: 1 })
  })
})
