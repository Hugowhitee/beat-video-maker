export type AudioEqCutSlopeDbPerOct = 6 | 12 | 18 | 24
export type AudioEqBand1Type = 'low-shelf' | 'peaking' | 'high-shelf' | 'high-pass'
export type AudioEqInnerBandType = 'low-shelf' | 'peaking' | 'high-shelf' | 'notch'
export type AudioEqBand6Type = 'low-pass' | 'low-shelf' | 'peaking' | 'high-shelf'

export interface AudioEqSettings {
  enabled?: boolean
  outputGainDb?: number
  band1Enabled?: boolean
  band1Type?: AudioEqBand1Type
  band1FrequencyHz?: number
  band1GainDb?: number
  band1Q?: number
  band1SlopeDbPerOct?: AudioEqCutSlopeDbPerOct
  lowCutEnabled?: boolean
  lowCutFrequencyHz?: number
  lowCutSlopeDbPerOct?: AudioEqCutSlopeDbPerOct
  lowEnabled?: boolean
  lowType?: AudioEqInnerBandType
  lowGainDb?: number
  lowFrequencyHz?: number
  lowQ?: number
  lowMidEnabled?: boolean
  lowMidType?: AudioEqInnerBandType
  lowMidGainDb?: number
  lowMidFrequencyHz?: number
  lowMidQ?: number
  midGainDb?: number // Legacy center band retained for backward compatibility
  highMidEnabled?: boolean
  highMidType?: AudioEqInnerBandType
  highMidGainDb?: number
  highMidFrequencyHz?: number
  highMidQ?: number
  highEnabled?: boolean
  highType?: AudioEqInnerBandType
  highGainDb?: number
  highFrequencyHz?: number
  highQ?: number
  band6Enabled?: boolean
  band6Type?: AudioEqBand6Type
  band6FrequencyHz?: number
  band6GainDb?: number
  band6Q?: number
  band6SlopeDbPerOct?: AudioEqCutSlopeDbPerOct
  highCutEnabled?: boolean
  highCutFrequencyHz?: number
  highCutSlopeDbPerOct?: AudioEqCutSlopeDbPerOct
}

export interface ResolvedAudioEqSettings {
  outputGainDb: number
  band1Enabled: boolean
  band1Type: AudioEqBand1Type
  band1FrequencyHz: number
  band1GainDb: number
  band1Q: number
  band1SlopeDbPerOct: AudioEqCutSlopeDbPerOct
  lowCutEnabled: boolean
  lowCutFrequencyHz: number
  lowCutSlopeDbPerOct: AudioEqCutSlopeDbPerOct
  lowEnabled: boolean
  lowType: AudioEqInnerBandType
  lowGainDb: number
  lowFrequencyHz: number
  lowQ: number
  lowMidEnabled: boolean
  lowMidType: AudioEqInnerBandType
  lowMidGainDb: number
  lowMidFrequencyHz: number
  lowMidQ: number
  midGainDb: number
  highMidEnabled: boolean
  highMidType: AudioEqInnerBandType
  highMidGainDb: number
  highMidFrequencyHz: number
  highMidQ: number
  highEnabled: boolean
  highType: AudioEqInnerBandType
  highGainDb: number
  highFrequencyHz: number
  highQ: number
  band6Enabled: boolean
  band6Type: AudioEqBand6Type
  band6FrequencyHz: number
  band6GainDb: number
  band6Q: number
  band6SlopeDbPerOct: AudioEqCutSlopeDbPerOct
  highCutEnabled: boolean
  highCutFrequencyHz: number
  highCutSlopeDbPerOct: AudioEqCutSlopeDbPerOct
}


export interface MasterCompressorSettings {
  enabled?: boolean
  thresholdDb?: number
  ratio?: number
  kneeDb?: number
  attackSec?: number
  releaseSec?: number
  makeupGainDb?: number
}

export interface MasterSaturatorSettings {
  enabled?: boolean
  /** Pre-shaper drive. 0 dB is neutral; positive values increase harmonic saturation. */
  driveDb?: number
  /** Parallel wet amount from 0..1. */
  mix?: number
  outputGainDb?: number
  oversample?: 'none' | '2x' | '4x'
}

export interface MasterLimiterSettings {
  enabled?: boolean
  /** Dynamics threshold before the safety ceiling stage. */
  thresholdDb?: number
  releaseSec?: number
  /** Absolute safety ceiling in dBFS. */
  ceilingDb?: number
}

export interface MasterFxSettings {
  enabled?: boolean
  /** Gain before dynamics/saturation. Output gain remains project masterBusDb. */
  inputGainDb?: number
  compressor?: MasterCompressorSettings
  saturator?: MasterSaturatorSettings
  limiter?: MasterLimiterSettings
}

export interface ResolvedMasterFxSettings {
  enabled: boolean
  inputGainDb: number
  compressor: Required<MasterCompressorSettings>
  saturator: Required<MasterSaturatorSettings>
  limiter: Required<MasterLimiterSettings>
}

export type MasteringPresetId = 'clean' | 'punch' | 'hard' | '808-punch' | 'warm'
