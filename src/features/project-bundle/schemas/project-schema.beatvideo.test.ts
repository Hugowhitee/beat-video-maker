// @vitest-environment node

import { describe, expect, it } from 'vite-plus/test'
import { validateProject } from './project-schema'

function baseProject() {
  return {
    id: 'project-1',
    name: 'Beat project',
    description: '',
    beatvideoMode: 'photo' as const,
    createdAt: 1,
    updatedAt: 1,
    duration: 0,
    metadata: {
      width: 1920,
      height: 1080,
      fps: 30,
      backgroundColor: '#000000',
    },
  }
}

describe('Beatvideo project bundle schema', () => {
  it('preserves music analysis, spectral transients and correction anchors', () => {
    const result = validateProject({
      ...baseProject(),
      beatvideoMusic: {
        version: 2,
        mediaId: 'beat-1',
        analyzedAt: 1234,
        musicMap: {
          duration: 120,
          bpm: 92,
          beatsPerBar: 4,
          beats: [
            { time: 0.52, index: 0, downbeat: true, strength: 0.9 },
            { time: 1.17, index: 1, downbeat: false, strength: 0.7 },
          ],
          transients: [
            {
              time: 0.5,
              index: 0,
              strength: 0.95,
              low: 0.9,
              mid: 0.3,
              high: 0.1,
            },
          ],
          sections: [
            {
              id: 'section-1',
              start: 0,
              end: 120,
              kind: 'unknown',
              energy: 0.6,
              confidence: 0.7,
            },
          ],
        },
        detectedBarOneTime: 0.52,
        barOneTime: 0.54,
        barOneVerified: true,
        bpmOverride: null,
        gridMode: 'detected',
        correctionAnchors: [
          {
            id: 'anchor-1',
            sourceTime: 32.1,
            correctedTime: 32.08,
          },
        ],
      },
    })

    expect(result.success).toBe(true)
    expect(result.data?.beatvideoMusic?.musicMap.transients).toHaveLength(1)
    expect(result.data?.beatvideoMusic?.correctionAnchors).toEqual([
      { id: 'anchor-1', sourceTime: 32.1, correctedTime: 32.08 },
    ])
  })

  it('keeps older projects without Beatvideo analysis valid', () => {
    expect(validateProject(baseProject()).success).toBe(true)
  })
})
