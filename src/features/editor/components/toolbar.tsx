import { memo, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  Bug,
  ChevronDown,
  Settings2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { ProjectDebugPanel } from './project-debug-panel'
import { SettingsDialog } from './settings-dialog'
import { ShortcutsDialog } from './shortcuts-dialog'
import { UnsavedChangesDialog } from './unsaved-changes-dialog'
import { WorkspaceSwitcher } from './workspace-switcher'
import { EDITOR_LAYOUT_CSS_VALUES } from '@/config/editor-layout'
import { cn } from '@/shared/ui/cn'
import { useDebugStore } from '@/features/editor/stores/debug-store'
import { useEditorStore } from '@/shared/state/editor'
import { useItemsStore, useTimelineStore } from '@/features/editor/deps/timeline-store'
import { useMediaLibraryStore } from '@/features/editor/deps/media-library'
import type { BeatvideoProjectMode } from '@/types/project'

const SaveDirtyIndicator = memo(function SaveDirtyIndicator() {
  const isDirty = useTimelineStore((state) => state.isDirty)
  return isDirty ? (
    <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-primary" />
  ) : null
})

function formatProjectDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.round(seconds % 60)
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`
}

interface ToolbarProps {
  projectId: string
  project: {
    id: string
    name: string
    width: number
    height: number
    fps: number
  }
  beatvideoMode: BeatvideoProjectMode
  onSave?: () => Promise<void>
  onExport?: () => void
  onExportBundle?: () => void
  onProjectSettings?: () => void
  onOpenRenderQueue?: () => void
  /** Number of queued + rendering jobs, shown as a badge on the queue button. */
  renderQueueCount?: number
}

export const Toolbar = memo(function Toolbar({
  projectId,
  project,
  beatvideoMode,
  onSave,
  onExport,
  onExportBundle,
  onProjectSettings,
  onOpenRenderQueue,
  renderQueueCount = 0,
}: ToolbarProps) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false)
  const [showShortcutsDialog, setShowShortcutsDialog] = useState(false)
  const [showSettingsDialog, setShowSettingsDialog] = useState(false)
  const itemCount = useItemsStore((state) => state.items.length)
  const maxItemEndFrame = useItemsStore((state) => state.maxItemEndFrame)
  const mediaDependencyIds = useItemsStore((state) => state.mediaDependencyIds)
  const brokenMediaIds = useMediaLibraryStore((state) => state.brokenMediaIds)
  const workspace = useEditorStore((state) => state.workspace)
  const rightSidebarOpen = useEditorStore((state) => state.rightSidebarOpen)
  const toggleRightSidebar = useEditorStore((state) => state.toggleRightSidebar)
  const projectSummary = useMemo(
    () => {
      const projectMediaIds = new Set(mediaDependencyIds)
      return {
        durationSeconds: project.fps > 0 ? maxItemEndFrame / project.fps : 0,
        clipCount: itemCount,
        mediaCount: mediaDependencyIds.length,
        brokenMediaCount: brokenMediaIds.filter((mediaId) => projectMediaIds.has(mediaId)).length,
      }
    },
    [brokenMediaIds, itemCount, maxItemEndFrame, mediaDependencyIds, project.fps],
  )

  const handleBackClick = () => {
    if (useTimelineStore.getState().isDirty) {
      setShowUnsavedDialog(true)
    } else {
      navigate({ to: '/projects' })
    }
  }

  const handleSave = async () => {
    await onSave?.()
  }

  return (
    <div
      className="panel-header flex flex-shrink-0 items-center gap-2.5 border-b border-border px-3"
      style={{ height: EDITOR_LAYOUT_CSS_VALUES.toolbarHeight }}
      role="toolbar"
      aria-label={t('toolbar.ariaLabel')}
    >
      <div className="flex items-center gap-2.5">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleBackClick}
          data-tooltip={t('toolbar.backToProjects')}
          data-tooltip-side="right"
          aria-label={t('toolbar.backToProjectsAria')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <UnsavedChangesDialog
          open={showUnsavedDialog}
          onOpenChange={setShowUnsavedDialog}
          onSave={handleSave}
          projectName={project?.name}
        />

        <Separator orientation="vertical" className="h-5" />

        <div className="flex flex-col -space-y-0.5">
          <h1 className="text-sm font-medium leading-none">
            {project?.name || t('common.untitledProject')}
          </h1>
          <span className="font-mono text-[11px] text-muted-foreground">
            {t('toolbar.specsDetailed', {
              width: project?.width,
              height: project?.height,
              fps: project?.fps,
              duration: formatProjectDuration(projectSummary.durationSeconds),
              clips: projectSummary.clipCount,
              media: projectSummary.mediaCount,
              missing: projectSummary.brokenMediaCount,
            })}
          </span>
        </div>

      </div>

      <div className="flex flex-1 items-center justify-center">
        <WorkspaceSwitcher beatvideoMode={beatvideoMode} />
      </div>

      <ShortcutsDialog open={showShortcutsDialog} onOpenChange={setShowShortcutsDialog} />

      <SettingsDialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog} />

      <div className="flex items-center gap-1.5">
        {import.meta.env.DEV && import.meta.env.VITE_SHOW_DEBUG_PANEL !== 'false' && (
          <DebugPopover projectId={projectId} />
        )}

        {/* Keep only the producer-critical surfaces permanently visible. */}
        {workspace === 'edit' ? (
          <Button
            variant={rightSidebarOpen ? 'secondary' : 'outline'}
            size="sm"
            className="h-7 px-2"
            onClick={toggleRightSidebar}
            aria-pressed={rightSidebarOpen}
            aria-label={rightSidebarOpen ? 'Hide inspector' : 'Show inspector'}
          >
            Inspector
          </Button>
        ) : null}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 gap-1 px-2">
              More
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setShowSettingsDialog(true)}>
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowShortcutsDialog(true)}>
              Keyboard shortcuts
            </DropdownMenuItem>
            {onOpenRenderQueue ? (
              <DropdownMenuItem onClick={onOpenRenderQueue}>
                Render queue{renderQueueCount > 0 ? ` (${renderQueueCount})` : ''}
              </DropdownMenuItem>
            ) : null}
            {onExportBundle ? (
              <DropdownMenuItem onClick={onExportBundle}>
                Download project ZIP
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Actions */}
        {onProjectSettings ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={onProjectSettings}
            aria-label="Project settings"
            data-tooltip="Project settings"
            data-tooltip-side="bottom"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </Button>
        ) : null}

        <Button
          variant="outline"
          size="sm"
          className="relative h-7 px-3"
          onClick={handleSave}
          aria-label={t('toolbar.saveAria')}
        >
          {t('toolbar.save')}
          <SaveDirtyIndicator />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="gap-1.5">
              {t('toolbar.export')}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onExport}>
              {t('toolbar.exportVideo')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
})

function DebugPopover({ projectId }: { projectId: string }) {
  const { t } = useTranslation()
  const debugPanelOpen = useDebugStore((s) => s.debugPanelOpen)
  const setDebugPanelOpen = useDebugStore((s) => s.setDebugPanelOpen)

  return (
    <Popover open={debugPanelOpen} onOpenChange={setDebugPanelOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className={cn(
            'h-7 w-7',
            debugPanelOpen && 'bg-amber-500/20 border-amber-500/50 text-amber-400',
          )}
          data-tooltip={debugPanelOpen ? undefined : t('toolbar.debugPanel')}
          data-tooltip-side="bottom"
          aria-label={t('toolbar.debugPanelAria')}
        >
          <Bug className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-64 p-0 bg-zinc-900 border-zinc-700 text-zinc-100"
      >
        <ProjectDebugPanel projectId={projectId} />
      </PopoverContent>
    </Popover>
  )
}
