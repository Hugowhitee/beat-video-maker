import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vite-plus/test'
import { usePlaybackStore } from '@/shared/state/playback'
import { MonitorVolumeControl } from './monitor-volume-control'

describe('MonitorVolumeControl', () => {
  beforeEach(() => {
    usePlaybackStore.setState({
      volume: 0.8,
      muted: false,
    })
  })

  it('toggles preview mute directly from the speaker button', () => {
    render(<MonitorVolumeControl />)

    fireEvent.click(screen.getByRole('button', { name: 'Mute' }))
    expect(usePlaybackStore.getState().muted).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Unmute' }))
    expect(usePlaybackStore.getState().muted).toBe(false)
  })
})
