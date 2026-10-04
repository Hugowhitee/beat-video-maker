import { useEffect, useState } from 'react'

export const COMPACT_EDITOR_QUERY = '(max-width: 767px)'
export const COMPACT_TOUCH_QUERY = '(hover: none) and (pointer: coarse)'
export const COMPACT_EDITOR_MAX_WIDTH = 767
export const COMPACT_TOUCH_MAX_WIDTH = 1100

interface CompactViewportSnapshot {
  mediaMatches: boolean
  coarsePointer?: boolean
  innerWidth?: number
  visualViewportWidth?: number
  screenWidth?: number
}

function usableWidth(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : Number.POSITIVE_INFINITY
}

/**
 * Prefer the compact editor whenever any trustworthy CSS-pixel viewport says
 * "phone width". Mobile browsers can expose a desktop-sized layout viewport
 * when "Desktop site" is active, so a coarse primary pointer is also treated
 * as compact up to a tablet-sized ceiling. This prevents the 1440px producer
 * shell from being squeezed onto a touch phone while keeping normal desktop
 * and laptop layouts unchanged.
 */
export function shouldUseCompactEditorViewport({
  mediaMatches,
  coarsePointer = false,
  innerWidth,
  visualViewportWidth,
  screenWidth,
}: CompactViewportSnapshot): boolean {
  if (mediaMatches) return true

  const narrowestWidth = Math.min(
    usableWidth(innerWidth),
    usableWidth(visualViewportWidth),
    usableWidth(screenWidth),
  )
  if (narrowestWidth <= COMPACT_EDITOR_MAX_WIDTH) return true

  return coarsePointer && usableWidth(innerWidth) <= COMPACT_TOUCH_MAX_WIDTH
}

function readCompactViewport(mediaMatches: boolean, coarsePointer: boolean): boolean {
  if (typeof window === 'undefined') return mediaMatches

  return shouldUseCompactEditorViewport({
    mediaMatches,
    coarsePointer,
    innerWidth: window.innerWidth,
    visualViewportWidth: window.visualViewport?.width,
    screenWidth: window.screen?.width,
  })
}

export function useCompactEditorViewport(): boolean {
  const [compact, setCompact] = useState(() => {
    if (typeof window === 'undefined') return false
    const widthQuery =
      typeof window.matchMedia === 'function'
        ? window.matchMedia(COMPACT_EDITOR_QUERY)
        : null
    const touchQuery =
      typeof window.matchMedia === 'function'
        ? window.matchMedia(COMPACT_TOUCH_QUERY)
        : null
    return readCompactViewport(widthQuery?.matches ?? false, touchQuery?.matches ?? false)
  })

  useEffect(() => {
    const widthQuery =
      typeof window.matchMedia === 'function'
        ? window.matchMedia(COMPACT_EDITOR_QUERY)
        : null
    const touchQuery =
      typeof window.matchMedia === 'function'
        ? window.matchMedia(COMPACT_TOUCH_QUERY)
        : null

    const sync = () =>
      setCompact(
        readCompactViewport(
          widthQuery?.matches ?? false,
          touchQuery?.matches ?? false,
        ),
      )
    sync()

    widthQuery?.addEventListener?.('change', sync)
    touchQuery?.addEventListener?.('change', sync)
    window.addEventListener('resize', sync)
    window.visualViewport?.addEventListener('resize', sync)

    return () => {
      widthQuery?.removeEventListener?.('change', sync)
      touchQuery?.removeEventListener?.('change', sync)
      window.removeEventListener('resize', sync)
      window.visualViewport?.removeEventListener('resize', sync)
    }
  }, [])

  return compact
}
