import { afterEach, describe, expect, it } from 'vite-plus/test'
import type { ShapeItem } from '@/types/timeline'
import type { ItemKeyframes } from '@/types/keyframe'
import type { Transform } from '../types/gizmo'
import { useGizmoStore } from '../stores/gizmo-store'
import { prepareScaleStartTransform } from './transform-calculations'
import { applyAnchoredScaleSnapping } from './canvas-snap-utils'

const currentTransform: Transform = {
  x: 0,
  y: 0,
  width: 200,
  height: 100,
  anchorX: 100,
  anchorY: 50,
  rotation: 0,
  opacity: 1,
}

function createShape(transform: ShapeItem['transform']): ShapeItem {
  return {
    id: 'shape-1',
    type: 'shape',
    trackId: 'track-1',
    from: 0,
    durationInFrames: 60,
    label: 'Solid',
    shapeType: 'rectangle',
    fillColor: '#ffffff',
    transform,
  }
}

describe('scale preview anchor semantics', () => {
  afterEach(() => {
    useGizmoStore.getState().cancelInteraction()
  })

  it('keeps an implicit anchor centered throughout preview and commit', () => {
    const start = prepareScaleStartTransform(
      currentTransform,
      createShape({ x: 0, y: 0, width: 200, height: 100 }),
      undefined,
      undefined,
    )

    useGizmoStore.getState().setCanvasSize(1920, 1080)
    useGizmoStore.getState().startScale('shape-1', 'se', { x: 1060, y: 590 }, start, 'shape', false)
    useGizmoStore.getState().updateInteraction({ x: 1160, y: 640 }, true)

    const preview = useGizmoStore.getState().previewTransform!
    expect(preview.anchorX).toBeUndefined()
    expect(preview.anchorY).toBeUndefined()
    expect(preview.anchorX ?? preview.width / 2).toBe(preview.width / 2)
    expect(preview.anchorY ?? preview.height / 2).toBe(preview.height / 2)

    const committed = useGizmoStore.getState().endInteraction()
    expect(committed?.anchorX).toBeUndefined()
    expect(committed?.anchorY).toBeUndefined()
  })

  it('pins the opposite corner by default; Ctrl scales symmetrically', () => {
    const store = useGizmoStore.getState()
    const start = { ...currentTransform, anchorX: undefined, anchorY: undefined }
    store.setCanvasSize(1920, 1080)
    store.setSnappingEnabled(false)
    store.startScale('shape-1', 'se', { x: 1060, y: 590 }, start, 'shape', false)
    store.updateInteraction({ x: 1160, y: 640 }, false, false)
    const pinned = useGizmoStore.getState().previewTransform!
    expect(pinned).toMatchObject({ x: 50, y: 25, width: 300, height: 150 })

    store.cancelInteraction()
    store.startScale('shape-1', 'se', { x: 1060, y: 590 }, start, 'shape', false)
    store.updateInteraction({ x: 1160, y: 640 }, false, true)
    const centered = useGizmoStore.getState().previewTransform!
    expect(centered.x).toBe(0)
    expect(centered.y).toBe(0)
    expect(centered.width).toBe(400)
    expect(centered.height).toBe(200)
    store.setSnappingEnabled(true)
  })

  it('snaps only the moving edge while preserving the original opposite edge', () => {
    const start = { ...currentTransform, width: 200, height: 100, x: 0, y: 0 }
    const snapped = applyAnchoredScaleSnapping(
      { ...start, width: 349, x: 74.5 },
      start,
      'e',
      1000,
      800,
      [],
      1,
      false,
    )
    expect(snapped.transform.width).toBe(350)
    expect(snapped.transform.x).toBe(75)
    expect(snapped.snapLines).toEqual([{ type: 'vertical', position: 750, label: '75%' }])
    expect(500 + snapped.transform.x - snapped.transform.width / 2).toBe(400)
  })

  it('preserves explicit and animated anchor axes', () => {
    const item = createShape({
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      anchorX: 24,
    })
    const keyframes: ItemKeyframes = {
      itemId: item.id,
      properties: [
        {
          property: 'anchorY',
          keyframes: [{ id: 'anchor-y', frame: 0, value: 36, easing: 'linear' }],
        },
      ],
    }

    expect(
      prepareScaleStartTransform(
        { ...currentTransform, anchorX: 24, anchorY: 36 },
        item,
        keyframes,
        undefined,
      ),
    ).toMatchObject({ anchorX: 24, anchorY: 36 })
  })
})
