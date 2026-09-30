import { describe, expect, it, vi } from 'vite-plus/test'
import type { BeatvideoMusicAnalysis } from '@/types/beatvideo'
import type {
  BeatvideoMusicSourceMedia,
  SavedBeatvideoMusicEvidence,
} from './deps/analysis-contract'
import {
  adoptBeatvideoMusicProjectEvidence,
  mergeBeatvideoMusicEvidenceIntoProject,
  resolveBeatvideoMusicEvidence,
} from './music-analysis-cache'

const media: BeatvideoMusicSourceMedia = {
  id: 'beat',
  fileSize: 1000,
  fileLastModified: 10,
  duration: 16,
  mimeType: 'audio/mpeg',
}

const evidence: SavedBeatvideoMusicEvidence = {
  mediaId: 'beat',
  analyzedAt: 20,
  analysisRevision: 6,
  sourceFingerprint: {
    fileSize: 1000,
    fileLastModified: 10,
    duration: 16,
    mimeType: 'audio/mpeg',
  },
  musicMap: {
    duration: 16,
    bpm: 95,
    beatsPerBar: 4,
    beats: [{ time: 0.5, index: 0, downbeat: true, strength: 1 }],
    sections: [],
  },
  detectedBarOneTime: 0.5,
}

function previous(overrides: Partial<BeatvideoMusicAnalysis> = {}): BeatvideoMusicAnalysis {
  return {
    version: 2,
    mediaId: 'beat',
    analyzedAt: 1,
    analysisRevision: 5,
    musicMap: evidence.musicMap,
    detectedBarOneTime: 0.4,
    barOneTime: 0.4,
    barOneVerified: false,
    bpmOverride: null,
    gridMode: 'detected',
    correctionAnchors: [],
    ...overrides,
  }
}

describe('Beatvideo source music analysis cache', () => {
  it('adopts current legacy project evidence into the source cache without inference', async () => {
    const load = vi.fn()
    const save = vi.fn().mockResolvedValue(evidence)
    const legacy = previous({
      analyzedAt: 20,
      analysisRevision: 6,
      barOneTime: 0.65,
      barOneVerified: true,
    })

    const adopted = await adoptBeatvideoMusicProjectEvidence(
      {
        media,
        analysis: legacy,
        analysisRevision: 6,
      },
      { load, save },
    )

    expect(adopted).toBe(evidence)
    expect(save).toHaveBeenCalledWith({
      media,
      analysisRevision: 6,
      musicMap: legacy.musicMap,
      detectedBarOneTime: legacy.detectedBarOneTime,
    })
  })

  it('does not adopt legacy project evidence when the source was modified after analysis', async () => {
    const load = vi.fn()
    const save = vi.fn()
    const legacy = previous({
      analyzedAt: 5,
      analysisRevision: 6,
    })

    const adopted = await adoptBeatvideoMusicProjectEvidence(
      {
        media,
        analysis: legacy,
        analysisRevision: 6,
      },
      { load, save },
    )

    expect(adopted).toBeUndefined()
    expect(save).not.toHaveBeenCalled()
  })

  it('reuses current cached source evidence without invoking the analyzer', async () => {
    const analyze = vi.fn()
    const load = vi.fn().mockResolvedValue(evidence)
    const save = vi.fn()

    const resolved = await resolveBeatvideoMusicEvidence(
      { media, analysisRevision: 6, analyze },
      { load, save },
    )

    expect(resolved.source).toBe('cache')
    expect(resolved.evidence).toBe(evidence)
    expect(analyze).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
  })

  it('runs once and persists source evidence when the cache is missing', async () => {
    const analyze = vi.fn().mockResolvedValue({
      musicMap: evidence.musicMap,
      rhythm: {},
      warnings: [],
    })
    const load = vi.fn().mockResolvedValue(undefined)
    const save = vi.fn().mockResolvedValue(evidence)

    const resolved = await resolveBeatvideoMusicEvidence(
      { media, analysisRevision: 6, analyze },
      { load, save },
    )

    expect(resolved.source).toBe('analysis')
    expect(analyze).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('preserves project-only manual corrections while replacing raw detector evidence', () => {
    const old = previous({
      barOneTime: 0.65,
      barOneVerified: true,
      bpmOverride: 96,
      gridMode: 'fixed',
      correctionAnchors: [{ id: 'a', sourceTime: 8, correctedTime: 8.03 }],
      autoRefreshAttemptedRevision: 6,
    })

    const merged = mergeBeatvideoMusicEvidenceIntoProject(evidence, old)

    expect(merged.musicMap).toBe(evidence.musicMap)
    expect(merged.detectedBarOneTime).toBe(0.5)
    expect(merged.barOneTime).toBe(0.65)
    expect(merged.barOneVerified).toBe(true)
    expect(merged.bpmOverride).toBe(96)
    expect(merged.correctionAnchors).toEqual(old.correctionAnchors)
    expect(merged.autoRefreshAttemptedRevision).toBeUndefined()
    expect(evidence.detectedBarOneTime).toBe(0.5)
  })

  it('adopts fresh detected timing when no project correction exists', () => {
    const merged = mergeBeatvideoMusicEvidenceIntoProject(evidence, previous())

    expect(merged.barOneTime).toBe(0.5)
    expect(merged.barOneVerified).toBe(false)
    expect(merged.bpmOverride).toBeNull()
    expect(merged.correctionAnchors).toEqual([])
  })
})
