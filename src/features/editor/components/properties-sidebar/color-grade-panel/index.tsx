import { lazy, memo, Suspense, useCallback, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Palette } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useSelectionStore } from '@/shared/state/selection'
import {
  useItemsStore,
  useTimelineSettingsStore,
} from '@/features/editor/deps/timeline-store'
import { KeyframeGraphPanel } from '@/features/editor/deps/timeline-keyframe-ui'
import { addAdjustmentLayer } from '@/features/editor/utils/add-adjustment-layer'
import type { TimelineItem } from '@/types/timeline'

const LazyColorGradeSection = lazy(() =>
  import('@/features/editor/deps/effects-contract').then((module) => ({
    default: module.ColorGradeSection,
  })),
)
const LazyEffectsSection = lazy(() =>
  import('@/features/editor/deps/effects-contract').then((module) => ({
    default: module.EffectsSection,
  })),
)

/**
 * Color workspace inspector: always-visible grade controls (wheels + curves)
 * on top, with the remaining effect stack below. Shown in place of the
 * regular clip panel while the Color workspace is active.
 */
const COLOR_PANEL_EFFECT_TYPES = ['gpu-color-wheels', 'gpu-curves'] as const
const COLOR_KEYFRAME_VISIBLE_GROUPS = ['effects'] as const
const COLOR_KEYFRAME_PROPERTY_COLUMN_WIDTH = 336
export const GLOBAL_COLOR_GRADE_LABEL = 'Global grade'

export type ColorGradeScope = 'global' | 'clip'

interface ColorGradePanelProps {
  layout?: 'sidebar' | 'dock'
  scope?: ColorGradeScope
  onScopeChange?: (scope: ColorGradeScope) => void
}

