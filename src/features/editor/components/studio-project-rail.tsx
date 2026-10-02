import { memo, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useEditorStore } from '@/shared/state/editor'
import { useProjectStore } from '@/features/editor/deps/projects-contract'
import { useMediaLibraryStore } from '@/features/editor/deps/media-library'
import {
  useCompositionsStore,
  useItemsStore,
} from '@/features/editor/deps/timeline-store'
import type { EditorSidebarTab, EditorWorkspaceId } from '@/config/editor-workspaces'
import { cn } from '@/shared/ui/cn'
import {
  addStudioGraphicLayer,
  addStudioTextLayer,
  importStudioVisualMedia,
} from '../utils/studio-quick-add'

type RailTarget = {
  label: string
  workspace: EditorWorkspaceId
  tab: EditorSidebarTab
}

type QuickTarget = RailTarget & {
  action: 'footage' | 'photo' | 'text' | 'graphic'
}

const PROJECT_TARGETS: readonly RailTarget[] = [
  { label: 'Media', workspace: 'edit', tab: 'media' },
  { label: 'Beat grid', workspace: 'beat', tab: 'beat' },
  { label: 'Sequences', workspace: 'edit', tab: 'media' },
  { label: 'Transitions', workspace: 'edit', tab: 'transitions' },
  { label: 'Graphics', workspace: 'edit', tab: 'text' },
]

const QUICK_TARGETS: readonly QuickTarget[] = [
  { label: 'Footage', workspace: 'edit', tab: 'media', action: 'footage' },
  { label: 'Photo', workspace: 'edit', tab: 'media', action: 'photo' },
  { label: 'Text', workspace: 'edit', tab: 'text', action: 'text' },
  { label: 'Graphic', workspace: 'edit', tab: 'shapes', action: 'graphic' },
]

function formatSourceTime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '—'
  const safe = Math.max(0, seconds)
  const minutes = Math.floor(safe / 60)
  const remainder = safe - minutes * 60
  return `${String(minutes).padStart(2, '0')}:${remainder.toFixed(3).padStart(6, '0')}`
}

