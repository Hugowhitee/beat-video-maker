import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vite-plus/test'
import { usePlaybackStore } from '@/shared/state/playback'
import { usePreviewBridgeStore } from '@/shared/state/preview-bridge'
import { TimecodeDisplay } from './timecode-display'

function resetPlaybackStore() {
  localStorage.clear()

  usePlaybackStore.setState({
    currentFrame: 12,
    currentFrameEpoch: 0,
    isPlaying: false,
    playbackRate: 1,
    loop: false,
    volume: 1,
    muted: false,
    zoom: -1,
    previewFrame: null,
    previewFrameEpoch: 0,
    frameUpdateEpoch: 0,
    previewItemId: null,
    useProxy: true,
    previewQuality: 1,
  })
  usePreviewBridgeStore.setState({
    displayedFrame: null,
    captureFrame: null,
    captureFrameImageData: null,
    captureCanvasSource: null,
  })
}

describe('TimecodeDisplay', () => {
  beforeEach(() => {
    resetPlaybackStore()
  })

  it('keeps the same reserved width when toggling between SMPTE and frames', () => {
    render(<TimecodeDisplay fps={30} totalFrames={1000} />)

    const control = screen.getByRole('combobox', { name: 'Time display format' })
    const readout = control.previousElementSibling as HTMLElement
    const [currentTime, , totalTime] = readout.querySelectorAll('span')

    expect(readout).toHaveStyle({ width: 'calc(17ch + 0.75rem)' })
    expect(readout).toHaveTextContent('00:00:12')
    expect(readout).toHaveTextContent('00:33:09')
    expect(currentTime).toHaveClass('text-foreground')
    expect(currentTime).not.toHaveClass('text-primary')

    fireEvent.change(control, { target: { value: 'frames' } })

    expect(readout).toHaveStyle({ width: 'calc(17ch + 0.75rem)' })
    expect(currentTime).not.toHaveStyle({ width: '11ch' })
    expect(totalTime).not.toHaveStyle({ width: '11ch' })
    expect(readout).toHaveTextContent('0012')
    expect(readout).toHaveTextContent('0999')
  })

  it('reserves enough width for hour-long SMPTE values', () => {
    render(<TimecodeDisplay fps={30} totalFrames={180_001} />)

    expect(screen.getByRole('combobox').previousElementSibling).toHaveStyle({
      width: 'calc(23ch + 0.75rem)',
    })
  })

  it('shows the skim preview frame in the timecode readout', () => {
    render(<TimecodeDisplay fps={30} totalFrames={1000} />)

    const readout = screen.getByRole('combobox').previousElementSibling as HTMLElement
    expect(readout).toHaveTextContent('00:00:12')

    usePlaybackStore.getState().setPreviewFrame(48)

    expect(readout).toHaveTextContent('00:01:18')
  })

  it('prefers the displayed overlay frame when fast scrub owns presentation', () => {
    render(<TimecodeDisplay fps={30} totalFrames={1000} />)

    const readout = screen.getByRole('combobox').previousElementSibling as HTMLElement
    usePlaybackStore.setState({
      currentFrame: 12,
      currentFrameEpoch: 1,
      previewFrame: 48,
      previewFrameEpoch: 2,
    })
    usePreviewBridgeStore.getState().setDisplayedFrame(50)

    expect(readout).toHaveTextContent('00:01:20')
  })
})
