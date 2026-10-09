import { memo, useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  ChevronDown,
  Pencil,
  Undo2,
  Redo2,
  SlidersHorizontal,
  Check,
} from 'lucide-react'
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

/** Identical navigation contract at desktop and compact densities. */
function BackToProjectsAction({
  compact,
  label,
  onClick,
}: {
  compact: boolean
  label: string
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={`studio-topbar-button h-9 min-w-9 shrink-0 gap-2 px-2.5 text-xs ${compact ? 'w-9 px-0' : ''}`}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <ArrowLeft className="h-4 w-4 shrink-0" />
      {compact ? null : <span>Projects</span>}
    </Button>
  )
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
  const canUndo = useTimelineCommandStore((state) => state.canUndo)
  const isDirty = useTimelineStore((state) => state.isDirty)
  const canRedo = useTimelineCommandStore((state) => state.canRedo)
  const undo = useTimelineCommandStore((state) => state.undo)
  const redo = useTimelineCommandStore((state) => state.redo)
  const storedProjectName = useProjectStore((state) =>
    state.currentProject?.id === projectId ? state.currentProject.name : null,
  )
  const beatvideoMusic = useProjectStore((state) =>
    state.currentProject?.id === projectId ? state.currentProject.beatvideoMusic : undefined,
  )
  const bpm = beatvideoMusic?.bpmOverride ?? beatvideoMusic?.musicMap?.bpm ?? null
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
        <div className="studio-topbar flex h-12 min-w-0 items-center gap-1.5 bg-panel-bg px-2 text-foreground">
          <BackToProjectsAction
            compact
            label={t('toolbar.backToProjectsAria')}
            onClick={handleBackClick}
          />

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
                className="h-8 w-full border-0 bg-transparent px-1 text-[12px] font-semibold text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
                aria-label="Project title"
              />
            ) : (
              <button
                type="button"
                className="flex h-8 max-w-full items-center gap-1.5 text-left text-[12px] font-semibold text-foreground"
                onClick={() => setEditingProjectName(true)}
                aria-label="Rename project"
                title={projectName}
              >
                <span className="truncate">{projectName}</span>
                <Pencil className="h-3 w-3 shrink-0 text-muted-foreground" />
              </button>
            )}
          </div>

          {onProjectSettings ? (
            <Button
              variant="ghost"
              size="sm"
              className="studio-topbar-button h-8 shrink-0 px-2 text-xs font-semibold uppercase"
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
            className="studio-topbar-button relative h-8 shrink-0 px-2 text-xs font-semibold uppercase"
            onClick={handleSave}
            aria-label={t('toolbar.saveAria')}
          >
            {t('toolbar.save')}
            <SaveDirtyIndicator />
          </Button>

          <Button
            size="sm"
            className="studio-export-button h-8 shrink-0 px-2 text-xs font-semibold uppercase"
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
                <DropdownMenuItem onClick={onExportBundle}>Download project ZIP</DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="overflow-x-auto bg-panel-header px-1">
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
      <div className="studio-topbar flex h-16 shrink-0 items-center gap-4 bg-panel-bg px-6 text-foreground">
        <div
          className="flex h-9 w-[85px] shrink-0 flex-col justify-center border-r border-border leading-none"
          aria-label="Beat Video Maker"
        >
          <span className="text-[19px] leading-[25px] font-semibold">BEAT</span>
          <span className="text-[8px] leading-[10px] font-semibold text-muted-foreground">
            VIDEO MAKER
          </span>
        </div>
        <div className="w-[105px] shrink-0 border-r border-border">
          <BackToProjectsAction
            compact={false}
            label={t('toolbar.backToProjectsAria')}
            onClick={handleBackClick}
          />
        </div>

        <UnsavedChangesDialog
          open={showUnsavedDialog}
          onOpenChange={setShowUnsavedDialog}
          onSave={handleSave}
          projectName={project?.name}
        />

        <div className="min-w-0 w-48 shrink-0">
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
              className="h-8 w-full border-0 bg-transparent px-1 text-[11px] font-semibold text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
              aria-label="Project title"
            />
          ) : (
            <button
              type="button"
              className="flex h-10 w-full items-center gap-2 rounded-sm bg-secondary px-3 text-left text-[15px] font-semibold text-foreground hover:bg-secondary"
              onClick={() => setEditingProjectName(true)}
              aria-label="Rename project"
              title={projectName}
            >
              <span className="truncate">{projectName}</span>
            </button>
          )}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <span className="mr-1 flex h-9 w-[210px] items-center justify-center border-x border-border text-[11px] tabular-nums font-mono text-muted-foreground">
            {bpm ? `${bpm.toFixed(2).replace(/\.00$/, '')} BPM` : '— BPM'} · {beatsPerBar}/4 ·{' '}
            {project.fps} FPS
          </span>

          <Button
            variant="ghost"
            size="icon"
            className="studio-topbar-button h-8 w-8"
            data-surface="raised"
            disabled={!canUndo}
            onClick={undo}
            aria-label="Undo"
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="studio-topbar-button h-8 w-8"
            data-surface="raised"
            disabled={!canRedo}
            onClick={redo}
            aria-label="Redo"
          >
            <Redo2 className="h-4 w-4" />
          </Button>
          {onProjectSettings ? (
            <Button
              variant="ghost"
              size="sm"
              className="studio-topbar-button h-10 gap-2 px-3 text-sm font-normal"
              onClick={onProjectSettings}
              aria-label="Project settings"
            >
              <SlidersHorizontal className="h-4 w-4" /> Settings
            </Button>
          ) : null}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="studio-topbar-button h-9 w-6"
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
                <DropdownMenuItem onClick={onExportBundle}>Download project ZIP</DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
          <span
            className="flex w-14 items-center gap-1 text-[10px] text-muted-foreground"
            role="status"
            aria-label="Project save status"
          >
            <Check
              className={`h-3.5 w-3.5 ${isDirty ? 'text-muted-foreground' : 'text-primary'}`}
            />
            {isDirty ? 'Unsaved' : 'Saved'}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="studio-topbar-button relative h-9 w-[70px] px-3 text-xs font-medium"
            data-surface="raised"
            onClick={handleSave}
            aria-label={t('toolbar.saveAria')}
          >
            {t('toolbar.save')}
            <SaveDirtyIndicator />
          </Button>

          <Button
            size="sm"
            className="studio-export-button h-10 w-28 px-0 text-xs font-semibold uppercase"
            onClick={onExport}
          >
            {t('toolbar.export')}
          </Button>
        </div>
      </div>

      <div className="studio-workspacebar flex h-12 shrink-0 items-center border-y border-border bg-panel-header px-6">
        <WorkspaceSwitcher beatvideoMode={beatvideoMode} />
      </div>

      <ShortcutsDialog open={showShortcutsDialog} onOpenChange={setShowShortcutsDialog} />
      <SettingsDialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog} />
    </div>
  )
})
