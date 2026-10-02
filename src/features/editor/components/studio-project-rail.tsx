import { memo, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useEditorStore } from '@/shared/state/editor'
import { useProjectStore } from '@/features/editor/deps/projects-contract'
import { useMediaLibraryStore } from '@/features/editor/deps/media-library'
import {
  useCompositionNavigationStore,
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
  { label: 'Beat', workspace: 'beat', tab: 'beat' },
  { label: 'Sequences', workspace: 'edit', tab: 'media' },
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
  const sequenceCount = project?.timeline?.topLevelSequenceIds?.length ?? 0
  const sequences = useCompositionsStore((state) =>
    state.compositions.filter((composition) => composition.editorKind === 'sequence'),
  )
  const switchToSequence = useCompositionNavigationStore((state) => state.switchToSequence)
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
    beatReady ? 'Beat' : 'Media',
  )
  const [quickAddBusy, setQuickAddBusy] = useState<QuickTarget['action'] | null>(null)

  useEffect(() => {
    if (workspace === 'beat' || (workspace === 'master' && beatReady)) {
      setSelectedProjectSection('Beat')
    } else if (
      workspace === 'edit' &&
      (activeTab === 'text' || activeTab === 'shapes' || activeTab === 'lottie')
    ) {
      setSelectedProjectSection('Graphics')
    } else if (
      workspace === 'edit' &&
      activeTab === 'media' &&
      selectedProjectSection !== 'Sequences'
    ) {
      setSelectedProjectSection('Media')
    }
  }, [activeTab, beatReady, selectedProjectSection, workspace])

  const openTarget = (target: RailTarget) => {
    setSelectedProjectSection(target.label)
    setWorkspace(target.workspace)
    setActiveTab(target.tab)

    if (target.label === 'Sequences') {
      const firstSequence = sequences[0]
      if (firstSequence) {
        switchToSequence(firstSequence.id)
      } else {
        toast.info('No sequences yet', {
          description: 'Create or build a reusable sequence from the Visual workspace first.',
        })
      }
    }
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

  const projectRows = PROJECT_TARGETS.map((target, index) => ({
    target,
    top: 79 + index * 42,
    count:
      target.label === 'Beat' && beatReady
        ? 'READY'
        : target.label === 'Media' && mediaCount > 0
          ? String(mediaCount)
          : target.label === 'Sequences' && sequenceCount > 0
            ? String(sequenceCount)
            : target.label === 'Graphics' && graphicsCount > 0
              ? String(graphicsCount)
              : null,
  }))

  return (
    <aside
      className="studio-project-rail relative hidden h-full w-[214px] shrink-0 overflow-hidden border-r border-border bg-[#e8e9e5] md:block"
      aria-label="Project"
    >
      <div className="absolute left-4 top-[18px] text-[10px] font-semibold uppercase leading-3 tracking-[0.12em] text-muted-foreground">
        Project content
      </div>
      <div className="absolute left-4 top-[39px] max-w-[182px] truncate text-[15px] font-semibold leading-[18px] text-foreground">
        {project?.name ?? 'Untitled project'}
      </div>
      <div className="absolute left-4 top-[68px] h-px w-[182px] bg-border" />

      <nav aria-label="Project sections">
        {projectRows.map(({ target, top, count }) => {
          const selected = selectedProjectSection === target.label
          return (
            <button
              key={target.label}
              type="button"
              onClick={() => openTarget(target)}
              aria-current={selected ? 'page' : undefined}
              className={cn(
                'studio-rail-row absolute left-4 h-[34px] w-[182px] rounded-[3px] text-left text-[11px] leading-[13px] text-foreground',
                selected && 'studio-rail-row-active font-semibold',
              )}
              style={{ top }}
            >
              <span className="absolute left-3 top-[7px] max-w-[112px] truncate">
                {target.label}
              </span>
              {count ? (
                <span
                  className={cn(
                    'absolute left-[134px] top-[7px] max-w-[44px] truncate text-[9px] font-medium uppercase leading-[11px]',
                    selected ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {count}
                </span>
              ) : null}
            </button>
          )
        })}
      </nav>

      <div className="absolute left-4 top-[280px] text-[10px] font-semibold uppercase leading-3 tracking-[0.12em] text-muted-foreground">
        Quick add
      </div>
      <div className="absolute left-4 top-[302px] grid grid-cols-2 gap-x-2 gap-y-2">
        {QUICK_TARGETS.map((target) => (
          <button
            key={target.label}
            type="button"
            disabled={quickAddBusy !== null}
            onClick={() => void runQuickAdd(target)}
            className="studio-quick-tile flex h-8 w-[86px] items-center rounded-[3px] border-0 bg-[#d9dbd6] px-2.5 text-left text-[10px] font-medium text-foreground disabled:cursor-wait disabled:opacity-55"
          >
            + {quickAddBusy === target.action ? 'Adding…' : target.label}
          </button>
        ))}
      </div>

      <div className="absolute left-4 top-[398px] h-px w-[182px] bg-border" />
      <div className="absolute left-4 top-[416px] text-[10px] font-semibold uppercase leading-3 tracking-[0.12em] text-muted-foreground">
        Beat status
      </div>
      <div className="absolute left-4 top-[440px] text-[11px] font-semibold leading-[13px] text-foreground">
        {gridLocked ? 'Grid locked' : beatReady ? 'Grid ready' : 'No beat grid'}
      </div>
      <div className="absolute left-4 top-[460px] font-mono text-[10px] leading-3 tabular-nums text-muted-foreground">
        {bpm ? `${bpm.toFixed(2)} BPM · ${beatsPerBar}/4` : '— BPM · 4/4'}
      </div>
      <div className="absolute left-4 top-[477px] font-mono text-[10px] leading-3 tabular-nums text-muted-foreground">
        Downbeat {formatSourceTime(downbeat)}
      </div>
      <button
        type="button"
        onClick={() => openTarget(PROJECT_TARGETS[1]!)}
        className="studio-primary-action absolute left-4 top-[506px] h-8 w-[182px]"
      >
        Review grid
      </button>
    </aside>
  )
})
