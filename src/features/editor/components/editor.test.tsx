import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

const mocks = vi.hoisted(() => ({
  invalidate: vi.fn().mockResolvedValue(undefined),
  navigate: vi.fn(),
  loadTimeline: vi.fn().mockResolvedValue(undefined),
  loadMediaItems: vi.fn().mockResolvedValue(undefined),
  saveTimeline: vi.fn().mockResolvedValue(undefined),
  setMediaProject: vi.fn(),
  setProject: vi.fn(),
  pausePlayback: vi.fn(),
  setPreviewFrame: vi.fn(),
  setPreviewQuality: vi.fn(),
  toggleSnap: vi.fn(),
  syncSidebarLayout: vi.fn(),
  editorState: {
    workspace: 'edit',
    propertiesFullColumn: false,
    mediaFullColumn: false,
    rightSidebarOpen: false,
  },
  clearPreviewAudioCache: vi.fn(),
  importExportDialog: vi.fn().mockResolvedValue({
    ExportDialog: () => <div data-testid="export-dialog" />,
  }),
  importBundleExportDialog: vi.fn().mockResolvedValue({
    BundleExportDialog: () => <div data-testid="bundle-export-dialog" />,
  }),
  initTransitionChainSubscription: vi.fn(() => vi.fn()),
  createProjectUpgradeBackup: vi.fn(),
  resizablePanelGroup: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
  useRouter: () => ({
    invalidate: mocks.invalidate,
  }),
}))

vi.mock('@/shared/logging/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }),
}))

vi.mock('@/components/ui/resizable', () => ({
  ResizablePanelGroup: ({
    children,
    ...props
  }: {
    children: ReactNode
    autoSaveId?: string
    className?: string
    direction?: string
  }) => {
    mocks.resizablePanelGroup(props)
    return <div>{children}</div>
  },
  ResizablePanel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ResizableHandle: () => <div data-testid="resizable-handle" />,
}))

