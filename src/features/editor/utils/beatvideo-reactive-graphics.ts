import type {
  AudioReactiveBinding,
  AudioReactiveDriver,
  AudioReactiveState,
  MusicMap,
} from '@/types/beatvideo'
import type { ShapeItem } from '@/types/timeline'
import {
  projectAudioReactiveBeatsToItem,
  projectAudioReactiveTransientsToItem,
} from '@/shared/beatvideo/beat-reactive'
import { createDefaultShapeItem } from '@/features/editor/deps/timeline-utils'

export type BeatvideoReactiveGraphicPresetId =
  | 'beat-flash'
  | 'pulse-frame'
  | 'three-band-bars'

export const BEATVIDEO_REACTIVE_GRAPHIC_PRESETS: readonly {
  id: BeatvideoReactiveGraphicPresetId
  label: string
  trackNames: readonly string[]
}[] = [
  {
    id: 'beat-flash',
    label: 'Beat flash',
    trackNames: ['Beat flash'],
  },
  {
    id: 'pulse-frame',
    label: 'Pulse frame',
    trackNames: ['Pulse frame'],
  },
  {
    id: 'three-band-bars',
    label: '3-band bars',
    trackNames: ['Bars low', 'Bars mid', 'Bars high'],
  },
]

interface BuildReactiveGraphicParams {
  presetId: BeatvideoReactiveGraphicPresetId
  grid: MusicMap
  fps: number
  from: number
  durationInFrames: number
  canvasWidth: number
  canvasHeight: number
  trackIds: readonly string[]
}

function binding(
  target: AudioReactiveBinding['target'],
  driver: AudioReactiveDriver,
  fps: number,
  overrides: Partial<AudioReactiveBinding>,
): AudioReactiveBinding {
  return {
    id: crypto.randomUUID(),
    enabled: true,
    target,
    driver,
    amount: 0,
    threshold: 0.5,
    sensitivity: 1,
    attackFrames: 0,
    releaseFrames: Math.max(1, Math.round(Math.max(1, fps) * 0.11)),
    everyNthBeat: 1,
    useStrength: true,
    ...overrides,
  }
}

function stateForItem(
  item: ShapeItem,
  grid: MusicMap,
  fps: number,
  bindings: AudioReactiveBinding[],
): AudioReactiveState {
  return {
    version: 1,
    enabled: true,
    beats: projectAudioReactiveBeatsToItem(grid, item, fps),
    transients: projectAudioReactiveTransientsToItem(grid, item, fps),
    bindings,
  }
}

function bandDriver(
  grid: MusicMap,
  band: 'low' | 'mid' | 'high',
): AudioReactiveDriver {
  return (grid.transients?.length ?? 0) > 0 ? band : 'beat'
}

function baseRectangle(params: {
  trackId: string
  from: number
  durationInFrames: number
  canvasWidth: number
  canvasHeight: number
}): ShapeItem {
  const item = createDefaultShapeItem({
    ...params,
    shapeType: 'rectangle',
  })
  return {
    ...item,
    fillColor: '#ffffff',
    cornerRadius: 0,
    transform: {
      ...item.transform,
      aspectRatioLocked: false,
    },
  }
}

export function buildBeatvideoReactiveGraphicItems(
  params: BuildReactiveGraphicParams,
): ShapeItem[] {
  const {
    presetId,
    grid,
    fps,
    from,
    durationInFrames,
    canvasWidth,
    canvasHeight,
    trackIds,
  } = params

  if (durationInFrames <= 0 || fps <= 0) return []

  if (presetId === 'beat-flash') {
    const trackId = trackIds[0]
    if (!trackId) return []

    const item: ShapeItem = {
      ...baseRectangle({
        trackId,
        from,
        durationInFrames,
        canvasWidth,
        canvasHeight,
      }),
      label: 'Beat flash',
      transform: {
        x: 0,
        y: 0,
        width: canvasWidth,
        height: canvasHeight,
        rotation: 0,
        opacity: 0,
        aspectRatioLocked: false,
      },
    }

    item.audioReactive = stateForItem(item, grid, fps, [
      binding(
        { kind: 'transform', property: 'opacity' },
        'downbeat',
        fps,
        {
          amount: 0.2,
          threshold: 0.58,
          releaseFrames: Math.max(1, Math.round(fps * 0.09)),
        },
      ),
    ])
    return [item]
  }

  if (presetId === 'pulse-frame') {
    const trackId = trackIds[0]
    if (!trackId) return []

    const inset = Math.max(10, Math.round(Math.min(canvasWidth, canvasHeight) * 0.035))
    const item: ShapeItem = {
      ...baseRectangle({
        trackId,
        from,
        durationInFrames,
        canvasWidth,
        canvasHeight,
      }),
      label: 'Pulse frame',
      fillColor: '#00000000',
      strokeEnabled: true,
      strokeColor: '#ffffff',
      strokeWidth: Math.max(2, Math.round(Math.min(canvasWidth, canvasHeight) / 240)),
      transform: {
        x: 0,
        y: 0,
        width: Math.max(1, canvasWidth - inset * 2),
        height: Math.max(1, canvasHeight - inset * 2),
        rotation: 0,
        opacity: 0.14,
        aspectRatioLocked: false,
      },
    }

    const driver = bandDriver(grid, 'low')
    item.audioReactive = stateForItem(item, grid, fps, [
      binding(
        { kind: 'transform', property: 'opacity' },
        driver,
        fps,
        {
          amount: 0.48,
          threshold: 0.42,
          releaseFrames: Math.max(1, Math.round(fps * 0.12)),
        },
      ),
      binding(
        { kind: 'transform', property: 'scale' },
        driver,
        fps,
        {
          amount: 0.018,
          threshold: 0.5,
          releaseFrames: Math.max(1, Math.round(fps * 0.11)),
        },
      ),
    ])
    return [item]
  }

  if (trackIds.length < 3) return []

  const barWidth = Math.max(8, Math.round(canvasWidth * 0.032))
  const barHeight = Math.max(28, Math.round(canvasHeight * 0.13))
  const gap = Math.max(10, Math.round(canvasWidth * 0.018))
  const xPositions = [-(barWidth + gap), 0, barWidth + gap]
  const bands = ['low', 'mid', 'high'] as const
  const labels = ['Bars low', 'Bars mid', 'Bars high'] as const

  return bands.map((band, index) => {
    const item: ShapeItem = {
      ...baseRectangle({
        trackId: trackIds[index]!,
        from,
        durationInFrames,
        canvasWidth,
        canvasHeight,
      }),
      label: labels[index]!,
      cornerRadius: Math.max(1, Math.round(barWidth * 0.18)),
      transform: {
        x: xPositions[index]!,
        y: Math.round(canvasHeight * 0.36),
        width: barWidth,
        height: barHeight,
        rotation: 0,
        opacity: 0.24,
        aspectRatioLocked: false,
      },
    }

    const driver = bandDriver(grid, band)
    item.audioReactive = stateForItem(item, grid, fps, [
      binding(
        { kind: 'transform', property: 'scale' },
        driver,
        fps,
        {
          amount: 0.32,
          threshold: 0.32,
          releaseFrames: Math.max(1, Math.round(fps * 0.1)),
        },
      ),
      binding(
        { kind: 'transform', property: 'opacity' },
        driver,
        fps,
        {
          amount: 0.58,
          threshold: 0.3,
          releaseFrames: Math.max(1, Math.round(fps * 0.11)),
        },
      ),
    ])
    return item
  })
}
