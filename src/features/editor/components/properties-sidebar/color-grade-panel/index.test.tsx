import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'
import type { TimelineItem, TimelineTrack, VideoItem } from '@/types/timeline'
import { ColorGradePanel } from './index'

const { VIDEO_ITEM, GLOBAL_GRADE, TRACKS, updateItem, setTracks, markDirty } = vi.hoisted(() => ({
  VIDEO_ITEM: {
    id: 'clip-1',
    type: 'video',
    trackId: 'track-1',
    from: 0,
    durationInFrames: 90,
    label: 'clip.mp4',
    src: 'blob:clip',
    mediaId: 'media-1',
  } satisfies VideoItem,
  GLOBAL_GRADE: {
    id: 'global-grade',
    type: 'adjustment',
    trackId: 'grade-track',
    from: 0,
    durationInFrames: 90,
    label: 'Global grade',
    effects: [],
  } as TimelineItem,
  TRACKS: [
    {
      id: 'grade-track',
      name: 'Global grade',
      height: 60,
      locked: false,
      visible: true,
      muted: false,
      solo: false,
      order: 0,
      items: [],
    },
    {
      id: 'track-1',
      name: 'Media',
      height: 60,
      locked: false,
      visible: true,
      muted: false,
      solo: false,
      order: 1,
      items: [],
    },
  ] satisfies TimelineTrack[],
  updateItem: vi.fn(),
  setTracks: vi.fn(),
  markDirty: vi.fn(),
}))

vi.mock('@/features/editor/deps/timeline-store', () => {
  const state = {
    items: [VIDEO_ITEM, GLOBAL_GRADE],
    tracks: TRACKS,
    itemById: {
      [VIDEO_ITEM.id]: VIDEO_ITEM,
      [GLOBAL_GRADE.id]: GLOBAL_GRADE,
    },
  }
  const useItemsStore = Object.assign(
    (
      selector: (value: typeof state) => unknown,
    ) => selector(state),
    {
      getState: () => ({
        ...state,
        _updateItem: updateItem,
        setTracks,
      }),
    },
  )

  return {
    useItemsStore,
    useTimelineSettingsStore: {
      getState: () => ({ markDirty }),
    },
  }
})

vi.mock('@/shared/state/selection', () => ({
  useSelectionStore: (selector: (state: { selectedItemIds: string[] }) => unknown) =>
    selector({ selectedItemIds: [VIDEO_ITEM.id] }),
}))

vi.mock('@/features/editor/deps/effects-contract', () => ({
  ColorGradeSection: ({
    layout,
    onCreateAdjustmentLayer,
    items,
  }: {
    layout?: string
    onCreateAdjustmentLayer?: () => void
    items?: TimelineItem[]
  }) => (
    <div
      data-testid="color-grade-section"
      data-layout={layout}
      data-items={items?.map((item) => item.id).join(',')}
    >
      {onCreateAdjustmentLayer ? 'has adjustment action' : null}
    </div>
  ),
  EffectsSection: ({
    layout,
    items,
  }: {
    layout?: string
    items?: TimelineItem[]
  }) => (
    <div
      data-testid="effects-section"
      data-layout={layout}
      data-items={items?.map((item) => item.id).join(',')}
    >
      Add Effect
    </div>
  ),
}))

vi.mock('@/features/editor/deps/timeline-keyframe-ui', () => ({
  KeyframeGraphPanel: ({
    isOpen,
    placement,
    showCloseButton,
    initialVisibleGroupIds,
    propertyColumnWidth,
  }: {
    isOpen: boolean
    placement?: string
    showCloseButton?: boolean
    initialVisibleGroupIds?: readonly string[]
    propertyColumnWidth?: number
  }) => (
    <div
      data-testid="keyframe-graph-panel"
      data-open={String(isOpen)}
      data-placement={placement}
      data-show-close={String(showCloseButton)}
      data-initial-groups={initialVisibleGroupIds?.join(',')}
      data-property-column-width={propertyColumnWidth}
    />
  ),
}))

