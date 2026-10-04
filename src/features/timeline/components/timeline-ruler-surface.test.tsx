import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { _resetZoomStoreForTest, useZoomStore } from '../stores/zoom-store'
import { getTimelineWidth } from '../utils/timeline-layout'
import { applyTimelineLiveGeometry, createTimelineTrackContentLayerRef } from '../utils/timeline-live-geometry'

vi.mock('./timeline-markers', () => ({
  IO_LANE_HEIGHT: 12,
  TimelineMarkers: () => <div data-testid="stable-ruler-markers" />,
}))

import { TimelineRulerSurface } from './timeline-ruler-surface'

describe('TimelineRulerSurface', () => {
  beforeEach(() => {
    _resetZoomStoreForTest()
  })

  afterEach(() => {
    act(() => _resetZoomStoreForTest())
  })

  it('updates live ruler geometry without scaling its mounted DOM', () => {
    const view = render(
      <TimelineRulerSurface duration={10} containerWidth={500} initialWidth={500} />,
    )
    const ruler = view.container.querySelector('.timeline-ruler') as HTMLDivElement
    const surface = view.container.querySelector(
      '[data-timeline-committed-surface="ruler"]',
    ) as HTMLDivElement
    const markers = view.getByTestId('stable-ruler-markers')
    const committedWidth = getTimelineWidth({ contentWidth: 1000, viewportWidth: 500 })

    expect(ruler.style.width).toBe(`${committedWidth}px`)
    expect(surface.style.width).toBe(`${committedWidth}px`)
    expect(surface.style.transform).toBe('none')
    expect(ruler.style.height).not.toBe('')

    act(() => {
      useZoomStore.getState().setZoomLevelImmediate(2)
    })

    expect(ruler.style.width).toBe(
      `${getTimelineWidth({ contentWidth: 2000, viewportWidth: 500 })}px`,
    )
    expect(surface.style.width).toBe(
      `${getTimelineWidth({ contentWidth: 2000, viewportWidth: 500 })}px`,
    )
    expect(surface.style.transform).toBe('none')
    expect(view.getByTestId('stable-ruler-markers')).toBe(markers)

    act(() => {
      useZoomStore.setState({
        contentLevel: 2,
        contentPixelsPerSecond: 200,
        isZoomInteracting: false,
      })
    })

    expect(surface.style.width).toBe(
      `${getTimelineWidth({ contentWidth: 2000, viewportWidth: 500 })}px`,
    )
    expect(surface.style.transform).toBe('none')
    expect(view.getByTestId('stable-ruler-markers')).toBe(markers)
  })
  it('aligns ruler and track overlays to content width instead of scroll room at every zoom', () => {
    for (const kind of ['ruler', 'tracks']) {
      const outer = document.createElement('div')
      const surface = document.createElement('div')
      const overlay = document.createElement('div')
      surface.dataset.timelineCommittedSurface = kind
      surface.appendChild(overlay)
      outer.appendChild(surface)
      const attach = createTimelineTrackContentLayerRef()
      attach(overlay)
      applyTimelineLiveGeometry({
        outer, surface, duration: 10, viewportWidth: 500, livePixelsPerSecond: 100,
      })
      expect(surface.style.width).toBe(`${getTimelineWidth({ contentWidth: 1000, viewportWidth: 500 })}px`)
      expect(overlay.style.width).toBe('1000px')
      applyTimelineLiveGeometry({
        outer, surface, duration: 10, viewportWidth: 500, livePixelsPerSecond: 200,
      })
      expect(overlay.style.width).toBe('2000px')
      attach(null)
    }
  })
})
