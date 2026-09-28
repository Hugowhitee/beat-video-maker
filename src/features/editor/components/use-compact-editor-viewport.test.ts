import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import {
  COMPACT_EDITOR_QUERY,
  useCompactEditorViewport,
} from './use-compact-editor-viewport'

describe('useCompactEditorViewport', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('defaults to desktop when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined)
    const { result } = renderHook(() => useCompactEditorViewport())
    expect(result.current).toBe(false)
  })

  it('tracks the compact editor breakpoint', () => {
    let listener: (() => void) | undefined
    const media = {
      matches: true,
      media: COMPACT_EDITOR_QUERY,
      addEventListener: vi.fn((_type: string, next: () => void) => {
        listener = next
      }),
      removeEventListener: vi.fn(),
    }
    vi.stubGlobal('matchMedia', vi.fn(() => media))

    const { result } = renderHook(() => useCompactEditorViewport())
    expect(result.current).toBe(true)

    media.matches = false
    act(() => listener?.())
    expect(result.current).toBe(false)
  })
})
