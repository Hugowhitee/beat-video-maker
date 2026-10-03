import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Link } from '@tanstack/react-router'
import {
  createProjectFormSchema,
  type ProjectFormData,
  type ProjectTemplate,
  DEFAULT_PROJECT_VALUES,
  PROJECT_TEMPLATES,
} from '../utils/validation'
import { getProjectFpsPickerOptions } from '../utils/project-fps'
import { ProjectTemplatePicker } from './project-template-picker'
import { Clapperboard, Image as ImageIcon } from 'lucide-react'
import { cn } from '@/shared/ui/cn'

interface ProjectFormBaseProps {
  onSubmit: (data: ProjectFormData) => Promise<void> | void
  onCancel?: () => void
  defaultValues?: Partial<ProjectFormData>
  isSubmitting?: boolean
  mode: 'create' | 'edit'
  surface: 'page' | 'inline'
}

type ProjectFormProps = Omit<ProjectFormBaseProps, 'mode' | 'surface'>

export function InlineCreateProjectForm(props: ProjectFormProps) {
  return <ProjectFormBase {...props} mode="create" surface="inline" />
}

export function EditProjectForm(props: ProjectFormProps) {
  return <ProjectFormBase {...props} mode="edit" surface="inline" />
}

function ProjectFormBase({
  onSubmit,
  onCancel,
  defaultValues,
  isSubmitting = false,
  mode,
  surface,
}: ProjectFormBaseProps) {
  const { t } = useTranslation()
  const isEditing = mode === 'edit'
  const isInlineSurface = surface === 'inline'
  const resolvedDefaultValues = useMemo(
    () => ({
      ...DEFAULT_PROJECT_VALUES,
      ...defaultValues,
    }),
    [defaultValues],
  )
  const validationSchema = useMemo(() => createProjectFormSchema((key) => t(key)), [t])

  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
    watch,
    setValue,
    reset,
  } = useForm<ProjectFormData>({
    resolver: zodResolver(validationSchema),
    defaultValues: resolvedDefaultValues,
    mode: 'onChange',
  })

  const matchTemplateId = (width: number, height: number) =>
    PROJECT_TEMPLATES.find((t) => t.width === width && t.height === height)?.id ?? 'custom'

  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>(() =>
    matchTemplateId(resolvedDefaultValues.width, resolvedDefaultValues.height),
  )

  useEffect(() => {
    reset(resolvedDefaultValues)
  }, [reset, resolvedDefaultValues])

  useEffect(() => {
    setSelectedTemplateId(
      matchTemplateId(resolvedDefaultValues.width, resolvedDefaultValues.height),
    )
  }, [resolvedDefaultValues.height, resolvedDefaultValues.width])

  const beatvideoMode = watch('beatvideoMode')
  const fps = watch('fps')
  const width = watch('width')
  const height = watch('height')
  const fpsOptions = useMemo(() => getProjectFpsPickerOptions(fps), [fps])

  const handleSelectTemplate = (template: ProjectTemplate) => {
    setSelectedTemplateId(template.id)
    setValue('width', template.width, { shouldValidate: true })
    setValue('height', template.height, { shouldValidate: true })
    setValue('fps', template.fps, { shouldValidate: true })
  }

  const handleCustomSelect = () => {
    setSelectedTemplateId('custom')
  }

  return (
    <div className="bg-background">
      {/* Header */}
      {!isInlineSurface && (
        <div className="panel-header border-b border-border">
          <div className="max-w-[1400px] mx-auto px-6 py-5">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-1">
              {isEditing ? t('projects.form.editTitle') : t('projects.form.createTitle')}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isEditing ? t('projects.form.editSubtitle') : t('projects.form.createSubtitle')}
            </p>
          </div>
        </div>
      )}

      {/* Form */}
      <div className={isInlineSurface ? '' : 'max-w-[1400px] mx-auto px-6 py-8'}>
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="mx-auto max-w-[820px] space-y-7 rounded-[4px] bg-[#e8e9e5] p-5 sm:p-6"
        >
          <input type="hidden" {...register('beatvideoMode')} />
          <div>
            <div className="mb-3 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Project type
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {([
                {
                  id: 'photo' as const,
                  label: 'Photo',
                  description: 'Cover image + beat. Shape the look, motion, effects and text.',
                  icon: ImageIcon,
                },
                {
                  id: 'video' as const,
                  label: 'Video',
                  description: 'Footage + beat. Cut clips, add transitions and use manual or assisted editing.',
                  icon: Clapperboard,
                },
              ]).map((modeOption) => {
                const Icon = modeOption.icon
                const selected = beatvideoMode === modeOption.id
                return (
                  <button
                    key={modeOption.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() =>
                      setValue('beatvideoMode', modeOption.id, {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    }
                    className={cn(
                      'flex min-h-16 items-start gap-3 rounded-[3px] border px-4 py-3 text-left transition-colors',
                      selected
                        ? 'border-[#242724] bg-[#242724] text-[#f6f7f3]'
                        : 'border-transparent bg-[#d1d4ce] text-foreground hover:border-border hover:bg-[#c7cac4]',
                    )}
                  >
                    <Icon className="mt-0.5 h-5 w-5 shrink-0" />
                    <span>
                      <strong className="block text-sm font-medium">{modeOption.label}</strong>
                      <span
                        className={cn(
                          'mt-1 block text-[10px] leading-relaxed',
                          selected ? 'text-[#c7cac4]' : 'text-muted-foreground',
                        )}
                      >
                        {modeOption.description}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-8">
            {/* Project Details */}
            <div
              className="border-t border-border pt-6"
            >
              <div className="mb-5 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {t('projects.form.projectDetails')}
              </div>

              <div className="space-y-5">
                {/* Project Name */}
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-foreground mb-2">
                    {t('projects.form.projectName')} <span className="text-destructive">*</span>
                  </label>
                  <input
                    id="name"
                    type="text"
                    {...register('name')}
                    className="h-10 w-full rounded-[3px] border border-input bg-[#d9dbd6] px-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder={t('projects.form.projectNamePlaceholder')}
                  />
                  {errors.name && (
                    <p className="mt-1.5 text-sm text-destructive">{errors.name.message}</p>
                  )}
                </div>

                <details open={isEditing} className="border-t border-border pt-4">
                  <summary className="cursor-pointer list-none text-[10px] font-medium text-muted-foreground hover:text-foreground marker:hidden [&::-webkit-details-marker]:hidden">
                    More options
                  </summary>
                  <div className="mt-3">
                    <label
                      htmlFor="description"
                      className="mb-2 block text-[10px] font-medium text-foreground"
                    >
                      {t('projects.form.description')}
                    </label>
                    <textarea
                      id="description"
                      rows={3}
                      {...register('description')}
                      className="w-full resize-none rounded-[3px] border border-input bg-[#d9dbd6] px-3 py-2 text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      placeholder={t('projects.form.descriptionPlaceholder')}
                    />
                    {errors.description && (
                      <p className="mt-1.5 text-[10px] text-destructive">{errors.description.message}</p>
                    )}
                  </div>
                </details>
              </div>
            </div>

            {/* Video Settings */}
            <div className="border-t border-border pt-6">
              <div className="mb-5 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {t('projects.form.resolution')}
              </div>

              <ProjectTemplatePicker
                selectedTemplateId={selectedTemplateId}
                onSelectTemplate={handleSelectTemplate}
                onSelectCustom={handleCustomSelect}
              />
              {selectedTemplateId === 'custom' && (
                <div className="mt-5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2 sm:gap-3">
                  <div className="flex-1">
                    <label
                      htmlFor="width"
                      className="mb-1 block text-xs font-medium text-muted-foreground"
                    >
                      {t('projects.form.widthPx')}
                    </label>
                    <input
                      id="width"
                      type="number"
                      {...register('width', { valueAsNumber: true })}
                      className="h-10 w-full rounded-[3px] border border-input bg-[#d9dbd6] px-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      placeholder="1920"
                      min={320}
                    />
                    {errors.width && (
                      <p className="mt-1 text-xs text-destructive">{errors.width.message}</p>
                    )}
                  </div>
                  <span className="pb-2 text-muted-foreground">×</span>
                  <div className="flex-1">
                    <label
                      htmlFor="height"
                      className="mb-1 block text-xs font-medium text-muted-foreground"
                    >
                      {t('projects.form.heightPx')}
                    </label>
                    <input
                      id="height"
                      type="number"
                      {...register('height', { valueAsNumber: true })}
                      className="h-10 w-full rounded-[3px] border border-input bg-[#d9dbd6] px-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      placeholder="1080"
                      min={240}
                    />
                    {errors.height && (
                      <p className="mt-1 text-xs text-destructive">{errors.height.message}</p>
                    )}
                  </div>
                </div>
              )}

              <div className="mt-6">
                <div className="mb-3 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {t('projects.form.frameRate')}
                </div>
                <div
                  className={cn(
                    'studio-segmented grid h-9 w-full gap-px sm:max-w-[430px]',
                    fpsOptions.length === 5 ? 'grid-cols-5' : 'grid-cols-4',
                  )}
                >
                  {fpsOptions.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      className="studio-segment h-8 min-w-0 px-1 text-[9px] font-medium"
                      aria-pressed={fps === preset.value}
                      title={preset.label}
                      onClick={() =>
                        setValue('fps', preset.value, {
                          shouldDirty: true,
                          shouldValidate: true,
                        })
                      }
                    >
                      {preset.value} fps
                    </button>
                  ))}
                </div>
                {errors.fps && (
                  <p className="mt-1.5 text-[10px] text-destructive">{errors.fps.message}</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 border-t border-border pt-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Ready
              </div>
              <div className="mt-1 truncate text-[11px] font-semibold text-foreground">
                {beatvideoMode === 'photo' ? 'Photo' : 'Video'} · {width} × {height} · {fps} fps
              </div>
            </div>

            {/* Actions */}
            <div className="grid w-full shrink-0 grid-cols-2 gap-2 sm:w-auto sm:flex sm:justify-end sm:gap-2">
              {onCancel ? (
              <Button
                type="button"
                variant="outline"
                size="lg"
                disabled={isSubmitting}
                onClick={onCancel}
              >
                {t('common.cancel')}
              </Button>
            ) : (
              <Link to="/projects">
                <Button type="button" variant="outline" size="lg" className="w-full" disabled={isSubmitting}>
                  {t('common.cancel')}
                </Button>
              </Link>
            )}
            <Button
              type="submit"
              size="lg"
              className="w-full sm:w-auto sm:min-w-[160px]"
              disabled={!isValid || isSubmitting}
            >
              {isSubmitting
                ? t('common.saving')
                : isEditing
                  ? t('projects.form.updateProject')
                  : t('projects.form.createProject')}
            </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
