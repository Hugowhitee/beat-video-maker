// @vitest-environment node

import { describe, expect, it } from 'vite-plus/test'
import type { TimelineItem } from '@/types/timeline'
import {
  buildBeatvideoPhotoCoverTransform,
  resolveBeatvideoPhotoPublishRange,
} from './beatvideo-photo-publish'

function audioItem(
  id: string,
  mediaId: string,
  from: number,
  durationInFrames: number,
): TimelineItem {
  return {
    id,
    trackId: 'audio-track',
    from,
    durationInFrames,
    label: id,
    mediaId,
    type: 'audio',
    src: `blob:\${id}`,
  }
}

describe('resolveBeatvideoPhotoPublishRange', () => {
  it('uses the analyzed beat placement before unrelated audio', () => {
    expect(
      resolveBeatvideoPhotoPublishRange({
        items: [
          audioItem('tag', 'tag-media', 0, 90),
          audioItem('beat', 'beat-media', 24, 5400),
        ],
        fps: 30,
        beatMediaId: 'beat-media',
        analyzedDurationSeconds: 999,
      }),
    ).toEqual({ from: 24, durationInFrames: 5400 })
  })

  it('uses analyzed duration when the beat is not placed yet', () => {
    expect(
      resolveBeatvideoPhotoPublishRange({
        items: [],
        fps: 30,
        beatMediaId: 'beat-media',
        analyzedDurationSeconds: 123.4,
      }),
    ).toEqual({ from: 0, durationInFrames: 3702 })
  })

  it('falls back to the longest audio clip so static publishing does not require analysis', () => {
    expect(
      resolveBeatvideoPhotoPublishRange({
        items: [
          audioItem('short', 'short-media', 0, 300),
          audioItem('beat', 'beat-media', 0, 3600),
        ],
        fps: 30,
      }),
    ).toEqual({ from: 0, durationInFrames: 3600 })
  })
})

describe('buildBeatvideoPhotoCoverTransform', () => {
  it('fills a 16:9 canvas with a portrait source while keeping the photo centered', () => {
    const image: TimelineItem = {
      id: 'cover',
      trackId: 'video-track',
      from: 0,
      durationInFrames: 90,
      label: 'cover.jpg',
      type: 'image',
      src: 'blob:cover',
      sourceWidth: 1000,
      sourceHeight: 1500,
      transform: {
        x: 12,
        y: -8,
        width: 720,
        height: 1080,
        rotation: 0,
        opacity: 0.9,
      },
    }

    expect(buildBeatvideoPhotoCoverTransform(image, 1920, 1080)).toEqual({
      x: 0,
      y: 0,
      width: 1920,
      height: 2880,
      rotation: 0,
      opacity: 0.9,
    })
  })
})
