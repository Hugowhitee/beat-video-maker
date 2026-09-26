// @vitest-environment node

import { describe, expect, it } from 'vite-plus/test'
import type { MediaMetadata } from '@/types/storage'
import {
  buildDroppedMediaTimelineItem,
  buildDroppedMediaTimelineItems,
  getDroppedMediaDurationInFrames,
} from './dropped-media'

function makeMedia(overrides: Partial<MediaMetadata> = {}): MediaMetadata {
  return {
    id: 'media-1',
    storageType: 'handle',
    fileHandle: {} as FileSystemFileHandle,
    fileName: 'clip.mp4',
    fileSize: 1024,
    fileLastModified: Date.now(),
    mimeType: 'video/mp4',
    duration: 4,
    width: 1280,
    height: 720,
    fps: 30,
    codec: 'h264',
    bitrate: 1000,
    tags: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

describe('getDroppedMediaDurationInFrames', () => {
  it('defaults still images to three seconds outside the Photo publishing flow', () => {
    expect(getDroppedMediaDurationInFrames({ duration: 0 }, 'image', 30)).toBe(90)
  })

  it('matches a Photo still to the analyzed beat duration', () => {
    expect(
      getDroppedMediaDurationInFrames({ duration: 0 }, 'image', 30, {
        beatvideoMode: 'photo',
        beatvideoMusic: {
          version: 2,
          mediaId: 'beat-1',
          analyzedAt: 1,
          musicMap: {
            duration: 150,
            bpm: 128,
            beatsPerBar: 4,
            beats: [],
            sections: [],
          },
          detectedBarOneTime: 0,
          barOneTime: 0,
          barOneVerified: true,
          bpmOverride: null,
          gridMode: 'detected',
          correctionAnchors: [],
        },
      }),
    ).toBe(4500)
  })

  it('uses an imported audio source when Photo mode has not been analyzed yet', () => {
    const beat = makeMedia({
      id: 'beat-1',
      fileName: 'beat.wav',
      mimeType: 'audio/wav',
      duration: 142,
      width: 0,
      height: 0,
      fps: 0,
    })

    expect(
      getDroppedMediaDurationInFrames({ duration: 0 }, 'image', 30, {
        beatvideoMode: 'photo',
        projectMedia: [beat],
      }),
    ).toBe(4260)
  })

  it('uses beat clip duration rather than its absolute timeline end', () => {
    expect(
      getDroppedMediaDurationInFrames({ duration: 0 }, 'image', 30, {
        beatvideoMode: 'photo',
        beatvideoMusic: {
          version: 2,
          mediaId: 'beat-1',
          analyzedAt: 1,
          musicMap: {
            duration: 60,
            bpm: 120,
            beatsPerBar: 4,
            beats: [],
            sections: [],
          },
          detectedBarOneTime: 0,
          barOneTime: 0,
          barOneVerified: true,
          bpmOverride: null,
          gridMode: 'detected',
          correctionAnchors: [],
        },
        timelineItems: [
          {
            id: 'beat-item',
            type: 'audio',
            trackId: 'audio-1',
            from: 900,
            durationInFrames: 1800,
            label: 'beat.wav',
            mediaId: 'beat-1',
            src: 'blob:beat',
          },
        ],
      }),
    ).toBe(1800)
  })

})

describe('buildDroppedMediaTimelineItem', () => {
  it('builds a video item with the requested placement and fitted transform', () => {
    const media = makeMedia()
    const item = buildDroppedMediaTimelineItem({
      media,
      mediaId: media.id,
      mediaType: 'video',
      label: media.fileName,
      timelineFps: 30,
      blobUrl: 'blob:test',
      thumbnailUrl: 'blob:thumb',
      canvasWidth: 1920,
      canvasHeight: 1080,
      placement: {
        trackId: 'track-1',
        from: 48,
        durationInFrames: 120,
      },
    })

    expect(item.type).toBe('video')
    expect(item.trackId).toBe('track-1')
    expect(item.from).toBe(48)
    expect(item.durationInFrames).toBe(120)
    expect(item.transform).toEqual({
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      rotation: 0,
    })
  })

  it('can cover the canvas for a Photo hero still', () => {
    const media = makeMedia({
      mimeType: 'image/jpeg',
      fileName: 'cover.jpg',
      duration: 0,
      width: 1200,
      height: 1500,
      fps: 0,
    })
    const item = buildDroppedMediaTimelineItem({
      media,
      mediaId: media.id,
      mediaType: 'image',
      label: media.fileName,
      timelineFps: 30,
      blobUrl: 'blob:test',
      canvasWidth: 1920,
      canvasHeight: 1080,
      initialFit: 'cover',
      placement: {
        trackId: 'track-1',
        from: 0,
        durationInFrames: 4500,
      },
    })

    expect(item.type).toBe('image')
    expect(item.durationInFrames).toBe(4500)
    expect(item.transform).toEqual({
      x: 0,
      y: 0,
      width: 1920,
      height: 2400,
      rotation: 0,
    })
  })

  it('builds linked video and audio items that stay in sync', () => {
    const media = makeMedia({ audioCodec: 'aac' })
    const [videoItem, audioItem] = buildDroppedMediaTimelineItems({
      media,
      mediaId: media.id,
      mediaType: 'video',
      label: media.fileName,
      timelineFps: 30,
      blobUrl: 'blob:test',
      thumbnailUrl: 'blob:thumb',
      canvasWidth: 1920,
      canvasHeight: 1080,
      linkVideoAudio: true,
      placement: {
        primary: {
          trackId: 'video-track',
          from: 48,
          durationInFrames: 120,
        },
        linkedAudio: {
          trackId: 'audio-track',
          from: 48,
          durationInFrames: 120,
        },
      },
    })

    expect(videoItem?.type).toBe('video')
    expect(audioItem?.type).toBe('audio')
    expect(videoItem?.from).toBe(audioItem?.from)
    expect(videoItem?.durationInFrames).toBe(audioItem?.durationInFrames)
    expect(videoItem?.originId).toBe(audioItem?.originId)
    expect(videoItem?.linkedGroupId).toBe(audioItem?.linkedGroupId)
  })
})
