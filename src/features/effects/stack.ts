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
