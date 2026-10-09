import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { createLogger } from '@/shared/logging/logger'
import { InlineCreateProjectForm } from '@/features/projects/components/project-form'
import { useCreateProject } from '@/features/projects/hooks/use-project-actions'
import { useProjectStore } from '@/features/projects/stores/project-store'
import type { ProjectFormData } from '@/features/projects/utils/validation'
import { useStudioDocumentTheme } from '@/shared/ui/use-studio-document-theme'

const logger = createLogger('NewProject')

export const Route = createFileRoute('/projects/new')({
  component: NewProject,
  beforeLoad: async () => {
    try {
      const { loadProjects } = useProjectStore.getState()
      await loadProjects()
    } catch (err) {
      logger.warn('Failed to pre-load projects in beforeLoad:', err)
    }
  },
})

function NewProject() {
  useStudioDocumentTheme()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const createProject = useCreateProject()

  const handleSubmit = async (data: ProjectFormData) => {
    setIsSubmitting(true)

    try {
      const result = await createProject(data)

      if (result.success && result.project) {
        // Navigate to editor with new project
        navigate({
          to: '/editor/$projectId',
          params: { projectId: result.project.id },
        })
      } else {
        toast.error(t('projects.toasts.createFailed'), { description: result.error })
        setIsSubmitting(false)
      }
    } catch (error) {
      logger.error('Failed to create project:', error)
      toast.error(t('projects.toasts.createFailed'), { description: t('projects.tryAgain') })
      setIsSubmitting(false)
    }
  }

  return (
    <div data-studio="true" className="min-h-dvh overflow-x-hidden bg-background text-foreground">
      <div className="flex h-12 items-center bg-[#242724] px-[18px] text-[#f6f7f3]">
        <Link to="/projects" className="flex shrink-0 items-baseline gap-1.5">
          <span className="text-[10px] font-semibold">BEAT VIDEO</span>
          <span className="text-[10px] font-semibold text-[#c7e85a]">MAKER</span>
        </Link>
      </div>

      <div className="px-4 py-8 sm:px-8 sm:py-10">
        <Link
          to="/projects"
          className="text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground hover:text-foreground"
        >
          ← Projects
        </Link>
        <h1 className="mt-5 text-[26px] font-semibold leading-8 text-foreground">New project</h1>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Set the essentials. Everything else stays editable later.
        </p>

        <div className="mt-10">
          <InlineCreateProjectForm onSubmit={handleSubmit} isSubmitting={isSubmitting} />
        </div>
      </div>
    </div>
  )
}
