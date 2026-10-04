import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import {
  COMPACT_EDITOR_QUERY,
  COMPACT_TOUCH_QUERY,
  shouldUseCompactEditorViewport,
  useCompactEditorViewport,
} from './use-compact-editor-viewport'

describe('useCompactEditorViewport', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('defaults to desktop when no narrow viewport signal is available', () => {
    vi.stubGlobal('matchMedia', undefined)
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1280,
    })
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
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) =>
        query === COMPACT_TOUCH_QUERY
          ? {
              ...media,
              matches: false,
              media: COMPACT_TOUCH_QUERY,
              addEventListener: vi.fn(),
              removeEventListener: vi.fn(),
            }
          : media,
      ),
    )

    const { result } = renderHook(() => useCompactEditorViewport())
    expect(result.current).toBe(true)

    media.matches = false
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1280,
    })
    Object.defineProperty(window.screen, 'width', {
      configurable: true,
      value: 1280,
    })
    act(() => listener?.())
    expect(result.current).toBe(false)
  })

  it('keeps a physical phone compact when desktop-site mode widens the layout viewport', () => {
    expect(
      shouldUseCompactEditorViewport({
        mediaMatches: false,
        innerWidth: 980,
        visualViewportWidth: 980,
        screenWidth: 390,
      }),
    ).toBe(true)
  })

  it('keeps a touch phone compact when desktop-site mode reports a wide viewport', () => {
    expect(
      shouldUseCompactEditorViewport({
        mediaMatches: false,
        coarsePointer: true,
        innerWidth: 980,
        visualViewportWidth: 980,
        screenWidth: 980,
      }),
    ).toBe(true)
  })

  it('does not force compact mode on a normal desktop viewport', () => {
    expect(
      shouldUseCompactEditorViewport({
        mediaMatches: false,
        coarsePointer: false,
        innerWidth: 1440,
        visualViewportWidth: 1440,
        screenWidth: 1920,
      }),
    ).toBe(false)
  })
})
