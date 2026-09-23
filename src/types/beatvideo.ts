export type MusicSectionKind =
  | 'intro'
  | 'verse'
  | 'chorus'
  | 'break'
  | 'build'
  | 'drop'
  | 'outro'
  | 'unknown'

export type MusicBeat = {
  time: number
  index: number
  downbeat: boolean
  strength: number
}

export type MusicSection = {
  id: string
  start: number
  end: number
  kind: MusicSectionKind
  energy: number
  confidence: number
}

export type MusicMap = {
  duration: number
  bpm: number | null
  beatsPerBar: number
  beats: MusicBeat[]
  sections: MusicSection[]
}

export type BeatvideoMusicAnalysis = {
  version: 1
  mediaId: string
  analyzedAt: number
  musicMap: MusicMap
  /**
   * A detected downbeat is useful evidence but not treated as user-verified bar 1.
   * Once the user sets bar 1 on the timeline, this becomes the canonical anchor.
   */
  barOneTime: number | null
  barOneVerified: boolean
}
