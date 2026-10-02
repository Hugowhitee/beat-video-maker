import { memo } from 'react'
import { AudioLines, Blend, Film, FolderOpen, Layers3, Type } from 'lucide-react'
import { useEditorStore } from '@/shared/state/editor'
import { useProjectStore } from '@/features/editor/deps/projects-contract'
import type { EditorSidebarTab, EditorWorkspaceId } from '@/config/editor-workspaces'
import { cn } from '@/shared/ui/cn'

type RailTarget = {
  label: string
  icon: typeof FolderOpen
  workspace: EditorWorkspaceId
  tab: EditorSidebarTab
}

const PROJECT_TARGETS: readonly RailTarget[] = [
  { label: 'Media', icon: FolderOpen, workspace: 'edit', tab: 'media' },
  { label: 'Beat grid', icon: AudioLines, workspace: 'beat', tab: 'beat' },
  { label: 'Sequences', icon: Layers3, workspace: 'edit', tab: 'media' },
  { label: 'Transitions', icon: Blend, workspace: 'edit', tab: 'transitions' },
  { label: 'Graphics', icon: Type, workspace: 'edit', tab: 'text' },
]

const QUICK_TARGETS: readonly RailTarget[] = [
  { label: 'Footage', icon: Film, workspace: 'edit', tab: 'media' },
  { label: 'Beat', icon: AudioLines, workspace: 'beat', tab: 'beat' },
  { label: 'Text', icon: Type, workspace: 'edit', tab: 'text' },
  { label: 'Graphic', icon: Layers3, workspace: 'edit', tab: 'shapes' },
]

export const StudioProjectRail = memo(function StudioProjectRail() {
  const workspace = useEditorStore((state) => state.workspace)
  const activeTab = useEditorStore((state) => state.activeTab)
  const setWorkspace = useEditorStore((state) => state.setWorkspace)
  const setActiveTab = useEditorStore((state) => state.setActiveTab)
  const project = useProjectStore((state) => state.currentProject)

  const music = project?.beatvideoMusic
  const bpm = music?.bpmOverride ?? music?.musicMap?.bpm ?? null
  const beatsPerBar = music?.musicMap?.beatsPerBar ?? 4
  const beatReady = Boolean(music?.musicMap?.beats?.length)
  const gridVerified = Boolean(music?.barOneVerified)

  const openTarget = (target: RailTarget) => {
    setWorkspace(target.workspace)
    setActiveTab(target.tab)
  }

  return (
    <aside
      className="studio-project-rail hidden h-full w-[214px] shrink-0 flex-col overflow-hidden border-r border-border bg-sidebar md:flex"
      aria-label="Project"
    >
      <div className="flex h-11 shrink-0 items-center border-b border-border px-4">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground">
          Project
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <div className="px-2 pb-2 pt-1">
          <div className="truncate text-[12px] font-semibold text-foreground">
            {project?.name ?? 'Untitled project'}
          </div>
          <div className="mt-0.5 font-mono text-[9px] text-muted-foreground">
            {bpm ? `${Math.round(bpm)} BPM · ${beatsPerBar}/4` : 'Beat not analyzed'}
          </div>
        </div>

        <nav className="border-y border-border py-1" aria-label="Project sections">
          {PROJECT_TARGETS.map((target) => {
            const Icon = target.icon
            const selected = workspace === target.workspace && activeTab === target.tab
            return (
              <button
                key={target.label}
                type="button"
                onClick={() => openTarget(target)}
                aria-current={selected ? 'page' : undefined}
                className={cn(
                  'studio-rail-row flex h-9 w-full items-center gap-2.5 px-2 text-left text-[11px] font-medium',
                  selected ? 'studio-rail-row-active' : 'text-muted-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                <span className="min-w-0 flex-1 truncate">{target.label}</span>
              </button>
            )
          })}
        </nav>

        <section className="py-3">
          <div className="px-2 pb-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Quick add
          </div>
          <div className="grid grid-cols-2 gap-1.5 px-1">
            {QUICK_TARGETS.map((target) => {
              const Icon = target.icon
              return (
                <button
                  key={target.label}
                  type="button"
                  onClick={() => openTarget(target)}
                  className="studio-quick-tile flex h-14 flex-col items-start justify-between border border-border bg-card px-2.5 py-2 text-left text-[10px] font-medium text-foreground"
                >
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
                  <span>{target.label}</span>
                </button>
              )
            })}
          </div>
        </section>

        <section className="border-t border-border px-2 py-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Beat status
            </span>
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                beatReady ? 'bg-primary' : 'bg-muted-foreground/45',
              )}
              aria-hidden="true"
            />
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-[10px]">
            <span className="text-muted-foreground">Analysis</span>
            <span className="font-medium text-foreground">{beatReady ? 'Ready' : 'Missing'}</span>
            <span className="text-muted-foreground">Bar 1</span>
            <span className="font-medium text-foreground">
              {gridVerified ? 'Verified' : beatReady ? 'Review' : '—'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => openTarget(PROJECT_TARGETS[1])}
            className="studio-secondary-action mt-3 h-8 w-full"
          >
            Review grid
          </button>
        </section>
      </div>
    </aside>
  )
})
