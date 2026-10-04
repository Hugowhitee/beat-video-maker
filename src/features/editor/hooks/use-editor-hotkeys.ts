import { useHotkeys } from 'react-hotkeys-hook'
import { HOTKEY_OPTIONS } from '@/config/hotkeys'
import { useResolvedHotkeys } from '@/features/editor/deps/settings'
import { useEditorStore } from '@/shared/state/editor'
import { useGizmoStore } from '@/features/editor/deps/preview'

import { useSceneBrowserStore } from '@/features/editor/deps/scene-browser'

interface EditorHotkeyCallbacks {
  onSave?: () => void
  onExport?: () => void
}

/**
 * Global editor keyboard shortcuts
 *
 * Handles editor-level shortcuts that work across all components:
 * - Save (Ctrl+S) - Saves timeline to project
 * - Export (Ctrl+Shift+E) - Exports video
 * - Open Scene Browser (Ctrl+Shift+F) - Opens caption search across media
 *
 * Note: Undo/Redo are handled in useTimelineShortcuts since they're timeline-specific
 *
 * Uses react-hotkeys-hook with granular Zustand selectors
 */
export function useEditorHotkeys(callbacks: EditorHotkeyCallbacks = {}) {
  const hotkeys = useResolvedHotkeys()
  const workspace = useEditorStore((state) => state.workspace)

  // Save: Cmd/Ctrl+S
  useHotkeys(
    hotkeys.SAVE,
    (event) => {
      event.preventDefault()
      if (callbacks.onSave) {
        callbacks.onSave()
      }
    },
    HOTKEY_OPTIONS,
    [callbacks.onSave],
  )

  // Export: Cmd/Ctrl+Shift+E
  useHotkeys(
    hotkeys.EXPORT,
    (event) => {
      event.preventDefault()
      if (callbacks.onExport) {
        callbacks.onExport()
      }
    },
    { ...HOTKEY_OPTIONS, eventListenerOptions: { capture: true } },
    [callbacks.onExport],
  )

  // Open Scene Browser: Cmd/Ctrl+Shift+F — capture phase because the
  // default browser binding is a no-op here but Chrome will still eat it
  // if our listener is in bubbling phase.
  useHotkeys(
    hotkeys.OPEN_SCENE_BROWSER,
    (event) => {
      event.preventDefault()
      useSceneBrowserStore.getState().openBrowser({ focus: true })
    },
    { ...HOTKEY_OPTIONS, eventListenerOptions: { capture: true } },
    [],
  )

  // Color Before/After: one preview-only comparison state, active only on the
  // Color workspace. Split comparison remains a secondary Color-panel mode.
  useHotkeys(
    hotkeys.COLOR_COMPARE,
    (event) => {
      event.preventDefault()
      const preview = useGizmoStore.getState()
      preview.setColorGradeComparisonMode(
        preview.colorGradeComparisonMode === 'before' ? 'off' : 'before',
      )
    },
    { ...HOTKEY_OPTIONS, enabled: workspace === 'color' },
    [workspace],
  )

  // Workspace switching: Alt+1 (Edit), Alt+2 (Color), Alt+3 (Motion).
  // WORKSPACE_ANIMATE retains its persisted command id for shortcut migration.
  useHotkeys(
    hotkeys.WORKSPACE_EDIT,
    (event) => {
      event.preventDefault()
      useEditorStore.getState().setWorkspace('edit')
    },
    HOTKEY_OPTIONS,
    [],
  )

  useHotkeys(
    hotkeys.WORKSPACE_COLOR,
    (event) => {
      event.preventDefault()
      useEditorStore.getState().setWorkspace('color')
    },
    HOTKEY_OPTIONS,
    [],
  )

  useHotkeys(
    hotkeys.WORKSPACE_ANIMATE,
    (event) => {
      event.preventDefault()
      useEditorStore.getState().setWorkspace('motion')
    },
    HOTKEY_OPTIONS,
    [],
  )
}
