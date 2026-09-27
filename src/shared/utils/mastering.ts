import type {
  MasterFxSettings,
  MasteringPresetId,
  ResolvedMasterFxSettings,
} from '@/types/audio'

export const DEFAULT_MASTER_FX_SETTINGS: ResolvedMasterFxSettings = {
  enabled: false,
  inputGainDb: 0,
  compressor: {
    enabled: false,
    thresholdDb: -16,
    ratio: 2,
    kneeDb: 12,
    attackSec: 0.02,
    releaseSec: 0.18,
    makeupGainDb: 0,
  },
  saturator: {
    enabled: false,
    driveDb: 0,
    mix: 0,
    outputGainDb: 0,
    oversample: '2x',
  },
  limiter: {
    enabled: false,
    thresholdDb: -1.2,
    releaseSec: 0.08,
    ceilingDb: -0.8,
  },
}

function finite(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function resolveMasterFxSettings(
  value: MasterFxSettings | undefined,
): ResolvedMasterFxSettings {
  const defaults = DEFAULT_MASTER_FX_SETTINGS
  return {
    enabled: value?.enabled ?? defaults.enabled,
    inputGainDb: clamp(finite(value?.inputGainDb, defaults.inputGainDb), -24, 24),
    compressor: {
      enabled: value?.compressor?.enabled ?? defaults.compressor.enabled,
      thresholdDb: clamp(
        finite(value?.compressor?.thresholdDb, defaults.compressor.thresholdDb),
        -60,
        0,
      ),
      ratio: clamp(finite(value?.compressor?.ratio, defaults.compressor.ratio), 1, 20),
      kneeDb: clamp(finite(value?.compressor?.kneeDb, defaults.compressor.kneeDb), 0, 40),
      attackSec: clamp(
        finite(value?.compressor?.attackSec, defaults.compressor.attackSec),
        0,
        1,
      ),
      releaseSec: clamp(
        finite(value?.compressor?.releaseSec, defaults.compressor.releaseSec),
        0.01,
        2,
      ),
      makeupGainDb: clamp(
        finite(value?.compressor?.makeupGainDb, defaults.compressor.makeupGainDb),
        -12,
        18,
      ),
    },
    saturator: {
      enabled: value?.saturator?.enabled ?? defaults.saturator.enabled,
      driveDb: clamp(finite(value?.saturator?.driveDb, defaults.saturator.driveDb), 0, 24),
      mix: clamp(finite(value?.saturator?.mix, defaults.saturator.mix), 0, 1),
      outputGainDb: clamp(
        finite(value?.saturator?.outputGainDb, defaults.saturator.outputGainDb),
        -18,
        12,
      ),
      oversample: value?.saturator?.oversample ?? defaults.saturator.oversample,
    },
    limiter: {
      enabled: value?.limiter?.enabled ?? defaults.limiter.enabled,
      thresholdDb: clamp(
        finite(value?.limiter?.thresholdDb, defaults.limiter.thresholdDb),
        -18,
        0,
      ),
      releaseSec: clamp(
        finite(value?.limiter?.releaseSec, defaults.limiter.releaseSec),
        0.01,
        1,
      ),
      ceilingDb: clamp(
        finite(value?.limiter?.ceilingDb, defaults.limiter.ceilingDb),
        -12,
        0,
      ),
    },
  }
}

export function isMasterFxActive(value: MasterFxSettings | undefined): boolean {
  const resolved = resolveMasterFxSettings(value)
  return (
    resolved.enabled &&
    (Math.abs(resolved.inputGainDb) > 0.0001 ||
      resolved.compressor.enabled ||
      resolved.saturator.enabled ||
      resolved.limiter.enabled)
  )
}

export const MASTERING_PRESETS: ReadonlyArray<{
  id: MasteringPresetId
  label: string
  description: string
  settings: MasterFxSettings
}> = [
  {
    id: 'clean',
    label: 'Clean',
    description: 'Light glue and peak protection.',
    settings: {
      enabled: true,
      inputGainDb: 0,
      compressor: {
        enabled: true,
        thresholdDb: -14,
        ratio: 1.8,
        kneeDb: 14,
        attackSec: 0.025,
        releaseSec: 0.2,
        makeupGainDb: 0.5,
      },
      saturator: { enabled: false, driveDb: 0, mix: 0, outputGainDb: 0, oversample: '2x' },
      limiter: { enabled: true, thresholdDb: -1.4, releaseSec: 0.09, ceilingDb: -0.8 },
    },
  },
  {
    id: 'punch',
    label: 'Punch',
    description: 'Keeps transients while tightening the stereo master.',
    settings: {
      enabled: true,
      inputGainDb: 0.8,
      compressor: {
        enabled: true,
        thresholdDb: -16,
        ratio: 2.4,
        kneeDb: 10,
        attackSec: 0.035,
        releaseSec: 0.14,
        makeupGainDb: 0.8,
      },
      saturator: { enabled: true, driveDb: 3, mix: 0.18, outputGainDb: -0.4, oversample: '2x' },
      limiter: { enabled: true, thresholdDb: -1.8, releaseSec: 0.07, ceilingDb: -0.8 },
    },
  },
  {
    id: 'hard',
    label: 'Hard',
    description: 'Denser and louder without hiding the processing.',
    settings: {
      enabled: true,
      inputGainDb: 1.8,
      compressor: {
        enabled: true,
        thresholdDb: -18,
        ratio: 3,
        kneeDb: 8,
        attackSec: 0.02,
        releaseSec: 0.12,
        makeupGainDb: 1,
      },
      saturator: { enabled: true, driveDb: 5, mix: 0.3, outputGainDb: -0.8, oversample: '4x' },
      limiter: { enabled: true, thresholdDb: -2.4, releaseSec: 0.06, ceilingDb: -0.9 },
    },
  },
  {
    id: '808-punch',
    label: '808 Punch',
    description: 'Low-end-friendly dynamics on the full stereo beat, not stem remixing.',
    settings: {
      enabled: true,
      inputGainDb: 0.6,
      compressor: {
        enabled: true,
        thresholdDb: -15,
        ratio: 2.1,
        kneeDb: 12,
        attackSec: 0.045,
        releaseSec: 0.18,
        makeupGainDb: 0.6,
      },
      saturator: { enabled: true, driveDb: 3.5, mix: 0.22, outputGainDb: -0.5, oversample: '4x' },
      limiter: { enabled: true, thresholdDb: -1.8, releaseSec: 0.1, ceilingDb: -0.9 },
    },
  },
  {
    id: 'warm',
    label: 'Warm',
    description: 'Gentle saturation with restrained glue.',
    settings: {
      enabled: true,
      inputGainDb: 0,
      compressor: {
        enabled: true,
        thresholdDb: -13,
        ratio: 1.6,
        kneeDb: 18,
        attackSec: 0.03,
        releaseSec: 0.24,
        makeupGainDb: 0.3,
      },
      saturator: { enabled: true, driveDb: 2.5, mix: 0.28, outputGainDb: -0.5, oversample: '4x' },
      limiter: { enabled: true, thresholdDb: -1.2, releaseSec: 0.12, ceilingDb: -0.8 },
    },
  },
]

export function getMasteringPreset(id: MasteringPresetId) {
  return MASTERING_PRESETS.find((preset) => preset.id === id) ?? MASTERING_PRESETS[0]!
}

export function createSaturationCurve(
  driveDb: number,
  size = 2048,
): Float32Array<ArrayBuffer> {
  const length = Math.max(64, size)
  const curve = new Float32Array(new ArrayBuffer(length * Float32Array.BYTES_PER_ELEMENT))
  const drive = Math.pow(10, Math.max(0, driveDb) / 20)
  if (driveDb <= 0.0001) {
    for (let i = 0; i < curve.length; i++) {
      curve[i] = (i / (curve.length - 1)) * 2 - 1
    }
    return curve
  }

  const norm = Math.tanh(drive)
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1
    curve[i] = Math.tanh(x * drive) / norm
  }
  return curve
}

export function createCeilingCurve(
  ceilingDb: number,
  size = 2048,
): Float32Array<ArrayBuffer> {
  const length = Math.max(64, size)
  const curve = new Float32Array(new ArrayBuffer(length * Float32Array.BYTES_PER_ELEMENT))
  const ceiling = Math.pow(10, Math.min(0, ceilingDb) / 20)
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1
    curve[i] = Math.max(-ceiling, Math.min(ceiling, x))
  }
  return curve
}
