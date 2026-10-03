// @vitest-environment node

import { describe, expect, it } from 'vite-plus/test'
import {
  formatFpsValue,
  getProjectFpsOptions,
  getProjectFpsPickerOptions,
  resolveAutoMatchProjectFps,
} from './project-fps'

describe('project-fps helpers', () => {
  it('keeps legacy fps visible when editing an older project', () => {
    const options = getProjectFpsOptions(120)

    expect(options.map((option) => option.value)).toEqual([24, 25, 30, 50, 60, 120])
    expect(options.at(-1)?.label).toContain('Legacy')
  })

  it('keeps the create picker to four scanable choices without dropping an existing rate', () => {
    expect(getProjectFpsPickerOptions(30).map((option) => option.value)).toEqual([
      24,
      25,
      30,
      60,
    ])
    expect(getProjectFpsPickerOptions(50).map((option) => option.value)).toEqual([
      24,
      25,
      30,
      60,
      50,
    ])
    expect(getProjectFpsPickerOptions(120).map((option) => option.value)).toEqual([
      24,
      25,
      30,
      60,
      120,
    ])
  })

  it('maps common source rates to the closest supported project fps', () => {
    expect(resolveAutoMatchProjectFps(29.97)).toEqual({ fps: 30, exact: false })
    expect(resolveAutoMatchProjectFps(59.94)).toEqual({ fps: 60, exact: false })
    expect(resolveAutoMatchProjectFps(120)).toEqual({ fps: 60, exact: false })
    expect(resolveAutoMatchProjectFps(240)).toEqual({ fps: 60, exact: false })
  })

  it('formats integer and decimal fps values cleanly', () => {
    expect(formatFpsValue(60)).toBe('60')
    expect(formatFpsValue(59.94)).toBe('59.94')
    expect(formatFpsValue(23.976)).toBe('23.976')
  })
})
