import { Image, Video } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useEditorStore } from '@/shared/state/editor'
import { useProjectStore } from '@/features/editor/deps/projects'
import {
  normalizeBeatvideoProjectMode,
  type BeatvideoProjectMode,
} from '@/shared/beatvideo/product-mode'
import { cn } from '@/shared/ui/cn'

export function BeatvideoModeSwitcher(props: {
  projectId: string
  fallbackMode: BeatvideoProjectMode
}) {
  const currentProject = useProjectStore((state) => state.currentProject)
  const updateProject = useProjectStore((state) => state.updateProject)
  const setWorkspace = useEditorStore((state) => state.setWorkspace)
  const setActiveTab = useEditorStore((state) => state.setActiveTab)
  const [pending, setPending] = useState<BeatvideoProjectMode | null>(null)

  const mode = normalizeBeatvideoProjectMode(
    currentProject?.id === props.projectId ? currentProject.beatvideoMode : props.fallbackMode,
  )

  const changeMode = async (nextMode: BeatvideoProjectMode) => {
    if (nextMode === mode || pending) return
    setPending(nextMode)

    try {
      await updateProject(props.projectId, { beatvideoMode: nextMode })
      setWorkspace('edit')
      setActiveTab('media')
    } catch (error) {
      toast.error('Could not change editor mode', {
        description: error instanceof Error ? error.message : 'Try again.',
      })
    } finally {
      setPending(null)
    }
  }

  return (
    <div
      role="tablist"
      aria-label="Beatvideo editor mode"
      className="flex items-center gap-0.5 rounded-md border border-border bg-muted/50 p-0.5"
    >
      {([
        ['photo', Image, 'Photo'],
        ['video', Video, 'Video'],
      ] as const).map(([value, Icon, label]) => {
        const active = mode === value
        return (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={pending !== null}
            onClick={() => void changeMode(value)}
            className={cn(
              'flex h-7 items-center gap-1.5 rounded-[5px] px-3 text-xs font-medium transition-colors',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
              pending === value && 'opacity-60',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        )
      })}
    </div>
  )
}
