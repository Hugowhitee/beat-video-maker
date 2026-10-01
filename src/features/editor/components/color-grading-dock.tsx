import { memo, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useColorPlayheadAutoSelect } from '../hooks/use-color-playhead-auto-select'
import {
  useItemsStore,
  useTimelineSettingsStore,
} from '@/features/editor/deps/timeline-store'
import { useSelectionStore } from '@/shared/state/selection'
import { addAdjustmentLayer } from '../utils/add-adjustment-layer'
import {
  ColorGradePanel,
  GLOBAL_COLOR_GRADE_LABEL,
  type ColorGradeScope,
} from './properties-sidebar/color-grade-panel'

export const ColorGradingDock = memo(function ColorGradingDock() {
  const { t } = useTranslation()
  const [scope, setScope] = useState<ColorGradeScope>('global')
  const items = useItemsStore((state) => state.items)
  const selectedItemIds = useSelectionStore((state) => state.selectedItemIds)

  const globalGrade = useMemo(
    () =>
      items.find(
        (item) =>
          item.type === 'adjustment' &&
          item.label === GLOBAL_COLOR_GRADE_LABEL &&
          item.from === 0,
      ) ?? null,
    [items],
  )
  const visualProgramItems = useMemo(
    () =>
      items.filter(
        (item) =>
          item.type !== 'audio' &&
          item.type !== 'adjustment' &&
          item.type !== 'controller',
      ),
    [items],
  )
  const globalGradeDuration = useMemo(
    () =>
      Math.max(
        1,
        ...visualProgramItems.map((item) => item.from + item.durationInFrames),
      ),
    [visualProgramItems],
  )

  useColorPlayheadAutoSelect(scope === 'clip')

  useEffect(() => {
    if (scope !== 'global' || visualProgramItems.length === 0) return

    if (!globalGrade) {
      addAdjustmentLayer(undefined, GLOBAL_COLOR_GRADE_LABEL, {
        from: 0,
        durationInFrames: globalGradeDuration,
      })
      return
    }

    if (globalGrade.durationInFrames !== globalGradeDuration) {
      useItemsStore.getState()._updateItem(globalGrade.id, {
        durationInFrames: globalGradeDuration,
      })
      useTimelineSettingsStore.getState().markDirty()
    }

    if (!selectedItemIds.includes(globalGrade.id)) {
      useSelectionStore.getState().selectItems([globalGrade.id])
    }
  }, [
    globalGrade,
    globalGradeDuration,
    scope,
    selectedItemIds,
    visualProgramItems.length,
  ])

  return (
    <section
      className="panel-bg flex h-full min-h-0 flex-col border-t border-border"
      aria-label={t('editor.colorPanel.dockLabel')}
      data-testid="color-grading-dock"
    >
      <div className="min-h-0 flex-1 overflow-hidden p-2">
        <ColorGradePanel layout="dock" scope={scope} onScopeChange={setScope} />
      </div>
    </section>
  )
})
