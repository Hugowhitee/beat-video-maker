// @vitest-environment node

import { afterEach, describe, expect, it } from 'vite-plus/test'
import '../test-utils/logger-test-mocks'
import { setWorkspaceRoot } from './root'
import { asHandle, createRoot } from './__tests__/in-memory-handle'
import {
  beatvideoMusicSourceFingerprintMatches,
  loadBeatvideoMusicEvidence,
  saveBeatvideoMusicEvidence,
  type BeatvideoMusicSourceMedia,
} from './music-analysis'

function media(overrides: Partial<BeatvideoMusicSourceMedia> = {}): BeatvideoMusicSourceMedia {
  return {
    id: 'beat-1',
    fileSize: 1000,
    fileLastModified: 100,
    duration: 20,
    mimeType: 'audio/mpeg',
    ...overrides,
  }
}

const musicMap = {
  duration: 20,
  bpm: 100,
  beatsPerBar: 4,
  beats: [{ time: 0.6, index: 0, downbeat: true, strength: 1 }],
  sections: [],
}

afterEach(() => setWorkspaceRoot(null))

describe('workspace Beatvideo music analysis', () => {
  it('round-trips current source evidence by media source and revision', async () => {
    setWorkspaceRoot(asHandle(createRoot()))
    const source = media({ contentHash: 'abc' })

    await saveBeatvideoMusicEvidence({
      media: source,
      analysisRevision: 6,
      musicMap,
      detectedBarOneTime: 0.6,
    })

    const loaded = await loadBeatvideoMusicEvidence(source, 6)
    expect(loaded?.musicMap.bpm).toBe(100)
    expect(loaded?.detectedBarOneTime).toBe(0.6)
    expect(loaded?.analysisRevision).toBe(6)
  })

  it('invalidates deterministically when detector revision or source fingerprint changes', async () => {
    setWorkspaceRoot(asHandle(createRoot()))
    const source = media()

    await saveBeatvideoMusicEvidence({
      media: source,
      analysisRevision: 6,
      musicMap,
      detectedBarOneTime: 0.6,
    })

    expect(await loadBeatvideoMusicEvidence(source, 5)).toBeUndefined()
    expect(
      await loadBeatvideoMusicEvidence(media({ fileSize: source.fileSize + 1 }), 6),
    ).toBeUndefined()
    expect(
      await loadBeatvideoMusicEvidence(media({ fileLastModified: 101 }), 6),
    ).toBeUndefined()
  })

  it('uses content hashes when both sides have them', () => {
    const source = media({ contentHash: 'new' })
    expect(
      beatvideoMusicSourceFingerprintMatches(
        {
          contentHash: 'old',
          fileSize: source.fileSize,
          fileLastModified: source.fileLastModified,
          duration: source.duration,
          mimeType: source.mimeType,
        },
        source,
      ),
    ).toBe(false)
  })
})
