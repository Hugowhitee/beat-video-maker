import type { TextItem } from '@/types/timeline'
import { buildTextItemLabelFromText } from '@/shared/utils/text-item-spans'

/**
 * Update existing text using the same TextItem fields as the Properties panel.
 * Multi-line producer layouts retain their per-span styling rather than
 * getting flattened into a new generic text object.
 */
export function buildInlineCanvasTextUpdate(
  item: TextItem,
  text: string,
): Pick<TextItem, 'text' | 'textSpans' | 'label'> {
  const oldSpans = item.textSpans
  const textSpans =
    oldSpans && oldSpans.length > 1
      ? text.split('\n').map((line, i) => ({
          ...oldSpans[Math.min(i, oldSpans.length - 1)]!,
          text: line,
        }))
      : oldSpans && oldSpans.length === 1
        ? [{ ...oldSpans[0]!, text }]
        : undefined

  return { text, textSpans, label: buildTextItemLabelFromText(text) }
}
