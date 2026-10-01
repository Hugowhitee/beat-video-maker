import { render } from '@testing-library/react'
import { describe, expect, it } from 'vite-plus/test'
import { MotionPresetThumbnail } from './motion-preset-thumbnail'

describe('MotionPresetThumbnail', () => {
  it('keeps the animated motion class for directional preset previews', () => {
    const { container } = render(
      <MotionPresetThumbnail
        thumbnail={{ kind: 'slide', angle: 180 }}
      />,
    )

    const shape = container.querySelector('.mp-shape')
    expect(shape).not.toBeNull()
    expect(shape).toHaveClass('mp-slide')
    expect(shape).toHaveStyle({ '--mp-angle': '180deg' })
  })

  it('keeps distinct scale directions instead of collapsing previews to a static icon', () => {
    const { container, rerender } = render(
      <MotionPresetThumbnail
        thumbnail={{ kind: 'scale', direction: 1 }}
      />,
    )

    expect(container.querySelector('.mp-shape')).toHaveClass('mp-scale-up')

    rerender(
      <MotionPresetThumbnail
        thumbnail={{ kind: 'scale', direction: -1 }}
      />,
    )
    expect(container.querySelector('.mp-shape')).toHaveClass('mp-scale-down')
  })
})
