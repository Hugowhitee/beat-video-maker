import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { PROJECT_TEMPLATES, getAspectRatio, type ProjectTemplate } from '../utils/validation'

interface ProjectTemplatePickerProps {
  onSelectTemplate: (template: ProjectTemplate) => void
  selectedTemplateId?: string | 'custom'
  onSelectCustom?: () => void
}

const PRIMARY_TEMPLATE_IDS = [
  'youtube-1080p',
  'vertical-9-16',
  'instagram-square',
  'instagram-portrait',
] as const

function AspectPreview({
  width,
  height,
  selected,
}: {
  width: number
  height: number
  selected: boolean
}) {
  const ratio = width / height
  const maxWidth = 42
  const maxHeight = 28
  const previewWidth = ratio >= 1 ? maxWidth : Math.max(10, maxHeight * ratio)
  const previewHeight = ratio >= 1 ? Math.max(10, maxWidth / ratio) : maxHeight

  return (
    <span
      className={
        selected
          ? 'flex h-[34px] w-[54px] shrink-0 items-center justify-center rounded-[2px] bg-[#343834]'
          : 'flex h-[34px] w-[54px] shrink-0 items-center justify-center rounded-[2px] bg-[#c5c8c2]'
      }
      aria-hidden="true"
    >
      <span
        className={selected ? 'rounded-[1px] bg-[#c7e85a]' : 'rounded-[1px] bg-[#343834]'}
        style={{ width: previewWidth, height: previewHeight }}
      />
    </span>
  )
}

export function ProjectTemplatePicker({
  onSelectTemplate,
  selectedTemplateId,
  onSelectCustom,
}: ProjectTemplatePickerProps) {
  const { t } = useTranslation()
  const isCustomSelected = selectedTemplateId === 'custom'
  const visibleTemplates = useMemo(() => {
    const primary = PROJECT_TEMPLATES.filter((template) =>
      PRIMARY_TEMPLATE_IDS.includes(
        template.id as (typeof PRIMARY_TEMPLATE_IDS)[number],
      ),
    )
    const selected = PROJECT_TEMPLATES.find((template) => template.id === selectedTemplateId)
    if (selected && !primary.some((template) => template.id === selected.id)) {
      return [...primary, selected]
    }
    return primary
  }, [selectedTemplateId])

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {visibleTemplates.map((template) => {
        const isSelected = selectedTemplateId === template.id
        const aspectRatio = getAspectRatio(template.width, template.height)
        const resolution = `${template.width}×${template.height}`

        return (
          <button
            key={template.id}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onSelectTemplate(template)}
            className={`flex min-h-[58px] min-w-0 items-center gap-2 rounded-[3px] border px-2.5 py-2 text-left transition-colors ${
              isSelected
                ? 'border-[#242724] bg-[#242724] text-[#f6f7f3]'
                : 'border-transparent bg-[#d1d4ce] text-foreground hover:border-border hover:bg-[#c7cac4]'
            }`}
          >
            <AspectPreview width={template.width} height={template.height} selected={isSelected} />
            <span className="min-w-0">
              <span className="block truncate text-[10px] font-semibold">
                {template.id === 'youtube-1080p'
                  ? 'YouTube'
                  : template.id === 'vertical-9-16'
                    ? 'Shorts'
                    : template.id === 'instagram-square'
                      ? 'Square'
                      : template.id === 'instagram-portrait'
                        ? 'Portrait'
                        : template.name}
              </span>
              <span
                className={`mt-1 block truncate font-mono text-[8px] ${
                  isSelected ? 'text-[#c7cac4]' : 'text-muted-foreground'
                }`}
              >
                {resolution} · {aspectRatio}
              </span>
            </span>
          </button>
        )
      })}
      {onSelectCustom ? (
        <button
          type="button"
          aria-pressed={isCustomSelected}
          onClick={onSelectCustom}
          className={`flex min-h-[58px] min-w-0 items-center gap-2 rounded-[3px] border px-2.5 py-2 text-left transition-colors ${
            isCustomSelected
              ? 'border-[#242724] bg-[#242724] text-[#f6f7f3]'
              : 'border-transparent bg-[#d1d4ce] text-foreground hover:border-border hover:bg-[#c7cac4]'
          }`}
        >
          <span
            className={
              isCustomSelected
                ? 'flex h-[34px] w-[54px] shrink-0 items-center justify-center rounded-[2px] bg-[#343834]'
                : 'flex h-[34px] w-[54px] shrink-0 items-center justify-center rounded-[2px] bg-[#c5c8c2]'
            }
            aria-hidden="true"
          >
            <span
              className={
                isCustomSelected
                  ? 'h-[24px] w-[38px] rounded-[1px] border border-[#c7e85a]'
                  : 'h-[24px] w-[38px] rounded-[1px] border border-[#343834]'
              }
            />
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1 text-[10px] font-semibold">
              <Plus className="h-3 w-3" />
              {t('projects.templatePicker.custom')}
            </span>
            <span
              className={`mt-1 block truncate text-[8px] ${
                isCustomSelected ? 'text-[#c7cac4]' : 'text-muted-foreground'
              }`}
            >
              {t('projects.templatePicker.enterDimensions')}
            </span>
          </span>
        </button>
      ) : null}
    </div>
  )
}
