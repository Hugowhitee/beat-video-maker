// @vitest-environment node

import { describe, expect, it } from 'vite-plus/test'
import { validateProject, validateSnapshot } from './project-schema'

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

  it('preserves the ordered Master rack instead of treating it as unknown passthrough data', () => {
    const result = validateProject({
      ...baseProject(),
      timeline: {
        tracks: [],
        items: [],
        masterBusDb: -1.5,
        masterFx: {
          enabled: true,
          order: ['saturator', 'compressor', 'limiter'],
          inputGainDb: 1.2,
          saturator: { enabled: true, driveDb: 3, mix: 0.2 },
          compressor: { enabled: true, thresholdDb: -16, ratio: 2.2 },
          limiter: { enabled: true, thresholdDb: -1.8, ceilingDb: -0.8 },
        },
      },
    })

    expect(result.success).toBe(true)
    expect(result.data?.timeline?.masterFx?.order).toEqual([
      'saturator',
      'compressor',
      'limiter',
    ])
  })

  it('preserves file-bound beat analysis in snapshot media references', () => {
    const analysis = {
      version: 2 as const,
      mediaId: 'beat-1',
      analyzedAt: 1234,
      analysisRevision: 6,
      musicMap: {
        duration: 10,
        bpm: 100,
        beatsPerBar: 4,
        beats: [{ time: 0.6, index: 0, downbeat: true, strength: 1 }],
        sections: [
          {
            id: 'section-1',
            start: 0,
            end: 10,
            kind: 'unknown' as const,
            energy: 0.5,
            confidence: 0.5,
          },
        ],
      },
      detectedBarOneTime: 0.6,
      barOneTime: 0.6,
      barOneVerified: false,
      bpmOverride: null,
      gridMode: 'detected' as const,
      correctionAnchors: [],
    }

    const result = validateSnapshot({
      version: '1.0',
      exportedAt: '2026-10-01T12:00:00.000Z',
      editorVersion: '1.0.0',
      project: {
        ...baseProject(),
        beatvideoMusic: analysis,
      },
      mediaReferences: [
        {
          id: 'beat-1',
          fileName: 'beat.mp3',
          fileSize: 1000,
          mimeType: 'audio/mpeg',
          duration: 10,
          width: 0,
          height: 0,
          fps: 0,
          codec: 'mp3',
          bitrate: 320000,
          beatvideoMusicAnalysis: analysis,
        },
      ],
    })

    expect(result.success).toBe(true)
    expect(result.data?.mediaReferences[0]?.beatvideoMusicAnalysis?.mediaId).toBe('beat-1')
  })

  it('keeps older projects without Beatvideo analysis valid', () => {
    expect(validateProject(baseProject()).success).toBe(true)
  })
})
