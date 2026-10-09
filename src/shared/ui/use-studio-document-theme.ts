import { useEffect } from 'react'

let activeStudioThemeRoots = 0
let previousStudioAttribute: string | null = null

/**
 * Extends the canonical Studio component scope to document-level portals while a Studio
 * surface is mounted. Radix dialogs/popovers render under <body>, outside the
 * local editor/project wrapper, so without this they fall back to the unscoped component styles. Color and font tokens are global.
 */
export function useStudioDocumentTheme() {
  useEffect(() => {
    const root = document.documentElement

    if (activeStudioThemeRoots === 0) {
      previousStudioAttribute = root.getAttribute('data-studio')
      root.setAttribute('data-studio', 'true')
    }
    activeStudioThemeRoots += 1

    return () => {
      activeStudioThemeRoots = Math.max(0, activeStudioThemeRoots - 1)
      if (activeStudioThemeRoots !== 0) return

      if (previousStudioAttribute === null) {
        root.removeAttribute('data-studio')
      } else {
        root.setAttribute('data-studio', previousStudioAttribute)
      }
      previousStudioAttribute = null
    }
  }, [])
}
