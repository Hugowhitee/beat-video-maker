import { create } from 'zustand'
import type { BeatGridResolution } from '../utils/beatvideo-grid-resolution'

const BEAT_GRID_VISIBLE_KEY = 'beatvideo:beatGridVisible'
const BEAT_GRID_SNAP_KEY = 'beatvideo:beatGridSnapEnabled'
const BEAT_GRID_RESOLUTION_KEY = 'beatvideo:beatGridResolution'

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

function loadBeatGridResolution(): BeatGridResolution {
  try {
    const stored = localStorage.getItem(BEAT_GRID_RESOLUTION_KEY)
    if (
      stored === 'auto' ||
      stored === 'quarter-beat' ||
      stored === 'half-beat' ||
      stored === 'beat' ||
      stored === 'bar' ||
      stored === '2-bars' ||
      stored === '4-bars' ||
      stored === '8-bars' ||
      stored === '16-bars'
    ) {
      return stored
    }
  } catch {
    /* noop */
  }
  return 'auto'
}

function saveBeatGridResolution(value: BeatGridResolution): void {
  try {
    localStorage.setItem(BEAT_GRID_RESOLUTION_KEY, value)
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
  /** Shared Beatvideo line/snap resolution; local editor preference, not project timing. */
  beatGridResolution: BeatGridResolution
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
  setBeatGridResolution: (resolution: BeatGridResolution) => void
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
    beatGridResolution: loadBeatGridResolution(),
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
    setBeatGridResolution: (resolution) => {
      saveBeatGridResolution(resolution)
      set({ beatGridResolution: resolution })
    },
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
