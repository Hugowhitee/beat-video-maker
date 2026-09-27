import { memo } from 'react'
import { useTranslation } from 'react-i18next'
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
  label: string
}[] = [
  { id: 'beat', label: 'Beat' },
  { id: 'edit', label: 'Visual' },
  { id: 'master', label: 'Master' },
]

const ADVANCED_WORKSPACES: readonly {
  id: EditorWorkspaceId
  label: string
}[] = [
  { id: 'color', label: 'Color' },
  { id: 'motion', label: 'Motion' },
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
      className="flex items-center gap-0.5 rounded-sm border border-border/80 bg-secondary/70 p-0.5"
    >
      {PRIMARY_WORKSPACES.map(({ id, label }) => {
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
              'flex h-7 items-center gap-1.5 rounded-[3px] px-3 text-xs font-medium transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
            )}
          >
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
              'flex h-7 items-center gap-1 rounded-[3px] px-2 text-xs font-medium transition-colors',
              advancedActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
            )}
          >
            <span>Advanced</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-36">
          {ADVANCED_WORKSPACES.map(({ id, label }) => (
            <DropdownMenuItem key={id} onSelect={() => setWorkspace(id)}>
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
})
