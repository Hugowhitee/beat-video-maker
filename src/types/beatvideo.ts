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

export type BeatvideoGridMode = 'detected' | 'fixed'

export type BeatvideoGridCorrectionAnchor = {
  id: string
  /** Original Beat This beat position in source-media seconds. */
  sourceTime: number
  /** Corrected position in source-media seconds. */
  correctedTime: number
}

export type BeatvideoMusicAnalysis = {
  /**
   * v1 stored barOneTime on the absolute timeline after manual verification.
   * v2 stores every correction in source-media time so moving/trimming a clip
   * cannot detach the musical grid from its waveform.
   */
  version: 1 | 2
  mediaId: string
  analyzedAt: number
  musicMap: MusicMap
  /**
   * A detected downbeat is useful evidence but not treated as user-verified bar 1.
   * Once the user sets bar 1 on the timeline, this becomes the canonical anchor.
   */
  /** First model-detected downbeat used as the phase reference for corrections. */
  detectedBarOneTime: number | null
  barOneTime: number | null
  barOneVerified: boolean
  /** Optional user tempo correction used by the fixed grid mode. */
  bpmOverride: number | null
  /** v2: preserve detected beat timing by default; fixed intentionally builds an even grid. */
  gridMode?: BeatvideoGridMode
  /** v2: DJ-style piecewise timing corrections in source-media time. */
  correctionAnchors?: BeatvideoGridCorrectionAnchor[]
}
