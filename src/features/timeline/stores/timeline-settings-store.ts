import { create } from 'zustand'

const BEAT_GRID_VISIBLE_KEY = 'beatvideo:beatGridVisible'
const BEAT_GRID_SNAP_KEY = 'beatvideo:beatGridSnapEnabled'

function loadBooleanPreference(key: string, fallback: boolean): boolean {
  try {
    const stored = localStorage.getItem(key)
    return stored === null ? fallback : stored !== 'false'
  } catch {
    return fallback
  }
}

function saveBooleanPreference(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    /* noop */
  }
}

/**
 * Timeline settings state - FPS, scroll position, snap, dirty tracking.
 * These are UI/editor settings, not timeline content.
 */

interface TimelineSettingsState {
  fps: number
  scrollPosition: number
  snapEnabled: boolean
  /** Beatvideo musical overlay visibility; view preference, not project content. */
  beatGridVisible: boolean
  /** Prefer the musical beat grid over the generic seconds grid when snapping. */
  beatGridSnapEnabled: boolean
  audioSkimmingEnabled: boolean
  isDirty: boolean
  /** True while loadTimeline() is in progress - used to coordinate initial player sync */
  isTimelineLoading: boolean
}

interface TimelineSettingsActions {
  setFps: (fps: number) => void
  setScrollPosition: (position: number) => void
  setSnapEnabled: (enabled: boolean) => void
  toggleSnap: () => void
  setBeatGridVisible: (visible: boolean) => void
  toggleBeatGridVisible: () => void
  setBeatGridSnapEnabled: (enabled: boolean) => void
  toggleBeatGridSnap: () => void
  setAudioSkimmingEnabled: (enabled: boolean) => void
  toggleAudioSkimming: () => void
  setIsDirty: (dirty: boolean) => void
  markDirty: () => void
  markClean: () => void
  setTimelineLoading: (loading: boolean) => void
}

export const useTimelineSettingsStore = create<TimelineSettingsState & TimelineSettingsActions>()(
  (set, get) => ({
    // State
    fps: 30,
    scrollPosition: 0,
    snapEnabled: true,
    beatGridVisible: loadBooleanPreference(BEAT_GRID_VISIBLE_KEY, true),
    beatGridSnapEnabled: loadBooleanPreference(BEAT_GRID_SNAP_KEY, true),
    audioSkimmingEnabled: true,
    isDirty: false,
    isTimelineLoading: true, // Start true - set false after loadTimeline completes

    // Actions
    setFps: (fps) => set({ fps }),
    setScrollPosition: (position) => set({ scrollPosition: position }),
    setSnapEnabled: (enabled) => set({ snapEnabled: enabled }),
    toggleSnap: () => set((state) => ({ snapEnabled: !state.snapEnabled })),
    setBeatGridVisible: (visible) => {
      saveBooleanPreference(BEAT_GRID_VISIBLE_KEY, visible)
      set({ beatGridVisible: visible })
    },
    toggleBeatGridVisible: () =>
      set((state) => {
        const next = !state.beatGridVisible
        saveBooleanPreference(BEAT_GRID_VISIBLE_KEY, next)
        return { beatGridVisible: next }
      }),
    setBeatGridSnapEnabled: (enabled) => {
      saveBooleanPreference(BEAT_GRID_SNAP_KEY, enabled)
      set({ beatGridSnapEnabled: enabled })
    },
    toggleBeatGridSnap: () =>
      set((state) => {
        const next = !state.beatGridSnapEnabled
        saveBooleanPreference(BEAT_GRID_SNAP_KEY, next)
        return { beatGridSnapEnabled: next }
      }),
    setAudioSkimmingEnabled: (enabled) => set({ audioSkimmingEnabled: enabled }),
    toggleAudioSkimming: () =>
      set((state) => ({ audioSkimmingEnabled: !state.audioSkimmingEnabled })),
    setIsDirty: (dirty) => set({ isDirty: dirty }),
    markDirty: () => {
      if (!get().isDirty) set({ isDirty: true })
    },
    markClean: () => set({ isDirty: false }),
    setTimelineLoading: (loading) => set({ isTimelineLoading: loading }),
  }),
)
