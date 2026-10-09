import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { usePlaybackStore } from '@/shared/state/playback'
import { useTimelineCommandStore } from '@/features/editor/deps/timeline-store'
import { resolveMasterFxSettings } from '@/shared/utils/mastering'
import { BeatvideoMasterPanel } from './beatvideo-master-panel'

vi.mock('./audio-meter-panel', () => ({ AudioMeterPanel: () => <div aria-label="Master meter" /> }))
vi.mock('./properties-sidebar/clip-panel/audio-eq-panel-content', () => ({
  AudioEqPanelContent: () => <div>Master EQ</div>,
}))
vi.mock('@/features/editor/deps/composition-runtime', () => ({
  getPreviewMasterReduction: () => ({ compressorDb: 0, limiterDb: 0 }),
  getOrDecodeAudio: vi.fn(),
}))
vi.mock('@/features/editor/deps/projects', () => ({
  useProjectStore: (selector: (state: { currentProject: null }) => unknown) =>
    selector({ currentProject: null }),
}))

describe('BeatvideoMasterPanel gain staging', () => {
  beforeEach(() => {
    usePlaybackStore.setState({ masterFx: undefined, masterBusDb: 0, busAudioEq: undefined })
    useTimelineCommandStore.getState().clearHistory()
  })
  afterEach(cleanup)

  it('commits precise keyboard Input edits before the rack with real undo and redo', () => {
    const { getByRole } = render(<BeatvideoMasterPanel />)
    fireEvent.keyDown(getByRole('slider', { name: 'Input trim' }), { key: 'ArrowDown' })
    expect(usePlaybackStore.getState().masterFx?.inputGainDb).toBe(-0.1)
    expect(usePlaybackStore.getState().masterBusDb).toBe(0)
    expect(useTimelineCommandStore.getState().undoStack).toHaveLength(1)
    act(() => useTimelineCommandStore.getState().undo())
    expect(resolveMasterFxSettings(usePlaybackStore.getState().masterFx).inputGainDb).toBe(0)
    act(() => useTimelineCommandStore.getState().redo())
    expect(usePlaybackStore.getState().masterFx?.inputGainDb).toBe(-0.1)
  })

  it('commits typed Output independently after the rack and restores it with Undo', () => {
    const { getByRole } = render(<BeatvideoMasterPanel />)
    const valueInput = getByRole('textbox', { name: 'Output value' })
    fireEvent.change(valueInput, { target: { value: '-3.5' } })
    fireEvent.keyDown(valueInput, { key: 'Enter' })
    expect(usePlaybackStore.getState().masterBusDb).toBe(-3.5)
    expect(resolveMasterFxSettings(usePlaybackStore.getState().masterFx).inputGainDb).toBe(0)
    expect(useTimelineCommandStore.getState().undoStack).toHaveLength(1)
    act(() => useTimelineCommandStore.getState().undo())
    expect(usePlaybackStore.getState().masterBusDb).toBe(0)
  })

  it('changes the canonical DSP rack order when a visible processor is dragged', () => {
    const { getByRole } = render(<BeatvideoMasterPanel />)
    const limiterRow = getByRole('button', { name: 'Remove Limiter' }).parentElement!
    const compressorRow = getByRole('button', { name: 'Remove Compressor' }).parentElement!
    const dataTransfer = { effectAllowed: '', dropEffect: '', setData: vi.fn() }
    fireEvent.dragStart(limiterRow, { dataTransfer })
    fireEvent.dragOver(compressorRow, { dataTransfer })
    fireEvent.drop(compressorRow, { dataTransfer })
    expect(usePlaybackStore.getState().masterFx?.order).toEqual([
      'eq',
      'limiter',
      'compressor',
      'saturator',
    ])
    act(() => useTimelineCommandStore.getState().undo())
    expect(resolveMasterFxSettings(usePlaybackStore.getState().masterFx).order).toEqual([
      'eq',
      'compressor',
      'saturator',
      'limiter',
    ])
  })

  it('commits typed compressor values and resets the knob to its actual DSP default', () => {
    const { getByRole } = render(<BeatvideoMasterPanel />)
    const valueInput = getByRole('textbox', { name: 'Thresh value dB' })
    fireEvent.change(valueInput, { target: { value: '-22' } })
    fireEvent.blur(valueInput)
    expect(usePlaybackStore.getState().masterFx?.compressor?.thresholdDb).toBe(-22)
    fireEvent.doubleClick(getByRole('slider', { name: 'Thresh' }))
    expect(usePlaybackStore.getState().masterFx?.compressor?.thresholdDb).toBe(-16)
    act(() => useTimelineCommandStore.getState().undo())
    expect(usePlaybackStore.getState().masterFx?.compressor?.thresholdDb).toBe(-22)
  })

  it('uses actual processor bypass and membership state for rack switches and empty slots', () => {
    const { getByRole, queryByRole } = render(<BeatvideoMasterPanel />)
    fireEvent.click(getByRole('switch', { name: 'Compressor enabled' }))
    expect(usePlaybackStore.getState().masterFx?.compressor?.enabled).toBe(true)
    fireEvent.click(getByRole('button', { name: 'Remove Saturator' }))
    expect(usePlaybackStore.getState().masterFx?.order).not.toContain('saturator')
    expect(queryByRole('switch', { name: 'Saturator enabled' })).toBeNull()
    fireEvent.click(getByRole('button', { name: /Add processor/ }))
    fireEvent.click(getByRole('button', { name: 'Saturator' }))
    expect(usePlaybackStore.getState().masterFx?.order).toContain('saturator')
    expect(usePlaybackStore.getState().masterFx?.saturator?.enabled).toBe(true)
    expect(getByRole('switch', { name: 'Saturator enabled' })).toBeChecked()
  })
})