describe('ColorGradePanel', () => {
  it('keeps the original graph lane with Effects as its default parameter filter', async () => {
    render(<ColorGradePanel layout="dock" />)

    const gradeSection = await screen.findByTestId('color-grade-section', {}, { timeout: 5000 })
    expect(gradeSection).toHaveAttribute('data-layout', 'dock')
    expect(gradeSection).toHaveTextContent('has adjustment action')
    expect(screen.getByText('Add Effect')).toBeInTheDocument()

    expect(screen.getByTestId('color-keyframes-lane')).toBeInTheDocument()
    const keyframePanel = screen.getByTestId('keyframe-graph-panel')
    expect(keyframePanel).toHaveAttribute('data-open', 'true')
    expect(keyframePanel).toHaveAttribute('data-placement', 'side')
    expect(keyframePanel).toHaveAttribute('data-show-close', 'false')
    expect(keyframePanel).toHaveAttribute('data-initial-groups', 'effects')
    expect(keyframePanel).toHaveAttribute('data-property-column-width', '336')
  })

  it('targets the global adjustment item when Full video scope is active', async () => {
    render(<ColorGradePanel layout="dock" scope="global" />)

    const gradeSection = await screen.findByTestId('color-grade-section', {}, { timeout: 5000 })
    expect(gradeSection).toHaveAttribute('data-items', GLOBAL_GRADE.id)
    expect(screen.getByTestId('effects-section-dock')).toHaveAttribute('data-items', GLOBAL_GRADE.id)
    expect(screen.getByRole('button', { name: 'Full video' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Current clip' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('keeps the global grade spanning the whole visual program', async () => {
    GLOBAL_GRADE.durationInFrames = 60
    updateItem.mockClear()
    markDirty.mockClear()

    render(<ColorGradePanel layout="dock" scope="global" />)

    await waitFor(() =>
      expect(updateItem).toHaveBeenCalledWith(GLOBAL_GRADE.id, {
        from: 0,
        durationInFrames: 90,
      }),
    )
    expect(markDirty).toHaveBeenCalledTimes(1)

    GLOBAL_GRADE.durationInFrames = 90
  })

  it('keeps the global grade above footage lanes created later', async () => {
    const originalOrders = TRACKS.map((track) => track.order)
    TRACKS[0]!.order = 2
    TRACKS[1]!.order = 1
    setTracks.mockClear()
    markDirty.mockClear()

    render(<ColorGradePanel layout="dock" scope="global" />)

    await waitFor(() => expect(setTracks).toHaveBeenCalledTimes(1))
    const nextTracks = setTracks.mock.calls[0]?.[0] as TimelineTrack[]
    expect(nextTracks.find((track) => track.id === 'grade-track')?.order).toBe(0)
    expect(markDirty).toHaveBeenCalledTimes(1)

    TRACKS.forEach((track, index) => {
      track.order = originalOrders[index] ?? track.order
    })
  })

  it('keeps the full Color graph/effects accessible in the narrow shared sidebar', async () => {
    render(<ColorGradePanel layout="vertical-dock" />)
    const section = await screen.findByTestId('color-grade-section', {}, { timeout: 5000 })
    expect(section).toHaveAttribute('data-layout', 'sidebar')
    expect(screen.getByText('Keyframes')).toBeInTheDocument()
    expect(screen.getByTestId('color-keyframes-lane')).toBeInTheDocument()
    expect(screen.getByTestId('keyframe-graph-panel')).toHaveAttribute('data-initial-groups', 'effects')
  })

  it('keeps the sidebar variant stacked without the dock graph lane', async () => {
    render(<ColorGradePanel />)

    await waitFor(() => expect(screen.getByTestId('color-grade-section')).toBeInTheDocument(), {
      timeout: 5000,
    })
    expect(screen.queryByTestId('color-keyframes-lane')).not.toBeInTheDocument()
    expect(screen.queryByTestId('keyframe-graph-panel')).not.toBeInTheDocument()
  })
})
