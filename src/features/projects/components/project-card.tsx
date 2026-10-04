import { useState, type KeyboardEvent } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Link, useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import {
  MoreVertical,
  PlayCircle,
  Edit2,
  Copy,
  Trash2,
  AlertTriangle,
  HardDrive,
  Check,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import type { Project } from '@/types/project'
import {
  useDeleteProject,
  useDuplicateProject,
  useRestoreProject,
} from '../hooks/use-project-actions'
import { useProjectThumbnail } from '../hooks/use-project-thumbnail'
import { resolveBeatvideoProjectMode } from '@/config/beatvideo'
import { getAspectRatio } from '../utils/validation'
import {
  DEFAULT_PROJECT_FPS,
  DEFAULT_PROJECT_HEIGHT,
  DEFAULT_PROJECT_WIDTH,
} from '@/shared/projects/defaults'

interface ProjectCardProps {
  project: Project
  onEdit?: (project: Project) => void
  isSelected?: boolean
  onCardMouseDown?: (e: React.MouseEvent, project: Project) => void
  onCardClick?: (e: React.MouseEvent, project: Project) => void
}

export function ProjectCard({
  project,
  onEdit,
  isSelected = false,
  onCardMouseDown,
  onCardClick,
}: ProjectCardProps) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [isDeleting, setIsDeleting] = useState(false)
  const [isDuplicating, setIsDuplicating] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [clearLocalFiles, setClearLocalFiles] = useState(false)
  const deleteProject = useDeleteProject()
  const restoreProject = useRestoreProject()
  const duplicateProject = useDuplicateProject()
  const thumbnailUrl = useProjectThumbnail(project)

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setShowDeleteDialog(true)
  }

  const handleConfirmDelete = async () => {
    setIsDeleting(true)
    setShowDeleteDialog(false)
    const wantedLocalDelete = clearLocalFiles
    const projectId = project.id
    const result = await deleteProject(projectId, clearLocalFiles)
    setIsDeleting(false)
    setClearLocalFiles(false)

    if (!result.success) {
      toast.error(t('projects.toasts.deleteFailed'), { description: result.error })
      return
    }

    if (wantedLocalDelete && !result.localFilesDeleted) {
      toast.warning(t('projects.toasts.movedToTrash', { name: result.originalName }), {
        description: t('projects.toasts.localFilesNotRemoved'),
      })
      return
    }

    toast.success(t('projects.toasts.movedToTrash', { name: result.originalName }), {
      description: wantedLocalDelete
        ? t('projects.toasts.localFilesDeleted')
        : t('projects.toasts.canUndo'),
      duration: 8000,
      action: {
        label: t('projects.undo'),
        onClick: async () => {
          const undo = await restoreProject(projectId)
          if (undo.success) {
            toast.success(t('projects.toasts.restored', { name: result.originalName }))
          } else {
            toast.error(t('projects.toasts.restoreFailed'), { description: undo.error })
          }
        },
      },
    })
  }

  const handleDuplicate = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    setIsDuplicating(true)
    const result = await duplicateProject(project.id)
    setIsDuplicating(false)

    if (!result.success) {
      toast.error(t('projects.toasts.duplicateFailed'), { description: result.error })
    }
  }

  const handleEdit = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onEdit?.(project)
  }

  const handleClick = (e: React.MouseEvent) => {
    onCardClick?.(e, project)
  }

  const openProject = () => {
    navigate({ to: '/editor/$projectId', params: { projectId: project.id } })
  }

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    openProject()
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    e.stopPropagation()
    openProject()
  }

  const handleOpenClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    openProject()
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    onCardMouseDown?.(e, project)
  }

  // Safe metadata access with defaults
  const width = project?.metadata?.width || DEFAULT_PROJECT_WIDTH
  const height = project?.metadata?.height || DEFAULT_PROJECT_HEIGHT
  const fps = project?.metadata?.fps || DEFAULT_PROJECT_FPS

  const aspectRatioLabel = getAspectRatio(width, height)

  const projectMode = resolveBeatvideoProjectMode(project.beatvideoMode)

  return (
    <div
      data-project-card
      data-project-id={project.id}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={t('projects.card.openProject')}
      className={`group relative flex aspect-square min-h-0 flex-col overflow-hidden rounded-[3px] border transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
        isSelected
          ? 'border-foreground bg-[#d1d4ce]'
          : 'border-transparent bg-[#e8e9e5] hover:border-border hover:bg-[#dfe1dc]'
      }`}
    >
      {isSelected ? (
        <div className="absolute inset-x-0 top-0 z-20 h-[3px] bg-primary" aria-hidden="true" />
      ) : null}

      <div className="relative m-2 mb-0 min-h-0 flex-[1_1_60%] overflow-hidden rounded-[2px] bg-[#343834]">
        {thumbnailUrl ? (
          <img
            key={project.updatedAt}
            src={thumbnailUrl}
            alt={project.name}
            draggable={false}
            className="h-full w-full object-cover pointer-events-none"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[9px] font-medium uppercase tracking-[0.08em] text-[#bfc4bc]">
            Preview
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-[0_0_40%] flex-col px-2.5 py-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <h3 className="truncate text-[12px] font-semibold leading-4 text-foreground">
            {project.name}
          </h3>
          {isSelected ? <Check className="h-3.5 w-3.5 shrink-0 text-foreground" /> : null}
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-1.5 overflow-hidden text-[8px] text-muted-foreground">
          <span>{projectMode === 'photo' ? 'Photo' : 'Video'}</span>
          <span aria-hidden="true">·</span>
          <span className="truncate font-mono">{aspectRatioLabel}</span>
          <span aria-hidden="true">·</span>
          <span className="shrink-0 font-mono">{fps} fps</span>
        </div>

        <div className="mt-auto flex items-center justify-end gap-1">
          <Button
            type="button"
            size="sm"
            className="studio-secondary-action h-7 px-2.5 text-[9px]"
            onClick={handleOpenClick}
          >
            Open
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                aria-label="Project actions"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48" data-studio-v2="true">
              <DropdownMenuItem asChild>
                <Link
                  to="/editor/$projectId"
                  params={{ projectId: project.id }}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <PlayCircle className="w-4 h-4" />
                  {t('projects.card.openInEditor')}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleEdit} className="flex items-center gap-2">
                <Edit2 className="w-4 h-4" />
                {t('projects.card.editSettings')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleDuplicate}
                disabled={isDuplicating}
                className="flex items-center gap-2"
              >
                <Copy className="w-4 h-4" />
                {isDuplicating ? t('projects.card.duplicating') : t('projects.card.duplicate')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleDeleteClick}
                disabled={isDeleting}
                className="flex items-center gap-2 text-destructive focus:text-destructive"
              >
                <Trash2 className="w-4 h-4" />
                {isDeleting ? t('common.deleting') : t('common.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <AlertDialog
        open={showDeleteDialog}
        onOpenChange={(open) => {
          setShowDeleteDialog(open)
          if (!open) setClearLocalFiles(false)
        }}
      >
        <AlertDialogContent onClick={(e) => e.stopPropagation()} data-studio-v2="true">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {t('projects.card.deleteProjectTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              <Trans
                i18nKey="projects.card.deleteProjectDescription"
                values={{ name: project.name }}
                components={{ strong: <strong /> }}
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          {project.rootFolderHandle && (
            <label className="flex items-start gap-3 border border-border bg-muted/50 p-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={clearLocalFiles}
                onChange={(e) => setClearLocalFiles(e.target.checked)}
                className="mt-0.5 h-4 w-4 border-border accent-destructive"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
                  {t('projects.card.alsoDeleteLocalFiles')}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {project.rootFolderName
                    ? t('projects.card.removeFilesFromNamedFolder', {
                        folder: project.rootFolderName,
                      })
                    : t('projects.card.removeFilesFromFolder')}
                </p>
              </div>
            </label>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('projects.card.deleteProjectTitle')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )}
