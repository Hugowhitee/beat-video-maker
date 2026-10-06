import { describe, expect, it } from 'vite-plus/test'
import type { TextItem } from '@/types/timeline'
import { buildInlineCanvasTextUpdate } from './canvas-text-edit'

describe('inline canvas text updates', () => {
  it('updates a normal text layer without altering its style model', () => {
    const item = { type: 'text', text: 'Old', label: 'Old', fontFamily: 'Inter' } as TextItem
    expect(buildInlineCanvasTextUpdate(item, 'New name')).toEqual({
      text: 'New name',
      label: 'New name',
      textSpans: undefined,
    })
  })

  it('preserves independent producer typography for existing styled lines', () => {
    const item = {
      type: 'text',
      text: 'TITLE\nPRODUCER',
      textSpans: [
        { text: 'TITLE', fontSize: 82, color: '#ffffff', fontWeight: 'bold' },
        { text: 'PRODUCER', fontSize: 42, color: '#ff0000' },
      ],
    } as TextItem
    const updated = buildInlineCanvasTextUpdate(item, 'BEAT\nHUGO')
    expect(updated.text).toBe('BEAT\nHUGO')
    expect(updated.textSpans).toEqual([
      { text: 'BEAT', fontSize: 82, color: '#ffffff', fontWeight: 'bold' },
      { text: 'HUGO', fontSize: 42, color: '#ff0000' },
    ])
    expect(item.textSpans?.[0]?.text).toBe('TITLE')
  })

  it('inherits the closest existing style if another line is entered', () => {
    const item = {
      type: 'text',
      text: 'A\nB',
      textSpans: [{ text: 'A', fontSize: 75 }, { text: 'B', fontSize: 30 }],
    } as TextItem
    const changed = buildInlineCanvasTextUpdate(item, 'A\nB\nC')
    expect(changed.textSpans?.map((span) => span.fontSize)).toEqual([75, 30, 30])
  })
})
