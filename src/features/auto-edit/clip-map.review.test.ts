// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { buildClipMapForMedia, reviewClipSourceShots } from './clip-map'
import { SCENE_DETECTOR_VERSION } from './deps/analysis-contract'

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  saveReview: vi.fn(),
}))

vi.mock('./deps/analysis-contract', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./deps/analysis-contract')>()),
  readAiOutput: mocks.read,
  saveSceneReview: mocks.saveReview,
}))

const media = {
  id: 'source-a',
  fileName: 'source.mp4',
  duration: 10,
  fps: 30,
  mimeType: 'video/mp4',
}

const cut = (time: number) => ({
  time, type: 'cut' as const, confidence: 0.9, score: 75,
  metrics: { kind: 'manual' as const },
})

describe('persistent source shot review', () => {
  let envelope: {
    data: {
      method: 'adaptive'
      detectorVersion: number
      cuts: ReturnType<typeof cut>[]
      review?: {
        cuts?: ReturnType<typeof cut>[]
        ranges?: Record<string, { start: number; end: number }>
      }
    }
  }

  beforeEach(() => {
    envelope = {
      data: {
        method: 'adaptive',
        detectorVersion: SCENE_DETECTOR_VERSION,
        cuts: [cut(2), cut(5)],
      },
    }
    mocks.read.mockReset().mockImplementation(async () => envelope)
    mocks.saveReview.mockReset().mockImplementation(async (_id, review) => {
      envelope.data.review = review
    })
  })

  it('preserves edited In/Out across rebuilding the saved shot map', async () => {
    const edited = await reviewClipSourceShots(media, {
      kind: 'trim', shotId: 'source-a:shot:2', start: 2.5, end: 4.5,
    })
    expect(edited.shots[1]).toMatchObject({ start: 2.5, end: 4.5 })
    const reopened = await buildClipMapForMedia({ media: [media] })
    expect(reopened.sources[0]?.shots[1]).toMatchObject({ start: 2.5, end: 4.5 })
    expect(envelope.data.cuts).toHaveLength(2)
    expect(envelope.data.review?.ranges).toHaveProperty('source-a:shot:2')
  })

  it('keeps manual splits separate from raw scene detections and allows merging them', async () => {
    const split = await reviewClipSourceShots(media, {
      kind: 'split', shotId: 'source-a:shot:3', time: 7,
    })
    expect(split.shots.map((shot) => [shot.start, shot.end])).toEqual([
      [0, 2], [2, 5], [5, 7], [7, 10],
    ])
    expect(envelope.data.cuts).toHaveLength(2)
    expect(envelope.data.review?.cuts).toHaveLength(3)
    expect((await buildClipMapForMedia({ media: [media] })).sources[0]?.shots).toHaveLength(4)

    const merged = await reviewClipSourceShots(media, {
      kind: 'merge-left', shotId: 'source-a:shot:4',
    })
    expect(merged.shots.map((shot) => [shot.start, shot.end])).toEqual([
      [0, 2], [2, 5], [5, 10],
    ])
    expect((await buildClipMapForMedia({ media: [media] })).sources[0]?.shots).toHaveLength(3)
  })

  it('rejects invalid source edits without modifying saved analysis', async () => {
    await expect(reviewClipSourceShots(media, {
      kind: 'merge-left', shotId: 'source-a:shot:1',
    })).rejects.toThrow('no previous cut')
    await expect(reviewClipSourceShots(media, {
      kind: 'trim', shotId: 'source-a:shot:2', start: 1, end: 4.5,
    })).rejects.toThrow('inside this scene')
    await expect(reviewClipSourceShots(media, {
      kind: 'split', shotId: 'source-a:shot:3', time: 10,
    })).rejects.toThrow('inside this shot')
    expect(mocks.saveReview).not.toHaveBeenCalled()
  })

  it('restores detector cuts and source ranges on reset', async () => {
    await reviewClipSourceShots(media, {
      kind: 'trim', shotId: 'source-a:shot:2', start: 2.5, end: 4.5,
    })
    await reviewClipSourceShots(media, { kind: 'reset-scenes' })
    expect(envelope.data.review).toBeUndefined()
    expect((await buildClipMapForMedia({ media: [media] })).sources[0]?.shots[1]).toMatchObject({
      start: 2, end: 5,
    })
  })
})
