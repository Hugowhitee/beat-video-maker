import { describe, expect, it } from 'vite-plus/test'
import {
  DEFAULT_BEATVIDEO_PROJECT_MODE,
  isSidebarTabVisibleForBeatvideoMode,
  resolveBeatvideoProjectMode,
} from './beatvideo'

describe('Beatvideo project mode', () => {
  it('starts new Beatvideo projects in Photo while treating upstream projects as Video', () => {
    expect(DEFAULT_BEATVIDEO_PROJECT_MODE).toBe('photo')
    expect(resolveBeatvideoProjectMode('photo')).toBe('photo')
    expect(resolveBeatvideoProjectMode('video')).toBe('video')
    expect(resolveBeatvideoProjectMode(undefined)).toBe('video')
    expect(resolveBeatvideoProjectMode('legacy')).toBe('video')
  })

  it('keeps Photo focused and Video editing-oriented', () => {
    expect(isSidebarTabVisibleForBeatvideoMode('media', 'photo')).toBe(true)
    expect(isSidebarTabVisibleForBeatvideoMode('beat', 'photo')).toBe(true)
    expect(isSidebarTabVisibleForBeatvideoMode('overlay', 'photo')).toBe(true)
    expect(isSidebarTabVisibleForBeatvideoMode('text', 'photo')).toBe(false)
    expect(isSidebarTabVisibleForBeatvideoMode('effects', 'photo')).toBe(true)
    expect(isSidebarTabVisibleForBeatvideoMode('transitions', 'photo')).toBe(false)
    expect(isSidebarTabVisibleForBeatvideoMode('shapes', 'photo')).toBe(false)
    expect(isSidebarTabVisibleForBeatvideoMode('ai', 'photo')).toBe(false)

    expect(isSidebarTabVisibleForBeatvideoMode('beat', 'video')).toBe(true)
    expect(isSidebarTabVisibleForBeatvideoMode('transitions', 'video')).toBe(true)
    expect(isSidebarTabVisibleForBeatvideoMode('shapes', 'video')).toBe(true)
    expect(isSidebarTabVisibleForBeatvideoMode('lottie', 'video')).toBe(true)
    expect(isSidebarTabVisibleForBeatvideoMode('transcript', 'video')).toBe(false)
    expect(isSidebarTabVisibleForBeatvideoMode('ai', 'video')).toBe(false)
  })
})
