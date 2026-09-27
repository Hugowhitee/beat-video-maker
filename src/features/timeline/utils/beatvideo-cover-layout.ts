import type { TextItem } from '@/types/timeline'
import { createTextMotionEffect } from '@/shared/typography/text-motion'
import { createDefaultTextItem } from './generated-layer-items'

export type BeatvideoCoverLayoutPresetId = 'hero-stack' | 'lower-stack'
export type BeatvideoCoverTitleMotion = 'static' | 'pulse'

export interface BeatvideoCoverContent {
  title: string
  subtitle: string
  branding: string
}

export interface BuildBeatvideoCoverLayoutParams {
  presetId: BeatvideoCoverLayoutPresetId
  content: BeatvideoCoverContent
  titleMotion: BeatvideoCoverTitleMotion
  trackIds: {
    title: string
    subtitle: string
    branding: string
  }
  from: number
  durationInFrames: number
  canvasWidth: number
  canvasHeight: number
  fps: number
}

export const BEATVIDEO_COVER_LAYOUT_PRESETS: readonly {
  id: BeatvideoCoverLayoutPresetId
  label: string
  description: string
}[] = [
  {
    id: 'hero-stack',
    label: 'Hero stack',
    description: 'Large title, accent subtitle and producer signature.',
  },
  {
    id: 'lower-stack',
    label: 'Lower stack',
    description: 'Keeps the face/subject clearer with type lower in frame.',
  },
]

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function normalizedText(value: string, fallback: string): string {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : fallback
}

function baseText(params: {
  trackId: string
  from: number
  durationInFrames: number
  canvasWidth: number
  canvasHeight: number
  text: string
  label: string
}): TextItem {
  return createDefaultTextItem({
    trackId: params.trackId,
    from: params.from,
    durationInFrames: params.durationInFrames,
    canvasWidth: params.canvasWidth,
    canvasHeight: params.canvasHeight,
    text: params.text,
    label: params.label,
  })
}

function titleMotion(
  mode: BeatvideoCoverTitleMotion,
  fps: number,
): TextItem['textMotion'] {
  if (mode === 'static') return undefined

  return {
    loop: {
      ...createTextMotionEffect('pulse'),
      durationFrames: Math.max(12, Math.round(fps * 1.8)),
      intensity: 0.32,
      unit: 'whole-clip',
    },
  }
}

export function buildBeatvideoCoverLayoutItems(
  params: BuildBeatvideoCoverLayoutParams,
): TextItem[] {
  const {
    presetId,
    trackIds,
    from,
    durationInFrames,
    canvasWidth,
    canvasHeight,
    fps,
  } = params
  const title = normalizedText(params.content.title, 'BEAT TITLE')
  const subtitle = normalizedText(params.content.subtitle, 'TYPE BEAT')
  const branding = normalizedText(params.content.branding, 'PROD. NAME')

  const isLower = presetId === 'lower-stack'
  const titleY = Math.round(canvasHeight * (isLower ? 0.2 : 0.045))
  const subtitleY = Math.round(canvasHeight * (isLower ? 0.31 : 0.19))
  const brandY = Math.round(canvasHeight * 0.37)

  const titleBase = baseText({
    trackId: trackIds.title,
    from,
    durationInFrames,
    canvasWidth,
    canvasHeight,
    text: title,
    label: 'Cover title',
  })
  const subtitleBase = baseText({
    trackId: trackIds.subtitle,
    from,
    durationInFrames,
    canvasWidth,
    canvasHeight,
    text: subtitle,
    label: 'Cover subtitle',
  })
  const brandingBase = baseText({
    trackId: trackIds.branding,
    from,
    durationInFrames,
    canvasWidth,
    canvasHeight,
    text: branding,
    label: 'Cover branding',
  })

  const titleItem: TextItem = {
    ...titleBase,
    fontFamily: 'Staatliches',
    fontWeight: 'normal',
    fontSize: clamp(Math.round(canvasHeight * 0.155), 92, 228),
    color: '#ffffff',
    textAlign: 'center',
    verticalAlign: 'middle',
    lineHeight: 0.88,
    letterSpacing: -1,
    textPadding: 0,
    textShadow: {
      offsetX: 0,
      offsetY: Math.max(3, Math.round(canvasHeight * 0.005)),
      blur: Math.max(12, Math.round(canvasHeight * 0.018)),
      color: '#000000',
    },
    transform: {
      ...titleBase.transform,
      x: 0,
      y: titleY,
      width: Math.round(canvasWidth * 0.9),
      height: Math.round(canvasHeight * 0.24),
    },
    textMotion: titleMotion(params.titleMotion, fps),
  }

  const subtitleItem: TextItem = {
    ...subtitleBase,
    fontFamily: 'Staatliches',
    fontWeight: 'normal',
    fontSize: clamp(Math.round(canvasHeight * 0.058), 36, 86),
    color: '#ff5a1f',
    textAlign: 'center',
    verticalAlign: 'middle',
    lineHeight: 0.95,
    letterSpacing: 0.25,
    textPadding: 0,
    textShadow: {
      offsetX: 0,
      offsetY: Math.max(2, Math.round(canvasHeight * 0.003)),
      blur: Math.max(8, Math.round(canvasHeight * 0.01)),
      color: '#000000',
    },
    transform: {
      ...subtitleBase.transform,
      x: 0,
      y: subtitleY,
      width: Math.round(canvasWidth * 0.72),
      height: Math.round(canvasHeight * 0.1),
    },
  }

  // Tritopani is not part of the app's verified font catalog. Keep branding on
  // a reliable script font by default; the ordinary text Inspector/font picker
  // remains the source of truth and can replace this with a user-selected font.
  const brandingItem: TextItem = {
    ...brandingBase,
    fontFamily: 'Caveat',
    fontWeight: 'normal',
    fontSize: clamp(Math.round(canvasHeight * 0.055), 34, 82),
    color: '#ffffff',
    textAlign: 'left',
    verticalAlign: 'middle',
    lineHeight: 1,
    letterSpacing: 0,
    textPadding: 0,
    textShadow: {
      offsetX: 0,
      offsetY: 2,
      blur: Math.max(6, Math.round(canvasHeight * 0.008)),
      color: '#000000',
    },
    transform: {
      ...brandingBase.transform,
      x: Math.round(-canvasWidth * 0.27),
      y: brandY,
      width: Math.round(canvasWidth * 0.38),
      height: Math.round(canvasHeight * 0.11),
    },
  }

  return [titleItem, subtitleItem, brandingItem]
}
