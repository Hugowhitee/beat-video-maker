// @vitest-environment node

import { describe, expect, it } from 'vite-plus/test'
import { buildClipSourceFromSceneCuts, isCurrentAutoEditSceneCache } from './clip-map'
import { SCENE_DETECTOR_VERSION } from './deps/analysis-contract'

const media = {
  id: 'video-a',
  fileName: 'video-a.mp4',
  duration: 10,
  fps: 30,
  mimeType: 'video/mp4',
}

describe('buildClipSourceFromSceneCuts', () => {
  it('rejects old sparse cuts while preserving the current adaptive or fallback cache', () => {
    expect(isCurrentAutoEditSceneCache({method: 'histogram', detectorVersion: 2, sampleIntervalMs: 250})).toBe(false)
    expect(isCurrentAutoEditSceneCache({method: 'adaptive', detectorVersion: SCENE_DETECTOR_VERSION})).toBe(true)
    expect(isCurrentAutoEditSceneCache({method: 'histogram', detectorVersion: SCENE_DETECTOR_VERSION, sampleIntervalMs: 250})).toBe(true)
    expect(isCurrentAutoEditSceneCache({method: 'adaptive', detectorVersion: SCENE_DETECTOR_VERSION, verificationModel: 'gemma'})).toBe(false)
  })

  it('treats footage with no detected cuts as one continuous shot', () => {
    const source = buildClipSourceFromSceneCuts(media, [])
    expect(source.shots).toEqual([
      expect.objectContaining({
        sourceId: media.id,
        start: 0,
        end: 10,
        boundaryKind: 'source-start',
        motionEvidence: 'unavailable',
        qualityEvidence: 'unavailable',
      }),
    ])
  })

  it('turns cached scene cuts into source-native shot ranges', () => {
    const source = buildClipSourceFromSceneCuts(media, [
      { time: 2.5, confidence: 0.9 },
      { time: 7, confidence: 0.8 },
    ])

    expect(source.shots.map((shot) => [shot.start, shot.end])).toEqual([
      [0, 2.5],
      [2.5, 7],
      [7, 10],
    ])
    expect(source.shots[1]?.boundaryConfidence).toBeCloseTo(0.9)
  })

  it('drops implausibly tiny scene fragments', () => {
    const source = buildClipSourceFromSceneCuts(media, [
      { time: 0.05, confidence: 1 },
      { time: 3, confidence: 0.9 },
      { time: 3.05, confidence: 0.95 },
      { time: 9.95, confidence: 1 },
    ])

    expect(source.shots.map((shot) => [shot.start, shot.end])).toEqual([
      [0, 3],
      [3, 10],
    ])
  })
})
