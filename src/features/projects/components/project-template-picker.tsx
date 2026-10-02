import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { PROJECT_TEMPLATES, getAspectRatio, type ProjectTemplate } from '../utils/validation'

interface ProjectTemplatePickerProps {
  onSelectTemplate: (template: ProjectTemplate) => void
  selectedTemplateId?: string | 'custom'
  onSelectCustom?: () => void
}

export function ProjectTemplatePicker({
  onSelectTemplate,
  selectedTemplateId,
  onSelectCustom,
}: ProjectTemplatePickerProps) {
  const { t } = useTranslation()
  const isCustomSelected = selectedTemplateId === 'custom'
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {PROJECT_TEMPLATES.map((template) => {
        const isSelected = selectedTemplateId === template.id
        const aspectRatio = getAspectRatio(template.width, template.height)
        const resolution = `${template.width}×${template.height}`

        return (
          <button
            key={template.id}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onSelectTemplate(template)}
            className={`min-h-14 rounded-[3px] border px-3 py-2 text-left transition-colors ${
              isSelected
                ? 'border-[#242724] bg-[#242724] text-[#f6f7f3]'
                : 'border-transparent bg-[#d1d4ce] text-foreground hover:border-border hover:bg-[#c7cac4]'
            }`}
          >
            <span className="block text-[10px] font-semibold">{template.name}</span>
            <span
              className={`mt-1 block font-mono text-[9px] ${
                isSelected ? 'text-[#c7cac4]' : 'text-muted-foreground'
              }`}
            >
              {resolution} · {aspectRatio}
            </span>
          </button>
        )
      })}
      {onSelectCustom ? (
        <button
          type="button"
          aria-pressed={isCustomSelected}
          onClick={onSelectCustom}
          className={`min-h-14 rounded-[3px] border px-3 py-2 text-left transition-colors ${
            isCustomSelected
              ? 'border-[#242724] bg-[#242724] text-[#f6f7f3]'
              : 'border-transparent bg-[#d1d4ce] text-foreground hover:border-border hover:bg-[#c7cac4]'
          }`}
        >
          <span className="flex items-center gap-1.5 text-[10px] font-semibold">
            <Plus className="h-3 w-3" />
            {t('projects.templatePicker.custom')}
          </span>
          <span
            className={`mt-1 block text-[9px] ${
              isCustomSelected ? 'text-[#c7cac4]' : 'text-muted-foreground'
            }`}
          >
            {t('projects.templatePicker.enterDimensions')}
          </span>
        </button>
      ) : null}
    </div>
  )}
