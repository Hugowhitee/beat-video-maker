import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import { FloatingPanel } from './floating-panel'

describe('FloatingPanel', () => {
  afterEach(() => {
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    localStorage.clear()
  })

  it('moves with a pointer drag from its title bar', async () => {
    render(
      <FloatingPanel
        title="Mixer"
        defaultBounds={{ x: 120, y: 90, width: 360, height: 300 }}
      >
        <div>Mixer body</div>
      </FloatingPanel>,
    )

    const title = screen.getByText('Mixer')
    const handle = title.parentElement
    expect(handle).not.toBeNull()

    fireEvent.pointerDown(handle!, {
      button: 0,
      pointerId: 7,
      clientX: 180,
      clientY: 110,
    })
    fireEvent.pointerMove(window, {
      pointerId: 7,
      clientX: 230,
      clientY: 150,
    })
    fireEvent.pointerUp(window, { pointerId: 7 })

    const panel = title.closest<HTMLElement>('.fixed')
    await waitFor(() => {
      expect(panel?.style.left).toBe('170px')
      expect(panel?.style.top).toBe('130px')
    })
    expect(document.body.style.userSelect).toBe('')
  })

  it('resizes from the east edge when resizing is enabled', async () => {
    render(
      <FloatingPanel
        title="Resizable"
        defaultBounds={{ x: 120, y: 90, width: 360, height: 300 }}
        minWidth={300}
      >
        <div>Body</div>
      </FloatingPanel>,
    )

    const title = screen.getByText('Resizable')
    const panel = title.closest<HTMLElement>('.fixed')
    const eastHandle = panel?.querySelector<HTMLElement>('.cursor-ew-resize')
    expect(eastHandle).not.toBeNull()

    fireEvent.pointerDown(eastHandle!, {
      button: 0,
      pointerId: 9,
      clientX: 480,
      clientY: 180,
    })
    fireEvent.pointerMove(window, {
      pointerId: 9,
      clientX: 540,
      clientY: 180,
    })
    fireEvent.pointerUp(window, { pointerId: 9 })

    await waitFor(() => {
      expect(panel?.style.width).toBe('420px')
    })
  })
})
