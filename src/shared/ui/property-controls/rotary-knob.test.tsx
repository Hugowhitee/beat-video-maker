import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'
import { RotaryKnob } from './rotary-knob'

describe('RotaryKnob precision gestures', () => {
  it('records a keyboard adjustment inside an undo gesture and isolates timeline shortcuts', () => {
    const calls: Array<string | number> = []
    const parentKeyDown = vi.fn()
    render(
      <div onKeyDown={parentKeyDown}>
        <RotaryKnob
          label="Threshold"
          value={-6.1}
          min={-12}
          max={0}
          step={0.1}
          onGestureStart={() => calls.push('start')}
          onChange={(value) => calls.push(value)}
          onGestureEnd={() => calls.push('end')}
        />
      </div>,
    )
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Threshold' }), { key: 'ArrowUp' })
    expect(calls).toEqual(['start', -6, 'end'])
    expect(parentKeyDown).not.toHaveBeenCalled()
  })

  it('resets to the real default inside a gesture and blocks disabled edits', () => {
    const onChange = vi.fn()
    const onGestureStart = vi.fn()
    const onGestureEnd = vi.fn()
    const { rerender } = render(
      <RotaryKnob
        label="Ratio"
        value={4}
        min={1}
        max={20}
        defaultValue={2}
        onChange={onChange}
        onGestureStart={onGestureStart}
        onGestureEnd={onGestureEnd}
      />,
    )
    fireEvent.doubleClick(screen.getByRole('slider'))
    expect(onChange).toHaveBeenLastCalledWith(2)
    expect(onGestureStart).toHaveBeenCalledOnce()
    expect(onGestureEnd).toHaveBeenCalledOnce()
    rerender(
      <RotaryKnob
        label="Ratio"
        value={4}
        min={1}
        max={20}
        defaultValue={2}
        onChange={onChange}
        disabled
      />,
    )
    fireEvent.doubleClick(screen.getByRole('slider'))
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowUp' })
    expect(onChange).toHaveBeenCalledOnce()
  })
})
