import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'
import { ConsoleFader } from './console-fader'

describe('ConsoleFader gesture ownership', () => {
  it('commits keyboard output changes within history without triggering timeline shortcuts', () => {
    const calls: Array<string | number> = []
    const timelineShortcut = vi.fn()
    render(
      <div onKeyDown={timelineShortcut}>
        <ConsoleFader
          label="Output"
          value={0}
          onGestureStart={() => calls.push('start')}
          onLiveChange={(value) => calls.push(value)}
          onGestureEnd={() => calls.push('end')}
        />
      </div>,
    )
    const fader = screen.getByRole('slider', { name: 'Output' })
    fireEvent.keyDown(fader, { key: 'Home' })
    fireEvent.keyDown(fader, { key: 'End' })
    fireEvent.keyDown(fader, { key: 'ArrowDown', shiftKey: true })
    expect(calls).toEqual(['start', -60, 'end', 'start', 12, 'end', 'start', -0.1, 'end'])
    expect(timelineShortcut).not.toHaveBeenCalled()
  })

  it('does not open a gain gesture for a secondary pointer button', () => {
    const start = vi.fn()
    const live = vi.fn()
    render(
      <ConsoleFader
        label="Output"
        value={0}
        onGestureStart={start}
        onLiveChange={live}
        onGestureEnd={vi.fn()}
      />,
    )
    fireEvent.pointerDown(screen.getByRole('slider', { name: 'Output' }), {
      button: 2,
      pointerId: 1,
    })
    expect(start).not.toHaveBeenCalled()
    expect(live).not.toHaveBeenCalled()
  })
})
