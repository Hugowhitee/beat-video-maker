// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vite-plus/test'
import type { TextItem, VideoItem } from '@/types/timeline'
import type { ItemKeyframes } from '@/types/keyframe'
import { resetAutoKeyframeStore } from '@/features/editor/deps/keyframes'
import { useTransitionsStore } from '@/features/editor/deps/timeline-store'
import { buildUniformScalePlan } from './uniform-scale'

const canvas = { width: 1920, height: 1080, fps: 30 }
const text: TextItem = {
  id: 'title',
  type: 'text',
  trackId: 'v1',
  from: 0,
  durationInFrames: 90,
  label: 'Title',
  text: 'Title',
  color: '#ffffff',
  fontSize: 80,
  transform: { width: 1536, height: 324 },
}

describe('uniform inspector scale', () => {
  beforeEach(() => {
    resetAutoKeyframeStore()
    useTransitionsStore.getState().setTransitions([])
  })
  it('scales the box and authored text metrics together in the existing batch plan', () => {
    const plan = buildUniformScalePlan([text], canvas, new Map(), 20, 40)
    expect(plan.transforms.get(text.id)).toMatchObject({ width: 768, height: 162 })
    expect(plan.itemUpdates.get(text.id)).toMatchObject({ fontSize: 40 })
    expect(plan.previewProperties[text.id]).toMatchObject({ fontSize: 40 })
    expect(text.transform?.width).toBe(1536)
  })
  it('scales interpolated text at the playhead while preserving base typography', () => {
    const keyframes: ItemKeyframes = {
      itemId: text.id,
      properties: [
        {
          property: 'fontSize',
          keyframes: [{ id: 'font', frame: 20, value: 120, easing: 'linear' }],
        },
      ],
    }
    const plan = buildUniformScalePlan([text], canvas, new Map([[text.id, keyframes]]), 20, 40)
    expect(plan.autoKeyframeOperations).toContainEqual({
      type: 'update',
      itemId: text.id,
      property: 'fontSize',
      keyframeId: 'font',
      updates: { value: 60 },
    })
    expect(plan.itemUpdates.get(text.id)).not.toHaveProperty('fontSize')
  })
  it('uses contain-fit dimensions for portrait footage and keeps its aspect ratio', () => {
    const video: VideoItem = {
      id: 'video',
      type: 'video',
      trackId: 'v1',
      from: 0,
      durationInFrames: 90,
      label: 'Video',
      src: 'video.mp4',
      sourceWidth: 1080,
      sourceHeight: 1920,
    }
    const plan = buildUniformScalePlan([video], canvas, new Map(), 20, 50)
    expect(plan.transforms.get(video.id)).toMatchObject({ width: 303.75, height: 540 })
    expect(plan.itemUpdates.size).toBe(0)
  })

  it('scales an animated off-center pivot at the playhead without changing its base', () => {
    const anchored = { ...text, transform: { ...text.transform, anchorX: 40, anchorY: 20 } }
    const lanes: ItemKeyframes = {
      itemId: text.id,
      properties: [
        {
          property: 'anchorX',
          keyframes: [{ id: 'pivot', frame: 20, value: 100, easing: 'linear' }],
        },
      ],
    }
    const plan = buildUniformScalePlan([anchored], canvas, new Map([[text.id, lanes]]), 20, 40)
    expect(plan.autoKeyframeOperations).toContainEqual({
      type: 'update',
      itemId: text.id,
      property: 'anchorX',
      keyframeId: 'pivot',
      updates: { value: 50 },
    })
    expect(plan.transforms.get(text.id)).not.toHaveProperty('anchorX')
    expect(plan.transforms.get(text.id)).toMatchObject({ anchorY: 10 })
    expect(anchored.transform.anchorX).toBe(40)
  })
})