export const ColorGradePanel = memo(function ColorGradePanel({
  layout = 'sidebar',
  scope,
  onScopeChange,
}: ColorGradePanelProps) {
  const { t } = useTranslation()
  const selectedItemIds = useSelectionStore((s) => s.selectedItemIds)
  const allItems = useItemsStore((s) => s.items)
  const tracks = useItemsStore((s) => s.tracks)
  const selectedVisualItems = useItemsStore(
    useShallow(
      useCallback(
        (s) => {
          const items: TimelineItem[] = []
          for (const itemId of selectedItemIds) {
            const item = s.itemById[itemId]
            if (item && item.type !== 'audio') {
              items.push(item)
            }
          }
          return items
        },
        [selectedItemIds],
      ),
    ),
  )

  const handleCreateAdjustmentLayer = useCallback(() => {
    addAdjustmentLayer(undefined, t('editor.colorPanel.adjustmentLayerLabel'))
  }, [t])

  const globalGrade = useMemo(
    () =>
      allItems.find(
        (item) =>
          item.type === 'adjustment' &&
          item.label === GLOBAL_COLOR_GRADE_LABEL &&
          item.from === 0,
      ) ?? null,
    [allItems],
  )
  const globalGradeDuration = useMemo(
    () =>
      Math.max(
        1,
        ...allItems
          .filter(
            (item) =>
              item.type !== 'audio' &&
              item.type !== 'adjustment' &&
              item.type !== 'controller',
          )
          .map((item) => item.from + item.durationInFrames),
      ),
    [allItems],
  )
  const inferredGlobalSelected = useMemo(
    () => selectedVisualItems.some((item) => item.id === globalGrade?.id),
    [globalGrade?.id, selectedVisualItems],
  )

  useEffect(() => {
    if (!globalGrade || globalGrade.durationInFrames === globalGradeDuration) return

    // Global grade is a project-level contract, not a manually trimmed clip.
    // Keep it spanning the whole visual program as edits extend or shorten it.
    useItemsStore.getState()._updateItem(globalGrade.id, {
      from: 0,
      durationInFrames: globalGradeDuration,
    })
    useTimelineSettingsStore.getState().markDirty()
  }, [globalGrade, globalGradeDuration])

  useEffect(() => {
    if (!globalGrade) return
    const gradeTrack = tracks.find((track) => track.id === globalGrade.trackId)
    if (!gradeTrack) return

    const otherOrders = tracks
      .filter((track) => track.id !== gradeTrack.id && !track.isGroup)
      .map((track) => track.order ?? 0)
    if (otherOrders.length === 0) return

    const topOtherOrder = Math.min(...otherOrders)
    if ((gradeTrack.order ?? 0) < topOtherOrder) return

    // Full-video color must remain above footage created after the grade layer.
    // Track order is therefore derived from the scope contract, just like its
    // duration is derived from program length.
    useItemsStore.getState().setTracks(
      tracks.map((track) =>
        track.id === gradeTrack.id
          ? { ...track, order: topOtherOrder - 1 }
          : track,
      ),
    )
    useTimelineSettingsStore.getState().markDirty()
  }, [globalGrade, tracks])
  const effectiveScope: ColorGradeScope = scope ?? (inferredGlobalSelected ? 'global' : 'clip')
  const visualItems = useMemo(
    () =>
      effectiveScope === 'global'
        ? globalGrade
          ? [globalGrade]
          : []
        : selectedVisualItems.filter((item) => item.id !== globalGrade?.id),
    [effectiveScope, globalGrade, selectedVisualItems],
  )
  const handleSelectClipScope = useCallback(() => {
    onScopeChange?.('clip')
    // Clearing selection lets the playhead follower choose the best footage clip.
    useSelectionStore.getState().selectItems([])
  }, [onScopeChange])
  const handleSelectGlobalScope = useCallback(() => {
    onScopeChange?.('global')
    if (globalGrade) {
      useSelectionStore.getState().selectItems([globalGrade.id])
      return
    }
    addAdjustmentLayer(undefined, GLOBAL_COLOR_GRADE_LABEL, {
      from: 0,
      durationInFrames: globalGradeDuration,
    })
  }, [globalGrade, globalGradeDuration, onScopeChange])

  const handleKeepKeyframesOpen = useCallback(() => {
    // The Color page owns this dock; the shared keyframe editor needs a close
    // callback for its sidebar placement but the color lane is intentionally fixed.
  }, [])

  const hasVisualSelection = useMemo(() => visualItems.length > 0, [visualItems])
  const clipScopeLabel =
    selectedVisualItems.filter((item) => item.id !== globalGrade?.id).length > 1
      ? `${selectedVisualItems.filter((item) => item.id !== globalGrade?.id).length} selected clips`
      : 'Current clip'
  const scopeBar = (
    <div className="flex shrink-0 items-center justify-between gap-2">
      <div className="studio-segmented flex h-8 min-w-0" role="group" aria-label="Color grade scope">
        <button
          type="button"
          className="studio-segment h-7 min-w-[92px] px-3 text-[10px] font-medium"
          aria-pressed={effectiveScope === 'clip'}
          onClick={handleSelectClipScope}
        >
          {clipScopeLabel}
        </button>
        <button
          type="button"
          className="studio-segment h-7 min-w-[88px] px-3 text-[10px] font-medium"
          aria-pressed={effectiveScope === 'global'}
          onClick={handleSelectGlobalScope}
        >
          Full video
        </button>
      </div>
      <span className="min-w-0 truncate font-mono text-[9px] text-muted-foreground">
        {effectiveScope === 'global'
          ? 'Adjustment layer · whole timeline'
          : hasVisualSelection
            ? visualItems[0]?.label
            : 'Move playhead onto a clip'}
      </span>
    </div>
  )

  if (!hasVisualSelection) {
    return (
      <div className="flex h-full min-h-[12rem] flex-col gap-2">
        {scopeBar}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-4 py-10 text-center">
          <Palette className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
          <p className="text-xs text-muted-foreground">{t('editor.colorPanel.emptyState')}</p>
        </div>
      </div>
    )
  }

  const sectionClassName = layout === 'dock' ? 'min-h-0 overflow-hidden' : undefined

  if (layout === 'dock') {
    return (
      <div className="flex h-full min-h-0 flex-col gap-2">
        {scopeBar}
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,10fr)_minmax(0,3fr)_minmax(0,7fr)] gap-3">
          <Suspense fallback={null}>
          <div className={sectionClassName}>
            <LazyColorGradeSection
              items={visualItems}
              layout={layout}
              onCreateAdjustmentLayer={handleCreateAdjustmentLayer}
            />
          </div>
          <div className="min-h-0 overflow-hidden rounded-[3px] border border-border/70 bg-background/35">
            <LazyEffectsSection
              items={visualItems}
              hiddenGpuEffectTypes={COLOR_PANEL_EFFECT_TYPES}
              layout="dock"
            />
          </div>
          <div
            className="min-h-0 overflow-hidden rounded-[3px] border border-border/70 bg-background/35"
            data-testid="color-keyframes-lane"
          >
            <KeyframeGraphPanel
              isOpen={true}
              placement="side"
              showCloseButton={false}
              onClose={handleKeepKeyframesOpen}
              initialVisibleGroupIds={COLOR_KEYFRAME_VISIBLE_GROUPS}
              propertyColumnWidth={COLOR_KEYFRAME_PROPERTY_COLUMN_WIDTH}
            />
          </div>
          </Suspense>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {scopeBar}
      <Suspense fallback={null}>
        <div className={sectionClassName}>
          <LazyColorGradeSection
            items={visualItems}
            layout={layout}
            onCreateAdjustmentLayer={handleCreateAdjustmentLayer}
          />
        </div>
        <div className={sectionClassName}>
          <LazyEffectsSection items={visualItems} hiddenGpuEffectTypes={COLOR_PANEL_EFFECT_TYPES} />
        </div>
      </Suspense>
    </div>
  )
})
