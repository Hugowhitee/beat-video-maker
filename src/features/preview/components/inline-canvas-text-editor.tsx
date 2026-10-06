import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { TextItem } from '@/types/timeline'
import type { CoordinateParams, Transform } from '../types/gizmo'
import {
  getEffectiveScale,
  getScreenTransformOrigin,
  transformToScreenBounds,
} from '../utils/coordinate-transform'
import { getTextItemPlainText } from '@/shared/utils/text-item-spans'
import { useTimelineStore } from '@/features/preview/deps/timeline-store'
import { useGizmoStore } from '../stores/gizmo-store'
import { buildInlineCanvasTextUpdate } from '../utils/canvas-text-edit'

/**
 * Direct preview editor for an existing TextItem.
 * Draft edits use the canonical compositor's property preview; Save creates
 * one timeline command. Cancel never touches persistent project state.
 */
export function InlineCanvasTextEditor({
  item,
  transform,
  coordParams,
  onFinished,
}: {
  item: TextItem
  transform: Transform
  coordParams: CoordinateParams
  onFinished: () => void
}) {
  const initialText = getTextItemPlainText(item)
  const [draft, setDraft] = useState(initialText)
  const initialPreviewRef = useRef(useGizmoStore.getState().preview?.[item.id] ?? null)
  const finishedRef = useRef(false)
  const updateItem = useTimelineStore((s) => s.updateItem)
  const bounds = transformToScreenBounds(transform, coordParams)
  const scale = getEffectiveScale(coordParams)
  const primaryStyle = item.textSpans?.[0]

  const restorePreview = useCallback(() => {
    useGizmoStore.getState().replaceItemPreview(item.id, initialPreviewRef.current)
  }, [item.id])

  useEffect(() => restorePreview, [restorePreview])

  const finish = (save: boolean) => {
    if (finishedRef.current) return
    finishedRef.current = true
    if (save && draft !== initialText) {
      updateItem(item.id, buildInlineCanvasTextUpdate(item, draft))
    }
    restorePreview()
    onFinished()
  }

  const updateDraft = (text: string) => {
    setDraft(text)
    const base = initialPreviewRef.current
    useGizmoStore.getState().replaceItemPreview(item.id, {
      ...base,
      properties: {
        ...base?.properties,
        ...buildInlineCanvasTextUpdate(item, text),
      },
    })
  }

  return (
    <div
      data-testid="inline-canvas-text-editor"
      className="absolute z-[150] flex flex-col overflow-visible rounded-sm border-2 border-primary bg-background/95 shadow-xl"
      style={{
        left: bounds.left,
        top: bounds.top,
        minWidth: Math.max(190, bounds.width),
        minHeight: Math.max(78, bounds.height),
        transform: `rotate(${transform.rotation}deg)`,
        transformOrigin: getScreenTransformOrigin(transform, coordParams),
      }}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <textarea
        autoFocus
        aria-label="Edit text on canvas"
        value={draft}
        onChange={(event) => updateDraft(event.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Escape') {
            event.preventDefault()
            finish(false)
          } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault()
            finish(true)
          }
        }}
        className="min-h-14 flex-1 resize-none border-0 bg-transparent p-2 text-foreground outline-none"
        style={{
          fontSize: Math.max(13, (primaryStyle?.fontSize ?? item.fontSize ?? 32) * scale),
          fontFamily: primaryStyle?.fontFamily ?? item.fontFamily ?? 'sans-serif',
          fontWeight: primaryStyle?.fontWeight ?? item.fontWeight ?? 'normal',
          textAlign: item.textAlign ?? 'center',
        }}
      />
      <div
        className="flex items-center justify-end gap-1 border-t border-border bg-background px-1 py-1"
        onMouseDown={(event) => event.preventDefault()}
      >
        <span className="mr-auto px-1 text-xs text-muted-foreground">Ctrl+Enter to save</span>
        <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => finish(false)}>
          Cancel
        </Button>
        <Button type="button" size="sm" className="h-8" onClick={() => finish(true)}>
          Save
        </Button>
      </div>
    </div>
  )
}
