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

/**
 * Source-audio transient evidence derived from Beat This' log-mel features.
 * Bands are perceptual frequency regions, not guessed instrument labels.
 */
export type MusicTransient = {
  time: number
  index: number
  strength: number
  low: number
  mid: number
  high: number
}

export type AudioReactiveBeat = {
  /** Frame relative to the visual item's start. */
  frame: number
  /** Original source-grid beat index. Used for sparse every-N triggering. */
  index: number
  /** Detector strength normalized to 0..1. */
  strength: number
  downbeat: boolean
}

export type AudioReactiveTransient = {
  /** Frame relative to the visual item's start. */
  frame: number
  index: number
  strength: number
  low: number
  mid: number
  high: number
}

export type AudioReactiveDriver = 'beat' | 'downbeat' | 'low' | 'mid' | 'high'

export type AudioReactiveTransformProperty = 'scale' | 'x' | 'y' | 'rotation' | 'opacity'

export type AudioReactiveTarget =
  | {
      kind: 'transform'
      property: AudioReactiveTransformProperty
    }
  | {
      /** Deterministic low-amplitude jitter; not representable as one scalar property. */
      kind: 'transform-shake'
    }
  | {
      kind: 'effect-param'
      effectId: string
      gpuEffectType: string
      paramKey: string
    }

export type AudioReactiveBinding = {
  id: string
  enabled: boolean
  target: AudioReactiveTarget
  /** Only drivers the current Beat This analysis can produce are exposed for now. */
  driver: AudioReactiveDriver
  /** Additive contribution at a full-strength hit. Scale uses a fractional factor. */
  amount: number
  /** Detector hits below this strength are ignored. */
  threshold: number
  /** Multiplier applied after threshold gating. */
  sensitivity: number
  /** Envelope attack/release stored in frames for deterministic preview/export parity. */
  attackFrames: number
  releaseFrames: number
  /** 1 = every eligible hit, 2 = every other hit, etc. */
  everyNthBeat: number
  /** Use detector strength after thresholding instead of a binary trigger. */
  useStrength: boolean
  /** Reverse the modulation direction without changing the authored value. */
  invert?: boolean
  /** Optional clamp applied to the modulation delta before composition. */
  minOutput?: number
  maxOutput?: number
}

export type AudioReactiveState = {
  version: 1
  enabled: boolean
  /** Beat evidence projected onto the target visual item's local timeline. */
  beats: AudioReactiveBeat[]
  /** Source-audio transient evidence for frequency-band drivers. */
  transients?: AudioReactiveTransient[]
  /** Reusable property bindings. Presets only create/edit these records. */
  bindings: AudioReactiveBinding[]
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
  /** Optional in older projects; populated by new Beat This analyses. */
  transients?: MusicTransient[]
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