export const StudioProjectRail = memo(function StudioProjectRail() {
  const workspace = useEditorStore((state) => state.workspace)
  const activeTab = useEditorStore((state) => state.activeTab)
  const setWorkspace = useEditorStore((state) => state.setWorkspace)
  const setActiveTab = useEditorStore((state) => state.setActiveTab)
  const project = useProjectStore((state) => state.currentProject)
  const mediaCount = useMediaLibraryStore((state) => state.mediaItems.length)
  const sequenceCount = useCompositionsStore((state) => state.compositions.length)
  const graphicsCount = useItemsStore(
    (state) =>
      state.items.filter(
        (item) =>
          item.type === 'text' ||
          item.type === 'shape' ||
          item.type === 'lottie',
      ).length,
  )

  const music = project?.beatvideoMusic
  const bpm = music?.bpmOverride ?? music?.musicMap?.bpm ?? null
  const beatsPerBar = music?.musicMap?.beatsPerBar ?? 4
  const beatReady = Boolean(music?.musicMap?.beats?.length)
  const gridLocked = beatReady && Boolean(music?.barOneVerified)
  const downbeat = music?.barOneTime ?? music?.detectedBarOneTime ?? null
  const [selectedProjectSection, setSelectedProjectSection] = useState(
    beatReady ? 'Beat grid' : 'Media',
  )
  const [quickAddBusy, setQuickAddBusy] = useState<QuickTarget['action'] | null>(null)

  useEffect(() => {
    if (workspace === 'beat') {
      setSelectedProjectSection('Beat grid')
    } else if (workspace === 'edit' && activeTab === 'transitions') {
      setSelectedProjectSection('Transitions')
    } else if (
      workspace === 'edit' &&
      (activeTab === 'text' || activeTab === 'shapes' || activeTab === 'lottie')
    ) {
      setSelectedProjectSection('Graphics')
    }
  }, [activeTab, workspace])

  const openTarget = (target: RailTarget) => {
    setSelectedProjectSection(target.label)
    setWorkspace(target.workspace)
    setActiveTab(target.tab)
  }

  const runQuickAdd = async (target: QuickTarget) => {
    if (quickAddBusy) return

    setWorkspace(target.workspace)
    setActiveTab(target.tab)

    if (target.action === 'text') {
      setSelectedProjectSection('Graphics')
      if (!addStudioTextLayer()) toast.error('Could not add a text layer')
      return
    }

    if (target.action === 'graphic') {
      setSelectedProjectSection('Graphics')
      if (!addStudioGraphicLayer()) toast.error('Could not add a graphic layer')
      return
    }

    setSelectedProjectSection('Media')
    setQuickAddBusy(target.action)
    try {
      const result = await importStudioVisualMedia(
        target.action === 'footage' ? 'video' : 'image',
      )
      if (result.importedCount === 0) return
      if (result.matchingCount === 0) {
        toast.warning(
          target.action === 'footage'
            ? 'Choose one or more video files'
            : 'Choose one or more image files',
        )
        return
      }
      toast.success(
        target.action === 'footage'
          ? result.matchingCount === 1
            ? 'Footage added to the project'
            : `${result.matchingCount} footage files added`
          : result.matchingCount === 1
            ? 'Photo added to the project'
            : `${result.matchingCount} photos added`,
      )
    } catch (error) {
      toast.error(target.action === 'footage' ? 'Could not add footage' : 'Could not add photo', {
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setQuickAddBusy(null)
    }
  }

  return (
    <aside
      className="studio-project-rail hidden h-full w-[214px] shrink-0 flex-col overflow-hidden border-r border-border bg-sidebar md:flex"
      aria-label="Project"
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4">
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Project
        </div>
        <div className="mt-2 truncate text-[15px] font-semibold leading-5 text-foreground">
          {project?.name ?? 'Untitled project'}
        </div>

        <div className="mt-3 border-t border-border pt-1.5">
          {PROJECT_TARGETS.map((target) => {
            const selected = selectedProjectSection === target.label

            return (
              <button
                key={target.label}
                type="button"
                onClick={() => openTarget(target)}
                aria-current={selected ? 'page' : undefined}
                className={cn(
                  'studio-rail-row flex h-[42px] w-full items-center justify-between px-3 text-left text-[11px] font-medium',
                  selected ? 'studio-rail-row-active font-semibold' : 'text-foreground',
                )}
              >
                <span className="min-w-0 truncate">{target.label}</span>
                {target.label === 'Beat grid' && beatReady ? (
                  <span className="text-[9px] font-medium uppercase text-muted-foreground">
                    Ready
                  </span>
                ) : target.label === 'Media' && mediaCount > 0 ? (
                  <span className="text-[9px] font-medium text-muted-foreground">
                    {mediaCount}
                  </span>
                ) : target.label === 'Sequences' && sequenceCount > 0 ? (
                  <span className="text-[9px] font-medium text-muted-foreground">
                    {sequenceCount}
                  </span>
                ) : target.label === 'Graphics' && graphicsCount > 0 ? (
                  <span className="text-[9px] font-medium text-muted-foreground">
                    {graphicsCount}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>

        <section className="mt-5">
          <div className="pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Quick add
          </div>
          <div className="grid grid-cols-2 gap-2">
            {QUICK_TARGETS.map((target) => (
              <button
                key={target.label}
                type="button"
                disabled={quickAddBusy !== null}
                onClick={() => void runQuickAdd(target)}
                className="studio-quick-tile flex h-8 items-center border-0 bg-[#d9dbd6] px-2.5 text-left text-[10px] font-medium text-foreground disabled:cursor-wait disabled:opacity-55"
              >
                + {quickAddBusy === target.action ? 'Adding…' : target.label}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-6 border-t border-border pt-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Beat status
          </div>
          <div className="mt-2 text-[11px] font-semibold text-foreground">
            {gridLocked ? 'Grid locked' : beatReady ? 'Grid ready' : 'No beat grid'}
          </div>
          <div className="mt-1 font-mono text-[10px] tabular-nums text-muted-foreground">
            {bpm ? `${bpm.toFixed(2)} BPM · ${beatsPerBar}/4` : '— BPM · 4/4'}
          </div>
          <div className="mt-1 font-mono text-[10px] tabular-nums text-muted-foreground">
            Downbeat {formatSourceTime(downbeat)}
          </div>
          <button
            type="button"
            onClick={() => openTarget(PROJECT_TARGETS[1]!)}
            className="studio-primary-action mt-4 h-8 w-full"
          >
            Review grid
          </button>
        </section>
      </div>
    </aside>
  )
})
