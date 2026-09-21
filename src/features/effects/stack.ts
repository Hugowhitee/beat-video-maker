import { supportsTarget } from './registry';
import type { VisualEffectInstance } from './types';

export function moveEffect(
  effects: readonly VisualEffectInstance[],
  effectId: string,
  toIndex: number,
): VisualEffectInstance[] {
  const fromIndex = effects.findIndex((effect) => effect.id === effectId);
  if (fromIndex < 0) return [...effects];

  const boundedIndex = Math.max(0, Math.min(effects.length - 1, Math.round(toIndex)));
  if (fromIndex === boundedIndex) return [...effects];

  const next = [...effects];
  const [effect] = next.splice(fromIndex, 1);
  next.splice(boundedIndex, 0, effect);
  return next;
}

export function setEffectEnabled(
  effects: readonly VisualEffectInstance[],
  effectId: string,
  enabled: boolean,
): VisualEffectInstance[] {
  return effects.map((effect) => (
    effect.id === effectId ? { ...effect, enabled } : effect
  ));
}

export function setEffectStrength(
  effects: readonly VisualEffectInstance[],
  effectId: string,
  strength: number,
): VisualEffectInstance[] {
  const safeStrength = Number.isFinite(strength)
    ? Math.max(0, Math.min(1, strength))
    : 0;

  return effects.map((effect) => (
    effect.id === effectId ? { ...effect, strength: safeStrength } : effect
  ));
}

export function removeEffect(
  effects: readonly VisualEffectInstance[],
  effectId: string,
): VisualEffectInstance[] {
  return effects.filter((effect) => effect.id !== effectId);
}


export function setEffectTarget(
  effects: readonly VisualEffectInstance[],
  effectId: string,
  target: VisualEffectInstance['target'],
): VisualEffectInstance[] {
  return effects.map((effect) => {
    if (effect.id !== effectId) return effect;
    if (!supportsTarget(effect.type, target)) return effect;
    return { ...effect, target };
  });
}


export function moveEffectWithinTarget(
  effects: readonly VisualEffectInstance[],
  effectId: string,
  direction: -1 | 1,
): VisualEffectInstance[] {
  const fromIndex = effects.findIndex((effect) => effect.id === effectId);
  if (fromIndex < 0) return [...effects];

  const effect = effects[fromIndex];
  const step = direction < 0 ? -1 : 1;
  for (
    let candidateIndex = fromIndex + step;
    candidateIndex >= 0 && candidateIndex < effects.length;
    candidateIndex += step
  ) {
    if (effects[candidateIndex]?.target !== effect.target) continue;
    return moveEffect(effects, effectId, candidateIndex);
  }

  return [...effects];
}

export function canMoveEffectWithinTarget(
  effects: readonly VisualEffectInstance[],
  effectId: string,
  direction: -1 | 1,
) {
  const index = effects.findIndex((effect) => effect.id === effectId);
  if (index < 0) return false;
  const target = effects[index]?.target;
  const candidates = direction < 0
    ? effects.slice(0, index)
    : effects.slice(index + 1);
  return candidates.some((effect) => effect.target === target);
}
