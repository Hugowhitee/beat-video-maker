// @vitest-environment node

import { describe, expect, it } from 'vite-plus/test'
import { buildBeatvideoCoverLayoutItems } from './beatvideo-cover-layout'

describe('Beatvideo cover layouts', () => {
  const base = {
    content: {
      title: 'GLOCK IT',
      subtitle: 'KEVIN TYPE BEAT',
      branding: 'Hugo White',
    },
    trackIds: {
      title: 'title-track',
      subtitle: 'subtitle-track',
      branding: 'branding-track',
    },
    from: 0,
    durationInFrames: 5400,
    canvasWidth: 1920,
    canvasHeight: 1080,
    fps: 30,
  } as const

  it('builds three independent normal text layers for a cover stack', () => {
    const items = buildBeatvideoCoverLayoutItems({
      ...base,
      presetId: 'hero-stack',
      titleMotion: 'static',
    })

    expect(items).toHaveLength(3)
    expect(items.map((item) => item.type)).toEqual(['text', 'text', 'text'])
    expect(items.map((item) => item.trackId)).toEqual([
      'title-track',
      'subtitle-track',
      'branding-track',
    ])
    expect(items.map((item) => item.text)).toEqual([
      'GLOCK IT',
      'KEVIN TYPE BEAT',
      'Hugo White',
    ])
    expect(items.every((item) => item.from === 0)).toBe(true)
    expect(items.every((item) => item.durationInFrames === 5400)).toBe(true)
    expect(items.every((item) => item.linkedGroupId === undefined)).toBe(true)
  })

  it('uses verified cover typography without baking the layers together', () => {
    const [title, subtitle, branding] = buildBeatvideoCoverLayoutItems({
      ...base,
      presetId: 'hero-stack',
      titleMotion: 'static',
    })

    expect(title?.fontFamily).toBe('Staatliches')
    expect(title?.color).toBe('#ffffff')
    expect(subtitle?.fontFamily).toBe('Staatliches')
    expect(subtitle?.color).toBe('#ff5a1f')
    expect(branding?.fontFamily).toBe('Caveat')
    expect(title?.transform?.width).toBeGreaterThan(branding?.transform?.width ?? 0)
    expect(title?.transform?.y).toBeLessThan(subtitle?.transform?.y ?? 0)
    expect(subtitle?.transform?.y).toBeLessThan(branding?.transform?.y ?? 0)
  })

  it('moves the type stack lower without changing its editable layer model', () => {
    const hero = buildBeatvideoCoverLayoutItems({
      ...base,
      presetId: 'hero-stack',
      titleMotion: 'static',
    })
    const lower = buildBeatvideoCoverLayoutItems({
      ...base,
      presetId: 'lower-stack',
      titleMotion: 'static',
    })

    expect(lower[0]?.transform?.y).toBeGreaterThan(hero[0]?.transform?.y ?? 0)
    expect(lower[1]?.transform?.y).toBeGreaterThan(hero[1]?.transform?.y ?? 0)
    expect(lower.map((item) => item.trackId)).toEqual(hero.map((item) => item.trackId))
  })

  it('adds subtle whole-title motion without animating subtitle or branding', () => {
    const [title, subtitle, branding] = buildBeatvideoCoverLayoutItems({
      ...base,
      presetId: 'hero-stack',
      titleMotion: 'pulse',
    })

    expect(title?.textMotion?.loop).toMatchObject({
      presetId: 'pulse',
      unit: 'whole-clip',
      intensity: 0.32,
      durationFrames: 54,
    })
    expect(subtitle?.textMotion).toBeUndefined()
    expect(branding?.textMotion).toBeUndefined()
  })

  it('keeps empty fields usable with deterministic placeholders', () => {
    const items = buildBeatvideoCoverLayoutItems({
      ...base,
      presetId: 'hero-stack',
      titleMotion: 'static',
      content: { title: ' ', subtitle: '', branding: '\t' },
    })

    expect(items.map((item) => item.text)).toEqual([
      'BEAT TITLE',
      'TYPE BEAT',
      'PROD. NAME',
    ])
  })
})
