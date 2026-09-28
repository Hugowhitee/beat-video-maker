import { useEffect, useState } from 'react'

export const COMPACT_EDITOR_QUERY = '(max-width: 767px)'

export function useCompactEditorViewport(): boolean {
  const [compact, setCompact] = useState(false)

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    ) {
      return
    }

    const query = window.matchMedia(COMPACT_EDITOR_QUERY)
    const sync = () => setCompact(query.matches)
    sync()

    query.addEventListener?.('change', sync)
    return () => query.removeEventListener?.('change', sync)
  }, [])

  return compact
}
