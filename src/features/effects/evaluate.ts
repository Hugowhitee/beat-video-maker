import { barPhaseAt, beatPhaseAt, phrasePhaseAt } from '../analysis/musicalClock';
import type { VerifiedGrid } from '../analysis/types';
import type {
  EffectModulation,
  ModulationDriver,
  VisualEffectInstance,
} from './types';

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value));
}

function smoothstep(value: number) {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
}

/**
 * Beat pulse adapted from FreeCut's MIT trigger-wave audio modulation:
 * fast attack, then a longer ease-out decay, evaluated analytically at render time.
 */
export function pulseEnvelope(progress: number) {
  if (!Number.isFinite(progress) || progress < 0 || progress >= 1) return 0;
  if (progress < 0.15) return smoothstep(progress / 0.15);
  return 1 - smoothstep((progress - 0.15) / 0.85);
}

export type EffectEvaluationContext = {
  time: number;
  grid?: VerifiedGrid | null;
  audioLevel?: number;
};

function driverValue(
  driver: ModulationDriver,
  context: EffectEvaluationContext,
): number | null {
  const { grid, time } = context;

  if (driver === 'amplitude') {
    return context.audioLevel == null ? null : clamp(context.audioLevel);
  }

  if (!grid) return null;

  if (driver === 'beat') {
    return pulseEnvelope(beatPhaseAt(time, grid));
  }

  if (driver === 'downbeat') {
    if (grid.barOffset == null) return null;
    const progress = barPhaseAt(time, grid) * 4;
    return progress < 1 ? pulseEnvelope(progress) : 0;
  }

  const phase = phrasePhaseAt(time, grid, 8);
  return Math.sin(phase * Math.PI * 2);
}

export type EvaluatedEffect = VisualEffectInstance & {
  signal: number;
  modulation: EffectModulation | null;
};

export function evaluateEffectStack(
  effects: readonly VisualEffectInstance[],
  modulations: readonly EffectModulation[],
  context: EffectEvaluationContext,
): EvaluatedEffect[] {
  return effects
    .filter((effect) => effect.enabled)
    .map((effect) => {
      const modulation = modulations.find(
        (candidate) => candidate.enabled && candidate.effectId === effect.id,
      ) ?? null;

      if (!modulation) {
        return { ...effect, signal: 1, modulation: null };
      }

      const amount = clamp(modulation.amount);
      const driven = driverValue(modulation.driver, context);
      const baseline = modulation.driver === 'phrase' ? 0 : 1;
      const signal = driven === null
        ? 1
        : baseline * (1 - amount) + driven * amount;

      return {
        ...effect,
        signal,
        modulation,
      };
    });
}

export function effectStrength(effect: Pick<EvaluatedEffect, 'strength' | 'signal'>) {
  return clamp(effect.strength, 0, 1) * effect.signal;
}
