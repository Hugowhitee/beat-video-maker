import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { AudioLines, Gauge, Layers, Palette, SlidersHorizontal, Sparkles } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEditorStore } from '@/shared/state/editor'
import { cn } from '@/shared/ui/cn'
import type { EditorWorkspaceId } from '@/config/editor-workspaces'
import type { BeatvideoProjectMode } from '@/types/project'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const PRIMARY_WORKSPACES: readonly {
  id: EditorWorkspaceId
  icon: LucideIcon
  label: string
}[] = [
  { id: 'beat', icon: AudioLines, label: 'Beat' },
  { id: 'edit', icon: Sparkles, label: 'Visual' },
  { id: 'master', icon: Gauge, label: 'Master' },
]

const ADVANCED_WORKSPACES: readonly {
  id: EditorWorkspaceId
  icon: LucideIcon
  label: string
}[] = [
  { id: 'color', icon: Palette, label: 'Color' },
  { id: 'motion', icon: Layers, label: 'Motion' },
]

/**
 * Producer-first Beatvideo workspaces. The primary path is Beat → Visual → Master.
 * Mature FreeCut Color/Motion workspaces remain available behind Advanced instead
 * of competing with the common publication flow.
 */
export const WorkspaceSwitcher = memo(function WorkspaceSwitcher({
  beatvideoMode = 'video',
}: {
  beatvideoMode?: BeatvideoProjectMode
}) {
  const { t } = useTranslation()
  const workspace = useEditorStore((s) => s.workspace)
  const setWorkspace = useEditorStore((s) => s.setWorkspace)
  const advancedActive = ADVANCED_WORKSPACES.some((item) => item.id === workspace)
  const visualHint =
    beatvideoMode === 'photo' ? 'Design the cover visual' : 'Edit footage and visuals'

  return (
    <div
      role="tablist"
      aria-label={t('toolbar.workspaces.label')}
      className="flex items-center gap-0.5 rounded-md bg-muted p-0.5"
    >
      {PRIMARY_WORKSPACES.map(({ id, icon: Icon, label }) => {
        const isActive = workspace === id
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            title={id === 'edit' ? visualHint : undefined}
            onClick={() => setWorkspace(id)}
            className={cn(
              'flex h-7 items-center gap-1.5 rounded-[5px] px-3 text-xs font-medium transition-colors',
              isActive
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        )
      })}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Advanced workspaces"
            className={cn(
              'flex h-7 items-center gap-1 rounded-[5px] px-2 text-xs font-medium transition-colors',
              advancedActive
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span className="hidden xl:inline">Advanced</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-36">
          {ADVANCED_WORKSPACES.map(({ id, icon: Icon, label }) => (
            <DropdownMenuItem key={id} onSelect={() => setWorkspace(id)}>
              <Icon className="h-3.5 w-3.5" />
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
})
