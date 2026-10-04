import { memo, useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ChevronDown, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SettingsDialog } from './settings-dialog'
import { ShortcutsDialog } from './shortcuts-dialog'
import { UnsavedChangesDialog } from './unsaved-changes-dialog'
import { WorkspaceSwitcher } from './workspace-switcher'
import { useEditorStore } from '@/shared/state/editor'
import { useTimelineCommandStore, useTimelineStore } from '@/features/editor/deps/timeline-store'
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
  const canUndo = useTimelineCommandStore((state) => state.canUndo)
  const canRedo = useTimelineCommandStore((state) => state.canRedo)
  const undo = useTimelineCommandStore((state) => state.undo)
  const redo = useTimelineCommandStore((state) => state.redo)
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
        className="studio-toolbar flex shrink-0 flex-col border-b border-border"
        data-compact-toolbar="true"
        role="toolbar"
        aria-label={t('toolbar.ariaLabel')}
      >
        <div className="studio-topbar flex h-12 min-w-0 items-center gap-1.5 bg-[#242724] px-2 text-[#f6f7f3]">
          <Button
            variant="ghost"
            size="icon"
            className="studio-topbar-button h-8 w-8 shrink-0"
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

          <div className="min-w-[72px] flex-1">
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
                className="h-8 w-full border-0 bg-transparent px-1 text-[12px] font-semibold text-[#f6f7f3] outline-none focus-visible:ring-1 focus-visible:ring-[#c7e85a]"
                aria-label="Project title"
              />
            ) : (
              <button
                type="button"
                className="flex h-8 max-w-full items-center gap-1.5 text-left text-[12px] font-semibold text-[#f6f7f3]"
                onClick={() => setEditingProjectName(true)}
                aria-label="Rename project"
                title={projectName}
              >
                <span className="truncate">{projectName}</span>
                <Pencil className="h-3 w-3 shrink-0 text-[#bfc4bc]" />
              </button>
            )}
          </div>

          {onProjectSettings ? (
            <Button
              variant="ghost"
              size="sm"
              className="studio-topbar-button h-8 shrink-0 px-2 text-[9px] font-semibold uppercase"
              onClick={onProjectSettings}
              aria-label="Project settings"
              title="Project settings"
            >
              Project
            </Button>
          ) : null}

          <Button
            variant="ghost"
            size="sm"
            className="studio-topbar-button relative h-8 shrink-0 px-2 text-[9px] font-semibold uppercase"
            onClick={handleSave}
            aria-label={t('toolbar.saveAria')}
          >
            {t('toolbar.save')}
            <SaveDirtyIndicator />
          </Button>

          <Button
            size="sm"
            className="studio-export-button h-8 shrink-0 px-2 text-[9px] font-semibold uppercase"
            onClick={onExport}
            aria-label={t('toolbar.export')}
          >
            {t('toolbar.export')}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="studio-topbar-button h-8 w-8 shrink-0"
                aria-label="More editor actions"
                title="More"
              >
                <ChevronDown className="h-3.5 w-3.5" />
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
        </div>

        <div className="overflow-x-auto bg-[#c7cac4] px-1">
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
      data-compact-toolbar="false"
      role="toolbar"
      aria-label={t('toolbar.ariaLabel')}
    >
      <div className="studio-topbar flex h-12 shrink-0 items-center gap-2 bg-[#242724] pl-[18px] pr-4 text-[#f6f7f3]">
        <button
          type="button"
          onClick={handleBackClick}
          className="mr-8 flex shrink-0 items-baseline text-left"
          aria-label={t('toolbar.backToProjectsAria')}
          title={t('toolbar.backToProjects')}
        >
          <span className="text-[12px] font-semibold tracking-[-0.01em]">BEAT VIDEO</span>
          <span className="ml-1 text-[12px] font-semibold text-[#c7e85a]">MAKER</span>
        </button>

        <UnsavedChangesDialog
          open={showUnsavedDialog}
          onOpenChange={setShowUnsavedDialog}
          onSave={handleSave}
          projectName={project?.name}
        />

        <div className="min-w-0 max-w-[360px] flex-1">
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
              className="h-8 w-full border-0 bg-transparent px-1 text-[11px] font-semibold text-[#f6f7f3] outline-none focus-visible:ring-1 focus-visible:ring-[#c7e85a]"
              aria-label="Project title"
            />
          ) : (
            <button
              type="button"
              className="flex h-8 max-w-full items-center gap-1.5 text-left text-[11px] font-semibold text-[#f6f7f3] hover:text-white"
              onClick={() => setEditingProjectName(true)}
              aria-label="Rename project"
              title={projectName}
            >
              <span className="truncate">{projectName}</span>
              <Pencil className="h-3 w-3 shrink-0 text-[#bfc4bc]" />
            </button>
          )}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <span className="min-w-[68px] text-right text-[10px] font-medium tabular-nums text-[#d7dbd3]">
            {bpm ? `${bpm.toFixed(2).replace(/\.00$/, '')} BPM` : '— BPM'}
          </span>
          <span className="w-[28px] text-left text-[10px] font-medium tabular-nums text-[#d7dbd3]">
            {beatsPerBar}/4
          </span>

          {onProjectSettings ? (
            <Button
              variant="ghost"
              size="sm"
              className="studio-topbar-button h-[30px] px-3 text-[10px] font-semibold"
              onClick={onProjectSettings}
            >
              Project settings
            </Button>
          ) : null}

          <Button
            variant="ghost"
            size="sm"
            className="studio-topbar-button relative h-[30px] px-3 text-[10px] font-semibold"
            onClick={handleSave}
            aria-label={t('toolbar.saveAria')}
          >
            {t('toolbar.save')}
            <SaveDirtyIndicator />
          </Button>

          <Button
            size="sm"
            className="studio-export-button h-[30px] w-[92px] px-0 text-[10px] font-semibold uppercase"
            onClick={onExport}
          >
            {t('toolbar.export')}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="studio-topbar-button h-[30px] w-[30px]"
                aria-label="More editor actions"
                title="More"
              >
                <ChevronDown className="h-3.5 w-3.5" />
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
        </div>
      </div>

      <div className="studio-workspacebar flex h-11 shrink-0 items-center bg-[#c7cac4] px-4">
        <WorkspaceSwitcher beatvideoMode={beatvideoMode} />

        <div className="relative ml-auto h-full w-[234px] shrink-0">
          <button
            type="button"
            disabled={!canUndo}
            onClick={undo}
            className="studio-workspace-action absolute left-0 top-0 flex h-full items-center text-[10px] font-medium"
          >
            Undo
          </button>
          <button
            type="button"
            disabled={!canRedo}
            onClick={redo}
            className="studio-workspace-action absolute left-[50px] top-0 flex h-full items-center text-[10px] font-medium"
          >
            Redo
          </button>
          {workspace === 'edit' ? (
            <button
              type="button"
              onClick={toggleRightSidebar}
              aria-pressed={rightSidebarOpen}
              className="studio-workspace-action absolute left-[135px] top-0 flex h-full items-center text-[10px] font-semibold"
            >
              Inspector
            </button>
          ) : null}
        </div>
      </div>

      <ShortcutsDialog open={showShortcutsDialog} onOpenChange={setShowShortcutsDialog} />
      <SettingsDialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog} />
    </div>
  )
})
