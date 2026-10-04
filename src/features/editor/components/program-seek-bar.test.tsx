// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vite-plus/test'
import { fireEvent, render, screen } from '@testing-library/react'
import { usePlaybackStore } from '@/shared/state/playback'
import { usePreviewBridgeStore } from '@/shared/state/preview-bridge'
import { ProgramSeekBar } from './program-seek-bar'

describe('Program seek bar', () => {
  beforeEach(() => {
    usePlaybackStore.setState({ currentFrame: 30, previewFrame: 90, isPlaying: false })
    usePreviewBridgeStore.setState({ displayedFrame: 90 })
  })

  it('reads the canonical playhead and seeks through the same playback store', () => {
    render(<ProgramSeekBar fps={30} totalFrames={3601} />)
    const slider = screen.getByRole('slider', { name: 'Seek in program' })
    expect(slider).toHaveValue('30')
    expect(slider).toHaveAttribute('aria-valuetext', '0:01 of 2:00')
    fireEvent.change(slider, { target: { value: '1800' } })
    expect(usePlaybackStore.getState().currentFrame).toBe(1800)
    expect(usePlaybackStore.getState().previewFrame).toBeNull()
    expect(usePreviewBridgeStore.getState().displayedFrame).toBeNull()
  })

  it('clamps to the last valid frame and disables seeking during a mask edit', () => {
    usePlaybackStore.setState({ currentFrame: 9999 })
    render(<ProgramSeekBar fps={30} totalFrames={121} disabled />)
    const slider = screen.getByRole('slider', { name: 'Seek in program' })
    expect(slider).toHaveValue('120')
    expect(slider).toBeDisabled()
  })
})
