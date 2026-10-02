import { useEffect } from 'react'

let activeStudioThemeRoots = 0
let previousStudioAttribute: string | null = null

/**
 * Extends the Studio V2 token scope to document-level portals while a Studio
 * surface is mounted. Radix dialogs/popovers render under <body>, outside the
 * local editor/project wrapper, so without this they fall back to the legacy
 * dark theme and can become unreadable beside the light Figma shell.
 */
export function useStudioV2DocumentTheme() {
  useEffect(() => {
    const root = document.documentElement

    if (activeStudioThemeRoots === 0) {
      previousStudioAttribute = root.getAttribute('data-studio-v2')
      root.setAttribute('data-studio-v2', 'true')
    }
    activeStudioThemeRoots += 1

    return () => {
      activeStudioThemeRoots = Math.max(0, activeStudioThemeRoots - 1)
      if (activeStudioThemeRoots !== 0) return

      if (previousStudioAttribute === null) {
        root.removeAttribute('data-studio-v2')
      } else {
        root.setAttribute('data-studio-v2', previousStudioAttribute)
      }
      previousStudioAttribute = null
    }
  }, [])
}
