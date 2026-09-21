import type { BeatvideoProjectMode } from '@/types/project'
import type { EditorSidebarTab } from '@/config/editor-workspaces'

export const DEFAULT_BEATVIDEO_PROJECT_MODE: BeatvideoProjectMode = 'photo'

export function resolveBeatvideoProjectMode(value: unknown): BeatvideoProjectMode {
  return value === 'photo' ? 'photo' : 'video'
}

const PHOTO_SIDEBAR_TABS = new Set<EditorSidebarTab>([
  'media',
  'text',
  'shapes',
  'effects',
  'lottie',
])

export function isSidebarTabVisibleForBeatvideoMode(
  tab: EditorSidebarTab,
  mode: BeatvideoProjectMode,
): boolean {
  return mode === 'video' || PHOTO_SIDEBAR_TABS.has(tab)
}
