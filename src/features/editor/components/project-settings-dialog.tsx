import { useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  EditProjectForm,
  useProjectStore,
  type ProjectFormData,
} from '@/features/editor/deps/projects'
import type { BeatvideoProjectMode, Project } from '@/types/project'
import { toast } from 'sonner'

interface ProjectSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: {
    id: string
    name: string
    width: number
    height: number
    fps: number
    backgroundColor?: string
    beatvideoMode?: BeatvideoProjectMode
  }
  onSaved?: (project: Project) => void | Promise<void>
}

export function ProjectSettingsDialog({
  open,
  onOpenChange,
  project,
  onSaved,
}: ProjectSettingsDialogProps) {
  const currentProject = useProjectStore((state) => state.currentProject)
  const updateProject = useProjectStore((state) => state.updateProject)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const liveProject = currentProject?.id === project.id ? currentProject : null

  const defaultValues = useMemo<Partial<ProjectFormData>>(
    () => ({
      name: liveProject?.name ?? project.name,
      description: liveProject?.description ?? '',
      beatvideoMode: liveProject?.beatvideoMode ?? project.beatvideoMode ?? 'video',
      width: liveProject?.metadata.width ?? project.width,
      height: liveProject?.metadata.height ?? project.height,
      fps: liveProject?.metadata.fps ?? project.fps,
      backgroundColor:
        liveProject?.metadata.backgroundColor ?? project.backgroundColor ?? '#000000',
    }),
    [liveProject, project],
  )

  const handleSubmit = async (data: ProjectFormData) => {
    setIsSubmitting(true)
    try {
      const updated = await updateProject(project.id, data)
      await onSaved?.(updated)
      toast.success('Project settings saved')
      onOpenChange(false)
    } catch (error) {
      toast.error('Could not save project settings', {
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!isSubmitting) onOpenChange(next)
      }}
    >
      <DialogContent className="max-h-[90vh] w-[95vw] max-w-[1120px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Project settings</DialogTitle>
          <DialogDescription>
            Project type and output format live here, separate from app preferences.
          </DialogDescription>
        </DialogHeader>
        <EditProjectForm
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
          defaultValues={defaultValues}
          isSubmitting={isSubmitting}
        />
      </DialogContent>
    </Dialog>
  )
}
