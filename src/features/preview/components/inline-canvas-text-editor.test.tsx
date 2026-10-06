// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { fireEvent, render, screen } from '@testing-library/react'
import type { TextItem } from '@/types/timeline'
import type { CoordinateParams, Transform } from '../types/gizmo'

const mocked = vi.hoisted(() => ({
  updateItem: vi.fn(),
  replaceItemPreview: vi.fn(),
  currentPreview: null as null | Record<string, unknown>,
}))

vi.mock('@/features/preview/deps/timeline-store', () => ({
  useTimelineStore: (selector: (state: { updateItem: typeof mocked.updateItem }) => unknown) =>
    selector({ updateItem: mocked.updateItem }),
}))
vi.mock('../stores/gizmo-store', () => ({
  useGizmoStore: {
    getState: () => ({
      preview: mocked.currentPreview,
      replaceItemPreview: mocked.replaceItemPreview,
    }),
  },
}))

import { InlineCanvasTextEditor } from './inline-canvas-text-editor'

const coordParams = {
  containerRect: { width: 600, height: 400, left: 0, top: 0 },
  playerSize: { width: 600, height: 400 },
  projectSize: { width: 1200, height: 800 },
  zoom: -1,
} as CoordinateParams
const transform: Transform = {
  x: 0, y: 0, width: 500, height: 100,
  rotation: 0, opacity: 1,
}
const item = {
  id: 'producer-title',
  type: 'text',
  text: 'ORIGINAL',
  label: 'ORIGINAL',
  fontSize: 40,
  textSpans: [{ text: 'ORIGINAL', fontSize: 40, fontFamily: 'Staatliches' }],
} as TextItem

describe('InlineCanvasTextEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.currentPreview = null
  })

  it('keeps draft changes preview-only until Save, then commits once', () => {
    const onFinished = vi.fn()
    render(
      <InlineCanvasTextEditor
        item={item}
        transform={transform}
        coordParams={coordParams}
        onFinished={onFinished}
      />,
    )
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit text on canvas' }), {
      target: { value: 'NEW TITLE' },
    })
    expect(mocked.replaceItemPreview).toHaveBeenCalledWith(
      'producer-title',
      expect.objectContaining({
        properties: expect.objectContaining({
          text: 'NEW TITLE',
          textSpans: [{ text: 'NEW TITLE', fontSize: 40, fontFamily: 'Staatliches' }],
        }),
      }),
    )
    expect(mocked.updateItem).not.toHaveBeenCalled()
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', ctrlKey: true })
    expect(mocked.updateItem).toHaveBeenCalledTimes(1)
    expect(mocked.updateItem).toHaveBeenCalledWith('producer-title',
      expect.objectContaining({ text: 'NEW TITLE', label: 'NEW TITLE' }),
    )
    expect(onFinished).toHaveBeenCalledTimes(1)
  })

  it('discards the draft on Escape without modifying persistent item state', () => {
    const onFinished = vi.fn()
    render(
      <InlineCanvasTextEditor
        item={item}
        transform={transform}
        coordParams={coordParams}
        onFinished={onFinished}
      />,
    )
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'CANCELLED' } })
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' })
    expect(mocked.updateItem).not.toHaveBeenCalled()
    expect(mocked.replaceItemPreview).toHaveBeenLastCalledWith('producer-title', null)
    expect(onFinished).toHaveBeenCalledOnce()
  })
})
