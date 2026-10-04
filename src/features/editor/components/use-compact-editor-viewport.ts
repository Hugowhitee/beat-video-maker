import { useEffect, useState } from 'react'

export const COMPACT_EDITOR_QUERY = '(max-width: 767px)'
export const COMPACT_EDITOR_MAX_WIDTH = 767

interface CompactViewportSnapshot {
  mediaMatches: boolean
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
 * "phone width". Brave/Chromium can expose a desktop-sized layout viewport
 * when "Desktop site" is active even though the physical screen is still
 * narrow; screen.width keeps us from rendering the 1440px producer shell on
 * that phone.
 */
export function shouldUseCompactEditorViewport({
  mediaMatches,
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
  return narrowestWidth <= COMPACT_EDITOR_MAX_WIDTH
}

function readCompactViewport(mediaMatches: boolean): boolean {
  if (typeof window === 'undefined') return mediaMatches

  return shouldUseCompactEditorViewport({
    mediaMatches,
    innerWidth: window.innerWidth,
    visualViewportWidth: window.visualViewport?.width,
    screenWidth: window.screen?.width,
  })
}

export function useCompactEditorViewport(): boolean {
  const [compact, setCompact] = useState(() => {
    if (typeof window === 'undefined') return false
    const mediaMatches =
      typeof window.matchMedia === 'function'
        ? window.matchMedia(COMPACT_EDITOR_QUERY).matches
        : false
    return readCompactViewport(mediaMatches)
  })

  useEffect(() => {
    const query =
      typeof window.matchMedia === 'function'
        ? window.matchMedia(COMPACT_EDITOR_QUERY)
        : null

    const sync = () => setCompact(readCompactViewport(query?.matches ?? false))
    sync()

    query?.addEventListener?.('change', sync)
    window.addEventListener('resize', sync)
    window.visualViewport?.addEventListener('resize', sync)

    return () => {
      query?.removeEventListener?.('change', sync)
      window.removeEventListener('resize', sync)
      window.visualViewport?.removeEventListener('resize', sync)
    }
  }, [])

  return compact
}
