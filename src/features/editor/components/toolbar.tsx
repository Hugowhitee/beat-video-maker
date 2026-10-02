import { memo, useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Bug, ChevronDown, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ProjectDebugPanel } from './project-debug-panel'
import { SettingsDialog } from './settings-dialog'
import { ShortcutsDialog } from './shortcuts-dialog'
import { UnsavedChangesDialog } from './unsaved-changes-dialog'
import { WorkspaceSwitcher } from './workspace-switcher'
import { cn } from '@/shared/ui/cn'
import { useDebugStore } from '@/features/editor/stores/debug-store'
import { useEditorStore } from '@/shared/state/editor'
import { useTimelineStore } from '@/features/editor/deps/timeline-store'
import type { BeatvideoProjectMode } from '@/types/project'
import { toast } from 'sonner'
import { useProjectStore } from '@/features/editor/deps/projects-contract'

const SaveDirtyIndicator = memo(function SaveDirtyIndicator() {
  const isDirty = useTimelineStore((state) => state.isDirty)
  return isDirty ? (
    <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-primary" />
  ) : null
})

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
  compact?: boolean
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
  compact = false,
}: ToolbarProps) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false)
  const [showShortcutsDialog, setShowShortcutsDialog] = useState(false)
  const [showSettingsDialog, setShowSettingsDialog] = useState(false)
  const workspace = useEditorStore((state) => state.workspace)
  const rightSidebarOpen = useEditorStore((state) => state.rightSidebarOpen)
  const toggleRightSidebar = useEditorStore((state) => state.toggleRightSidebar)
  const storedProjectName = useProjectStore((state) =>
    state.currentProject?.id === projectId ? state.currentProject.name : null,
  )
  const beatvideoMusic = useProjectStore((state) =>
    state.currentProject?.id === projectId ? state.currentProject.beatvideoMusic : undefined,
  )
  const bpm =
    beatvideoMusic?.bpmOverride ?? beatvideoMusic?.musicMap?.bpm ?? null
  const beatsPerBar = beatvideoMusic?.musicMap?.beatsPerBar ?? 4
  const updateProject = useProjectStore((state) => state.updateProject)
  const projectName = storedProjectName ?? project?.name ?? t('common.untitledProject')
  const [editingProjectName, setEditingProjectName] = useState(false)
  const [projectNameDraft, setProjectNameDraft] = useState(projectName)

  useEffect(() => {
    if (!editingProjectName) setProjectNameDraft(projectName)
  }, [editingProjectName, projectName])

  const commitProjectName = async () => {
    const nextName = projectNameDraft.trim()
    if (!nextName) {
      setProjectNameDraft(projectName)
      setEditingProjectName(false)
      return
    }

    try {
      if (nextName !== projectName) {
        await updateProject(projectId, { name: nextName })
      }
      setEditingProjectName(false)
    } catch (error) {
      setProjectNameDraft(projectName)
      toast.error('Could not rename project', {
        description: error instanceof Error ? error.message : String(error),
      })
    }
  }

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

  if (compact) {
    return (
      <div
        className="panel-header flex shrink-0 flex-col border-b border-border"
        role="toolbar"
        aria-label={t('toolbar.ariaLabel')}
      >
        <div className="flex h-11 min-w-0 items-center gap-1.5 px-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={handleBackClick}
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

          <div className="min-w-0 flex-1 px-1">
            {editingProjectName ? (
              <input
                autoFocus
                value={projectNameDraft}
                onChange={(event) => setProjectNameDraft(event.target.value)}
                onBlur={() => void commitProjectName()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void commitProjectName()
                  if (event.key === 'Escape') {
                    setProjectNameDraft(projectName)
                    setEditingProjectName(false)
                  }
                }}
                className="h-8 w-full border-0 bg-transparent px-1 text-sm font-medium text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
                aria-label="Project title"
              />
            ) : (
              <button
                type="button"
                className="flex h-8 max-w-full items-center gap-1.5 text-left text-sm font-medium text-foreground"
                onClick={() => setEditingProjectName(true)}
                aria-label="Rename project"
              >
                <span className="truncate">{projectName}</span>
                <Pencil className="h-3 w-3 shrink-0 text-muted-foreground" />
              </button>
            )}
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="relative h-9 shrink-0 px-2.5"
            onClick={handleSave}
            aria-label={t('toolbar.saveAria')}
          >
            {t('toolbar.save')}
            <SaveDirtyIndicator />
          </Button>

          <Button
            size="sm"
            className="h-9 shrink-0 px-2.5"
            onClick={onExport}
            aria-label={t('toolbar.export')}
          >
            {t('toolbar.export')}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 shrink-0 gap-1 px-2"
                aria-label="More editor actions"
              >
                More
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onProjectSettings ? (
                <DropdownMenuItem onClick={onProjectSettings}>
                  Project settings
                </DropdownMenuItem>
              ) : null}
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
        </div>

        <div className="overflow-x-auto border-t border-border/70 px-1">
          <div className="w-max min-w-full">
            <WorkspaceSwitcher beatvideoMode={beatvideoMode} />
          </div>
        </div>

        <ShortcutsDialog open={showShortcutsDialog} onOpenChange={setShowShortcutsDialog} />
        <SettingsDialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog} />
      </div>
    )
  }

  return (
    <div
      className="studio-toolbar flex shrink-0 flex-col"
      role="toolbar"
      aria-label={t('toolbar.ariaLabel')}
    >
      <div className="studio-topbar flex h-12 shrink-0 items-center border-b border-black/30 bg-[#242724] px-[18px] text-[#f3f4f0]">
        <button
          type="button"
          onClick={handleBackClick}
          className="mr-6 flex shrink-0 items-baseline gap-1 text-left"
          aria-label={t('toolbar.backToProjectsAria')}
          title={t('toolbar.backToProjects')}
        >
          <span className="text-[12px] font-bold tracking-[-0.02em]">BEAT VIDEO</span>
          <span className="text-[9px] font-semibold tracking-[0.08em] text-white/55">MAKER</span>
        </button>

        <UnsavedChangesDialog
          open={showUnsavedDialog}
          onOpenChange={setShowUnsavedDialog}
          onSave={handleSave}
          projectName={project?.name}
        />

        <div className="min-w-0 flex-1">
          {editingProjectName ? (
            <input
              autoFocus
              value={projectNameDraft}
              onChange={(event) => setProjectNameDraft(event.target.value)}
              onBlur={() => void commitProjectName()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void commitProjectName()
                if (event.key === 'Escape') {
                  setProjectNameDraft(projectName)
                  setEditingProjectName(false)
                }
              }}
              className="h-7 w-full max-w-[360px] border-0 bg-transparent px-0 text-[11px] font-medium text-white outline-none focus-visible:ring-1 focus-visible:ring-[#c7e85a]"
              aria-label="Project title"
            />
          ) : (
            <button
              type="button"
              className="group flex h-7 max-w-[360px] items-center gap-1.5 text-left text-[11px] font-medium text-white/88"
              onClick={() => setEditingProjectName(true)}
              aria-label="Rename project"
            >
              <span className="truncate">{projectName}</span>
              <Pencil className="h-3 w-3 shrink-0 text-white/35 transition-colors group-hover:text-white/70" />
            </button>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <span className="px-2 font-mono text-[10px] tabular-nums text-white/58">
            {bpm ? `${Math.round(bpm)} BPM` : '— BPM'}
          </span>
          <span className="border-l border-white/15 px-2 font-mono text-[10px] tabular-nums text-white/58">
            {beatsPerBar}/4
          </span>

          {import.meta.env.DEV && import.meta.env.VITE_SHOW_DEBUG_PANEL !== 'false' ? (
            <DebugPopover projectId={projectId} />
          ) : null}

          {workspace === 'edit' ? (
            <Button
              variant="ghost"
              size="sm"
              className="studio-topbar-button h-7 px-2"
              onClick={toggleRightSidebar}
              aria-pressed={rightSidebarOpen}
              aria-label={rightSidebarOpen ? 'Hide inspector' : 'Show inspector'}
            >
              Inspector
            </Button>
          ) : null}

          {onProjectSettings ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="studio-topbar-button h-7 px-2"
              onClick={onProjectSettings}
            >
              Project settings
            </Button>
          ) : null}

          <Button
            variant="ghost"
            size="sm"
            className="studio-topbar-button relative h-7 px-2"
            onClick={handleSave}
            aria-label={t('toolbar.saveAria')}
          >
            {t('toolbar.save')}
            <SaveDirtyIndicator />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="studio-topbar-button h-7 gap-1 px-2">
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

          <Button
            size="sm"
            className="studio-export-button ml-1 h-8 min-w-[92px] px-4 text-[11px] font-semibold"
            onClick={onExport}
          >
            {t('toolbar.export')}
          </Button>
        </div>
      </div>

      <div className="studio-workspacebar flex h-11 shrink-0 items-center border-b border-border bg-[#c7cac4] px-4">
        <WorkspaceSwitcher beatvideoMode={beatvideoMode} />
      </div>

      <ShortcutsDialog open={showShortcutsDialog} onOpenChange={setShowShortcutsDialog} />
      <SettingsDialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog} />
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
