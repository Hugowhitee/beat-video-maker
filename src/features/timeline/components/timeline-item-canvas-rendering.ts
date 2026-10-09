import type { TimelineItem } from '@/types/timeline'

export interface TimelineCanvasClipRect {
  left: number
  top: number
  width: number
  height: number
  right: number
  bottom: number
}

interface TimelineCanvasClipPalette {
  fill: string
  stroke: string
  labelFill: string
  text: string
}

const LABEL_HORIZONTAL_PADDING = 8

/** The dense renderer consumes the same semantic colors as DOM clip shells. */
export function getTimelineCanvasClipPalette(
  itemType: TimelineItem['type'],
  tokens: Readonly<Record<string, string>> = {},
): TimelineCanvasClipPalette {
  const color = (name: string, fallback: string) => tokens[name]?.trim() || fallback
  const background = color('--timeline-bg', '#1c252b')
  const text = color('--foreground', '#e4eaed')
  const typeColor = color(
    `--color-timeline-${itemType}`,
    itemType === 'audio'
      ? '#28333a'
      : itemType === 'text'
        ? '#9682b3'
        : itemType === 'image'
          ? '#7d95a1'
          : itemType === 'shape'
            ? '#ed8936'
            : '#39474f',
  )
  const translucent = itemType === 'image' || itemType === 'shape'
  return {
    fill:
      itemType === 'text'
        ? background
        : translucent
          ? `color-mix(in oklab, ${typeColor} 30%, transparent)`
          : typeColor,
    stroke: typeColor,
    labelFill: itemType === 'text' ? typeColor : 'transparent',
    text,
  }
}
export function getTimelineCanvasClipRect({
  item,
  fps,
  pixelsPerSecond,
  scrollLeft,
  trackHeight,
}: {
  item: Pick<TimelineItem, 'from' | 'durationInFrames'>
  fps: number
  pixelsPerSecond: number
  scrollLeft: number
  trackHeight: number
}): TimelineCanvasClipRect {
  const pxPerFrame = fps > 0 ? pixelsPerSecond / fps : 0
  const left = item.from * pxPerFrame - scrollLeft
  const width = Math.max(1, item.durationInFrames * pxPerFrame)
  const top = 1
  const height = Math.max(1, trackHeight - 2)
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  }
}

export function isTimelineCanvasClipVisible(
  rect: TimelineCanvasClipRect,
  viewportWidth: number,
): boolean {
  return rect.right >= 0 && rect.left <= viewportWidth
}

function drawTimelineCanvasClip({
  context,
  item,
  rect,
  viewportWidth,
  tokens,
  labelRowHeight,
}: {
  context: CanvasRenderingContext2D
  item: TimelineItem
  rect: TimelineCanvasClipRect
  viewportWidth: number
  tokens: Readonly<Record<string, string>>
  labelRowHeight: number
}): boolean {
  const left = Math.max(-1, rect.left)
  const right = Math.min(viewportWidth + 1, rect.right)
  const visibleWidth = Math.max(0, right - left)
  if (visibleWidth <= 0) return false

  const palette = getTimelineCanvasClipPalette(item.type, tokens)
  context.fillStyle = palette.fill
  context.fillRect(left, rect.top, visibleWidth, rect.height)
  context.strokeStyle = palette.stroke
  context.lineWidth = 1
  context.strokeRect(left + 0.5, rect.top + 0.5, Math.max(0, visibleWidth - 1), rect.height - 1)

  if (visibleWidth >= 20) {
    const labelHeight = Math.min(labelRowHeight, rect.height)
    context.fillStyle = palette.labelFill
    context.fillRect(left + 1, rect.top + 1, Math.max(0, visibleWidth - 2), labelHeight)

    if (visibleWidth >= 32) {
      context.save()
      context.beginPath()
      context.rect(
        left + LABEL_HORIZONTAL_PADDING,
        rect.top,
        Math.max(0, visibleWidth - LABEL_HORIZONTAL_PADDING * 2),
        labelHeight,
      )
      context.clip()
      context.fillStyle = palette.text
      context.fillText(
        item.label,
        left + LABEL_HORIZONTAL_PADDING,
        rect.top + labelHeight / 2 + 0.5,
      )
      context.restore()
    }
  }

  return true
}

export function drawInactiveTimelineCanvasItems({
  context,
  items,
  promotedItemIds,
  fps,
  pixelsPerSecond,
  scrollLeft,
  trackHeight,
  viewportWidth,
  tokens = {},
  labelRowHeight = 16,
}: {
  context: CanvasRenderingContext2D
  items: ReadonlyArray<TimelineItem>
  promotedItemIds: ReadonlySet<string>
  fps: number
  pixelsPerSecond: number
  scrollLeft: number
  trackHeight: number
  viewportWidth: number
  tokens?: Readonly<Record<string, string>>
  labelRowHeight?: number
}): number {
  let renderedItemCount = 0
  for (const item of items) {
    if (promotedItemIds.has(item.id)) continue

    const rect = getTimelineCanvasClipRect({
      item,
      fps,
      pixelsPerSecond,
      scrollLeft,
      trackHeight,
    })
    if (!isTimelineCanvasClipVisible(rect, viewportWidth)) continue
    if (drawTimelineCanvasClip({ context, item, rect, viewportWidth, tokens, labelRowHeight })) {
      renderedItemCount += 1
    }
  }
  return renderedItemCount
}
