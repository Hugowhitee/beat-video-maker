import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'
import type { AudioReactiveBinding } from '@/types/beatvideo'
import { AudioReactiveParamControls } from './audio-reactive-param-controls'

const binding: AudioReactiveBinding = {
  id: 'reactive-1',
  enabled: true,
  target: { kind: 'transform', property: 'scale' },
  driver: 'beat',
  amount: 0.03,
  threshold: 0.5,
  sensitivity: 1,
  attackFrames: 3,
  releaseFrames: 4,
  everyNthBeat: 1,
  useStrength: true,
}

describe('AudioReactiveParamControls', () => {
  it('describes pre-hit timing as lead-in instead of delayed attack', () => {
    render(
      <AudioReactiveParamControls
        binding={binding}
        amountRange={{ min: 0, max: 0.15, step: 0.002 }}
        fps={30}
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByText('Reactive')).toBeInTheDocument()
    expect(screen.getByText('Lead-in')).toBeInTheDocument()
    expect(screen.queryByText('Attack')).not.toBeInTheDocument()
  })
})
