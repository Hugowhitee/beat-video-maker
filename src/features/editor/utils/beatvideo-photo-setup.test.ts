import { describe, expect, it, vi } from 'vitest'
import type { MediaMetadata } from '@/types/storage'

vi.mock('@/features/editor/deps/timeline-contract', async () => {
  const actual = await vi.importActual<
    typeof import('@/features/editor/deps/timeline-contract')
  >('@/features/editor/deps/timeline-contract')
  return actual
})

import { getPhotoSetupDurationFrames, pickPhotoSetupMedia } from './beatvideo-photo-setup'

function media(overrides: Partial<MediaMetadata>): MediaMetadata {
  return {
    id: crypto.randomUUID(),
    storageType: 'workspace',
    fileName: 'media',
    fileSize: 1,
    mimeType: 'application/octet-stream',
    duration: 0,
    width: 0,
    height: 0,
    fps: 30,
    codec: '',
    bitrate: 0,
    tags: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

describe('Beatvideo Photo quick-start', () => {
  it('picks the first image and audio item without accepting video as a cover', () => {
    const video = media({ mimeType: 'video/mp4', fileName: 'clip.mp4' })
    const cover = media({ mimeType: 'image/jpeg', fileName: 'cover.jpg' })
    const beat = media({ mimeType: 'audio/mpeg', fileName: 'beat.mp3', duration: 42 })

    expect(pickPhotoSetupMedia([video, cover, beat])).toEqual({ cover, beat })
  })

  it('extends the cover to the complete beat duration', () => {
    const cover = media({ mimeType: 'image/png', fileName: 'cover.png' })
    const beat = media({ mimeType: 'audio/wav', fileName: 'beat.wav', duration: 31.25 })

    expect(getPhotoSetupDurationFrames({ cover, beat, fps: 24 })).toEqual({
      coverFrames: 750,
      beatFrames: 750,
    })
  })

  it('keeps the donor still-image fallback when no beat was chosen', () => {
    const cover = media({ mimeType: 'image/png', fileName: 'cover.png' })

    expect(getPhotoSetupDurationFrames({ cover, beat: null, fps: 30 })).toEqual({
      coverFrames: 90,
      beatFrames: null,
    })
  })
})