vi.mock('@/app/error-boundary', () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('./toolbar', () => ({
  Toolbar: ({ compact }: { compact?: boolean }) => (
    <div data-testid="toolbar" data-compact={compact ? 'true' : 'false'} />
  ),
}))

vi.mock('./media-sidebar', () => ({
  MediaSidebar: ({ mobile }: { mobile?: boolean }) => (
    <div data-testid="media-sidebar" data-mobile={mobile ? 'true' : 'false'} />
  ),
}))

vi.mock('./properties-sidebar', () => ({
  PropertiesSidebar: ({ mobile }: { mobile?: boolean }) => (
    <div data-testid="properties-sidebar" data-mobile={mobile ? 'true' : 'false'} />
  ),
}))

vi.mock('./beatvideo-master-panel', () => ({
  BeatvideoMasterPanel: () => <div data-testid="beatvideo-master-panel" />,
}))

vi.mock('./preview-area', () => ({
  PreviewArea: ({ compact }: { compact?: boolean }) => (
    <div data-testid="preview-area" data-compact={compact ? 'true' : 'false'} />
  ),
}))

vi.mock('./color-grading-dock', () => ({
  ColorGradingDock: () => <div data-testid="color-grading-dock" />,
}))

vi.mock('./compose-workspace/compose-layout', () => ({
  MotionPreviewArea: () => <div data-testid="motion-preview-area" />,
  MotionTimelineDock: () => <div data-testid="motion-timeline-dock" />,
}))

vi.mock('./interaction-lock-region', () => ({
  InteractionLockRegion: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('./audio-meter-panel', () => ({
  AudioMeterPanel: ({ mobile }: { mobile?: boolean }) => (
    <div data-testid="audio-meter-panel" data-mobile={mobile ? 'true' : 'false'} />
  ),
}))

vi.mock('@/features/editor/deps/timeline-ui', () => ({
  importTimeline: vi.fn().mockResolvedValue({
    Timeline: ({ compact }: { compact?: boolean }) => (
      <div data-testid="timeline" data-compact={compact ? 'true' : 'false'} />
    ),
  }),
  importBentoLayoutDialog: vi.fn().mockResolvedValue({ BentoLayoutDialog: () => null }),
  importFillerRemovalDialog: vi.fn().mockResolvedValue({ FillerRemovalDialog: () => null }),
  importReverseConformDialog: vi.fn().mockResolvedValue({ ReverseConformDialog: () => null }),
  importSilenceRemovalDialog: vi.fn().mockResolvedValue({ SilenceRemovalDialog: () => null }),
  useBentoLayoutDialogStore: (selector: (state: { isOpen: boolean }) => unknown) =>
    selector({ isOpen: false }),
  useFillerRemovalDialogStore: (selector: (state: { isOpen: boolean }) => unknown) =>
    selector({ isOpen: false }),
  useReverseConformDialogStore: (selector: (state: { request: null }) => unknown) =>
    selector({ request: null }),
  useSilenceRemovalDialogStore: (selector: (state: { isOpen: boolean }) => unknown) =>
    selector({ isOpen: false }),
}))

vi.mock('./clear-keyframes-dialog', () => ({
  ClearKeyframesDialog: () => null,
}))

vi.mock('./project-media-match-dialog', () => ({
  ProjectMediaMatchDialog: () => null,
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock('@/features/editor/hooks/use-editor-hotkeys', () => ({
  useEditorHotkeys: vi.fn(),
}))

vi.mock('../hooks/use-auto-save', () => ({
  useAutoSave: vi.fn(),
}))

vi.mock('@/features/editor/deps/timeline-hooks', () => ({
  useTimelineShortcuts: vi.fn(),
  useTransitionBreakageNotifications: vi.fn(),
}))

vi.mock('@/features/editor/deps/timeline-subscriptions', () => ({
  initTransitionChainSubscription: mocks.initTransitionChainSubscription,
}))

vi.mock('@/features/editor/deps/timeline-store', () => {
  const useTimelineStore = Object.assign(
    (selector: (state: { isDirty: boolean }) => unknown) => selector({ isDirty: false }),
    {
      getState: () => ({
        loadTimeline: mocks.loadTimeline,
        saveTimeline: mocks.saveTimeline,
        snapEnabled: true,
        toggleSnap: mocks.toggleSnap,
      }),
    },
  )

  return { useTimelineStore }
})

vi.mock('@/features/editor/deps/project-bundle', () => ({
  importBundleExportDialog: mocks.importBundleExportDialog,
}))

vi.mock('@/features/editor/deps/media-library', () => {
  const useMediaLibraryStore = Object.assign(() => undefined, {
    getState: () => ({
      setCurrentProject: mocks.setMediaProject,
      loadMediaItems: mocks.loadMediaItems,
    }),
  })
  // Lazily-mounted picker host reads `media !== null` to decide whether to
  // render — return null so the host stays unmounted in editor tests.
  const useEmbeddedSubtitlePickerStore = Object.assign(
    (selector: (state: { media: null }) => unknown) => selector({ media: null }),
    { getState: () => ({ media: null, blob: null }) },
  )
  // Same idea for the cache-only scan progress dialog used by the media
  // library "Extract Embedded Subtitles" flow.
  const useSubtitleScanProgressStore = Object.assign(
    (selector: (state: { open: false }) => unknown) => selector({ open: false }),
    { getState: () => ({ open: false }) },
  )

  return { useMediaLibraryStore, useEmbeddedSubtitlePickerStore, useSubtitleScanProgressStore }
})

vi.mock('@/features/editor/deps/settings', () => ({
  useSettingsStore: (
    selector: (state: { editorDensity: string; snapEnabled: boolean }) => unknown,
  ) =>
    selector({
      editorDensity: 'comfortable',
      snapEnabled: true,
    }),
}))

vi.mock('@/features/editor/deps/preview', () => ({
  PlaybackControls: ({ totalFrames, compact }: { totalFrames: number; compact?: boolean }) => (
    <div
      data-testid="mobile-playback-controls"
      data-total-frames={totalFrames}
      data-compact={compact ? 'true' : 'false'}
    />
  ),
  useItemsStore: (selector: (state: { maxItemEndFrame: number }) => unknown) =>
    selector({ maxItemEndFrame: 900 }),
  useMaskEditorStore: (selector: (state: { isEditing: boolean }) => unknown) =>
    selector({ isEditing: false }),
}))

vi.mock('@/shared/state/playback', () => {
  const usePlaybackStore = Object.assign(() => undefined, {
    getState: () => ({
      pause: mocks.pausePlayback,
      setPreviewFrame: mocks.setPreviewFrame,
      setPreviewQuality: mocks.setPreviewQuality,
    }),
  })

  return { usePlaybackStore }
})

vi.mock('@/shared/state/editor', () => ({
  useEditorStore: (
    selector: (state: {
      syncSidebarLayout: typeof mocks.syncSidebarLayout
      propertiesFullColumn: boolean
      mediaFullColumn: boolean
      rightSidebarOpen: boolean
      workspace: string
    }) => unknown,
  ) =>
    selector({
      syncSidebarLayout: mocks.syncSidebarLayout,
      propertiesFullColumn: mocks.editorState.propertiesFullColumn,
      mediaFullColumn: mocks.editorState.mediaFullColumn,
      rightSidebarOpen: mocks.editorState.rightSidebarOpen,
      workspace: mocks.editorState.workspace,
    }),
}))

vi.mock('@/features/editor/deps/composition-runtime', () => ({
  clearPreviewAudioCache: mocks.clearPreviewAudioCache,
}))

vi.mock('@/features/editor/deps/projects', () => {
  const useProjectStore = Object.assign(() => undefined, {
    getState: () => ({
      setCurrentProject: mocks.setProject,
    }),
  })

  return { useProjectStore }
})

vi.mock('@/features/editor/deps/export-contract', () => ({
  importExportDialog: mocks.importExportDialog,
  importExportsDialog: vi.fn().mockResolvedValue({
    ExportsDialog: () => <div data-testid="exports-dialog" />,
  }),
  RenderQueuePersistence: () => null,
  RenderQueueRunner: () => null,
  useRenderQueueStore: (selector: (state: { jobs: Array<{ status: string }> }) => unknown) =>
    selector({ jobs: [] }),
}))

vi.mock('@/config/editor-layout', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/config/editor-layout')>()
  const layout = {
    ...actual.EDITOR_LAYOUT,
    timelineDefaultSize: 35,
    timelineMinSize: 20,
    timelineMaxSize: 60,
  }

  return {
    ...actual,
    EDITOR_LAYOUT: layout,
    getEditorLayout: () => layout,
    getEditorLayoutCssVars: () => ({}),
  }
})

vi.mock('@/features/projects/services/project-upgrade-service', () => ({
  createProjectUpgradeBackup: mocks.createProjectUpgradeBackup,
}))

vi.mock('@/features/projects/utils/project-helpers', () => ({
  formatProjectUpgradeBackupName: () => 'Backup',
}))

import { LoadedEditor } from './editor'

describe('LoadedEditor migration metadata refresh', () => {
  beforeAll(() => {
    vi.stubGlobal('requestIdleCallback', (callback: IdleRequestCallback) => {
      callback({
        didTimeout: false,
        timeRemaining: () => 50,
      } as IdleDeadline)
      return 1
    })
    vi.stubGlobal('cancelIdleCallback', vi.fn())
  })

  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn(() => ({
        matches: false,
        media: '',
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
    mocks.editorState.workspace = 'edit'
    mocks.editorState.propertiesFullColumn = false
    mocks.editorState.mediaFullColumn = false
    mocks.editorState.rightSidebarOpen = false
    mocks.loadTimeline.mockResolvedValue(undefined)
    mocks.loadMediaItems.mockResolvedValue(undefined)
    mocks.invalidate.mockResolvedValue(undefined)
  })

  afterEach(() => {
    cleanup()
  })

  it('refreshes the editor route cache after opening an approved legacy project', async () => {
    render(
      <LoadedEditor
        projectId="project-1"
        project={{
          id: 'project-1',
          name: 'Legacy Project',
          width: 1920,
          height: 1080,
          fps: 30,
        }}
        migration={{
          storedSchemaVersion: 4,
          currentSchemaVersion: 9,
          requiresUpgrade: true,
        }}
      />,
    )

    await waitFor(() =>
      expect(mocks.loadTimeline).toHaveBeenCalledWith('project-1', {
        allowProjectUpgrade: true,
      }),
    )
    expect(mocks.loadMediaItems).toHaveBeenCalledTimes(1)

    await waitFor(() => expect(mocks.invalidate).toHaveBeenCalledTimes(1))

    const invalidateOptions = mocks.invalidate.mock.calls[0]?.[0]
    expect(invalidateOptions).toBeTruthy()
    expect(
      invalidateOptions.filter({
        routeId: '/editor/$projectId',
        params: { projectId: 'project-1' },
      }),
    ).toBe(true)
    expect(
      invalidateOptions.filter({
        routeId: '/editor/$projectId',
        params: { projectId: 'project-2' },
      }),
    ).toBe(false)
  })

  it('skips the route cache refresh for current-schema projects', async () => {
    render(
      <LoadedEditor
        projectId="project-1"
        project={{
          id: 'project-1',
          name: 'Current Project',
          width: 1920,
          height: 1080,
          fps: 30,
        }}
        migration={{
          storedSchemaVersion: 9,
          currentSchemaVersion: 9,
          requiresUpgrade: false,
        }}
      />,
    )

    await waitFor(() =>
      expect(mocks.loadTimeline).toHaveBeenCalledWith('project-1', {
        allowProjectUpgrade: false,
      }),
    )
    expect(mocks.loadMediaItems).toHaveBeenCalledTimes(1)

    await waitFor(() => expect(mocks.invalidate).not.toHaveBeenCalled())
  })

  it('persists the timeline split layout in localStorage', async () => {
    render(
      <LoadedEditor
        projectId="project-1"
        project={{
          id: 'project-1',
          name: 'Current Project',
          width: 1920,
          height: 1080,
          fps: 30,
        }}
        migration={{
          storedSchemaVersion: 9,
          currentSchemaVersion: 9,
          requiresUpgrade: false,
        }}
      />,
    )

    expect(mocks.resizablePanelGroup).toHaveBeenCalledWith(
      expect.objectContaining({
        autoSaveId: 'editor:producer-layout',
        direction: 'vertical',
      }),
    )
  })

  it('keeps Color preview, real timeline and grade tools scroll-safe without fixed heights', async () => {
    mocks.editorState.workspace = 'color'
    mocks.editorState.propertiesFullColumn = true

    render(
      <LoadedEditor
        projectId="project-1"
        project={{
          id: 'project-1',
          name: 'Color Project',
          width: 1920,
          height: 1080,
          fps: 30,
        }}
        migration={{
          storedSchemaVersion: 9,
          currentSchemaVersion: 9,
          requiresUpgrade: false,
        }}
      />,
    )

    expect(await screen.findByTestId('color-grading-dock')).toBeInTheDocument()
    expect(await screen.findByTestId('timeline')).toBeInTheDocument()
    expect(screen.queryByTestId('color-timeline-navigator')).not.toBeInTheDocument()
    expect(screen.queryByTestId('properties-sidebar')).not.toBeInTheDocument()
    expect(mocks.resizablePanelGroup).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'vertical',
        autoSaveId: 'editor:producer-layout',
      }),
    )
    expect(screen.getByRole('separator', { name: 'Resize Nodes controls' })).toBeInTheDocument()
  })

  it('uses one reachable editor surface at a time on phone-sized viewports', async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn(() => ({
        matches: true,
        media: '(max-width: 767px)',
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })

    render(
      <LoadedEditor
        projectId="project-mobile"
        project={{
          id: 'project-mobile',
          name: 'Phone check',
          width: 1920,
          height: 1080,
          fps: 30,
        }}
        migration={{
          storedSchemaVersion: 14,
          currentSchemaVersion: 14,
          requiresUpgrade: false,
        }}
      />,
    )

    await waitFor(() =>
      expect(screen.getByTestId('toolbar')).toHaveAttribute('data-compact', 'true'),
    )

    expect(screen.getByRole('application')).toHaveClass('h-dvh')
    expect(screen.getByTestId('preview-area')).toHaveAttribute('data-compact', 'true')
    expect(await screen.findByTestId('timeline')).toHaveAttribute('data-compact', 'true')
    expect(screen.queryByTestId('mobile-playback-controls')).not.toBeInTheDocument()
    expect(screen.queryByTestId('media-sidebar')).not.toBeInTheDocument()
    expect(screen.queryByTestId('properties-sidebar')).not.toBeInTheDocument()

    const dock = screen.getByRole('navigation', { name: 'Editor surfaces' })
    expect(screen.queryByRole('button', { name: 'Timeline' })).not.toBeInTheDocument()
    expect(dock.querySelectorAll('button')).toHaveLength(3)

    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByTestId('media-sidebar')).toHaveAttribute('data-mobile', 'true')
    expect(screen.getByTestId('mobile-playback-controls')).toHaveAttribute(
      'data-total-frames',
      '900',
    )
    expect(screen.getByTestId('mobile-playback-controls')).toHaveAttribute('data-compact', 'true')
    // The canonical Program/audio runtime stays mounted behind the active tool
    // so transport remains real instead of becoming a detached state button.
    expect(screen.getByTestId('preview-area')).toHaveAttribute('data-compact', 'true')
    expect(screen.getByTestId('timeline')).toHaveAttribute('data-compact', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByTestId('properties-sidebar')).toHaveAttribute('data-mobile', 'true')
    expect(screen.getByTestId('preview-area')).toBeInTheDocument()
    // Rendered overlays set their own visibility. Their mounted parent must
    // suppress compositing so they cannot paint over the active tool surface.
    expect(screen.getByTestId('preview-area').closest('[data-mobile-preview-runtime]')).toHaveClass(
      'opacity-0',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    expect(screen.getByTestId('preview-area')).toHaveAttribute('data-compact', 'true')
    expect(screen.getByTestId('timeline')).toHaveAttribute('data-compact', 'true')
    expect(screen.queryByTestId('mobile-playback-controls')).not.toBeInTheDocument()
    expect(dock).toBeInTheDocument()
  })

  it('uses the shared resizable timeline shell in Master with dedicated master controls', async () => {
    mocks.editorState.workspace = 'master'

    render(
      <LoadedEditor
        projectId="project-master"
        project={{
          id: 'project-master',
          name: 'Master Project',
          width: 1920,
          height: 1080,
          fps: 30,
        }}
        migration={{
          storedSchemaVersion: 14,
          currentSchemaVersion: 14,
          requiresUpgrade: false,
        }}
      />,
    )

    expect(screen.queryByLabelText('Project')).not.toBeInTheDocument()
    expect(screen.getByTestId('beatvideo-master-panel')).toBeInTheDocument()
    expect(screen.getByTestId('preview-area')).toBeInTheDocument()
    expect(await screen.findByTestId('timeline')).toBeInTheDocument()
    expect(screen.getByTestId('resizable-handle')).toBeInTheDocument()
    expect(screen.queryByTestId('audio-meter-panel')).not.toBeInTheDocument()
  })

  it('mounts Motion in the shared editor shell and swaps only the classic Timeline', async () => {
    mocks.editorState.workspace = 'motion'

    render(
      <LoadedEditor
        projectId="project-1"
        project={{
          id: 'project-1',
          name: 'Motion Project',
          width: 1920,
          height: 1080,
          fps: 30,
        }}
        migration={{
          storedSchemaVersion: 14,
          currentSchemaVersion: 14,
          requiresUpgrade: false,
        }}
      />,
    )

    expect(await screen.findByTestId('motion-timeline-dock')).toBeInTheDocument()
    expect(screen.getByTestId('motion-preview-area')).toBeInTheDocument()
    expect(screen.queryByTestId('timeline')).not.toBeInTheDocument()
    expect(screen.getByTestId('media-sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('properties-sidebar')).toBeInTheDocument()
  })
})
