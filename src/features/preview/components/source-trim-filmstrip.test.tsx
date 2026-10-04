// @vitest-environment jsdom

import { beforeAll, describe, expect, it, vi } from 'vite-plus/test'
import { fireEvent, render, screen } from '@testing-library/react'
import { SourceTrimFilmstrip } from './source-trim-filmstrip'

vi.mock('@/features/preview/deps/filmstrip', () => ({
  useFilmstrip: () => ({ frames: [], isLoading: false }),
}))

const base = {
  mediaId: 'shot-source-1',
  blobUrl: 'blob:test-source',
  durationInFrames: 1200,
  fps: 30,
  inPoint: 800,
  outPoint: 1080,
}

describe('SourceTrimFilmstrip', () => {
  beforeAll(() => {
    // JSDOM does not implement pointer capture natively.
    HTMLElement.prototype.setPointerCapture = vi.fn()
    HTMLElement.prototype.hasPointerCapture = vi.fn(() => true)
    HTMLElement.prototype.releasePointerCapture = vi.fn()
  })

  it('keeps a fixed time window while dragging and shows source preview frames', () => {
    const onSeek = vi.fn()
    const onPreview = vi.fn()
    const onChangeIn = vi.fn((frame: number) => frame)
    const onChangeOut = vi.fn((frame: number) => frame)
    const view = render(
      <SourceTrimFilmstrip
        {...base}
        onSeek={onSeek}
        onPreview={onPreview}
        onChangeIn={onChangeIn}
        onChangeOut={onChangeOut}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in source filmstrip' }))
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in source filmstrip' }))
    // 4x: 300 source frames visible, centered on original In=800.
    expect(view.getByTestId('source-precision-filmstrip')).toHaveTextContent('21.67s')
    const track = view.getByTestId('source-filmstrip-zoom-track')
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, right: 300, top: 0, bottom: 56,
      width: 300, height: 56, toJSON: () => ({}),
    })
    const handle = screen.getByRole('button', { name: 'Source In frame' })
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 150 })
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 180 })
    expect(onChangeIn).toHaveBeenLastCalledWith(830)
    expect(onPreview).toHaveBeenLastCalledWith(830)
    // Parent updates the real SourcePlayerStore range while the scale remains fixed.
    view.rerender(
      <SourceTrimFilmstrip
        {...base}
        inPoint={830}
        onSeek={onSeek}
        onPreview={onPreview}
        onChangeIn={onChangeIn}
        onChangeOut={onChangeOut}
      />,
    )
    expect(view.getByTestId('source-precision-filmstrip')).toHaveTextContent('21.67s')
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 180 })
    expect(onSeek).toHaveBeenLastCalledWith(830)
  })

  it('keeps the complete uncut source available while the precision view zooms', () => {
    const onSeek = vi.fn()
    const view = render(
      <SourceTrimFilmstrip
        {...base}
        onSeek={onSeek}
        onPreview={vi.fn()}
        onChangeIn={(frame) => frame}
        onChangeOut={(frame) => frame}
      />,
    )
    const original = view.getByTestId('source-full-filmstrip')
    expect(original).toHaveAttribute('aria-label', 'Full original source filmstrip')
    expect(view.getByText('Full source · unchanged')).toBeInTheDocument()
    vi.spyOn(original, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 400, bottom: 36,
      width: 400, height: 36, toJSON: () => ({}),
    })
    fireEvent.pointerDown(original, { clientX: 100 })
    expect(onSeek).toHaveBeenCalledWith(300)
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in source filmstrip' }))
    expect(view.getByTestId('source-full-filmstrip')).toBeInTheDocument()
    expect(view.getByTestId('source-filmstrip-zoom-track')).toBeInTheDocument()
  })

  it('previews the inclusive final frame for an exclusive Out and supports keyboard steps', () => {
    const onSeek = vi.fn()
    const onPreview = vi.fn()
    const onChangeIn = vi.fn((frame: number) => frame)
    const onChangeOut = vi.fn((frame: number) => frame)
    render(
      <SourceTrimFilmstrip
        {...base}
        onSeek={onSeek}
        onPreview={onPreview}
        onChangeIn={onChangeIn}
        onChangeOut={onChangeOut}
      />,
    )
    const handle = screen.getByRole('button', { name: 'Source Out frame' })
    fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    expect(onChangeOut).toHaveBeenCalledWith(1079)
    expect(onSeek).toHaveBeenCalledWith(1078)
  })
})
