// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vite-plus/test'
import { fireEvent, render, screen } from '@testing-library/react'
import { StudioResizeRail } from './studio-resize-rail'

describe('Studio panel resize rail', () => {
  it('follows the physical direction of a left task column', () => {
    const onWidthChange = vi.fn()
    render(
      <StudioResizeRail
        side="left"
        label="Resize left task"
        width={400}
        minWidth={320}
        maxWidth={640}
        defaultWidth={320}
        onWidthChange={onWidthChange}
      />,
    )
    const rail = screen.getByRole('separator', { name: 'Resize left task' })
    fireEvent.keyDown(rail, { key: 'ArrowRight' })
    expect(onWidthChange).toHaveBeenLastCalledWith(424)
    fireEvent.keyDown(rail, { key: 'ArrowLeft' })
    expect(onWidthChange).toHaveBeenLastCalledWith(376)
  })
  it('provides an accessible resizable split separate from the panel scrollbar', () => {
    const onWidthChange = vi.fn()
    render(
      <StudioResizeRail
        label="Resize Visual tools"
        width={400}
        minWidth={320}
        maxWidth={640}
        defaultWidth={400}
        onWidthChange={onWidthChange}
      />,
    )

    const rail = screen.getByRole('separator', { name: 'Resize Visual tools' })
    expect(rail).toHaveAttribute('aria-orientation', 'vertical')
    expect(rail).toHaveAttribute('aria-valuenow', '400')
    fireEvent.keyDown(rail, { key: 'ArrowLeft' })
    expect(onWidthChange).toHaveBeenLastCalledWith(424)
    fireEvent.keyDown(rail, { key: 'ArrowRight' })
    expect(onWidthChange).toHaveBeenLastCalledWith(376)
    fireEvent.keyDown(rail, { key: 'Home' })
    expect(onWidthChange).toHaveBeenLastCalledWith(320)
    fireEvent.keyDown(rail, { key: 'End' })
    expect(onWidthChange).toHaveBeenLastCalledWith(640)
    fireEvent.doubleClick(rail)
    expect(onWidthChange).toHaveBeenLastCalledWith(400)
  })
})
