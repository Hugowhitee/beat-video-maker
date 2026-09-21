export type BeatvideoProjectMode = 'photo' | 'video'

export const DEFAULT_BEATVIDEO_PROJECT_MODE: BeatvideoProjectMode = 'photo'

export function normalizeBeatvideoProjectMode(value: unknown): BeatvideoProjectMode {
  return value === 'photo' ? 'photo' : 'video'
}
