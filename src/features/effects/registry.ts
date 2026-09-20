import type {
  EffectDefinition,
  EffectModulation,
  EffectType,
  VisualEffectInstance,
  VisualTarget,
} from './types';

const DEFINITIONS: Record<EffectType, EffectDefinition> = {
  'zoom-punch': {
    type: 'zoom-punch',
    name: 'Zoom punch',
    description: 'Small source scale accent for beats and downbeats.',
    targets: ['foreground'],
    defaultTarget: 'foreground',
    defaultStrength: 0.62,
    defaultParams: { scale: 0.075 },
    defaultDriver: 'beat',
    drivers: ['beat', 'downbeat', 'amplitude'],
  },
  shake: {
    type: 'shake',
    name: 'Shake',
    description: 'Deterministic X/Y and rotation movement.',
    targets: ['foreground'],
    defaultTarget: 'foreground',
    defaultStrength: 0.5,
    defaultParams: { x: 0.012, y: 0.012, rotation: 1.1, seed: 1 },
    defaultDriver: 'beat',
    drivers: ['beat', 'downbeat', 'amplitude'],
  },
  'background-drift': {
    type: 'background-drift',
    name: 'Background drift',
    description: 'Slow pan and scale motion behind the sharp source.',
    targets: ['background'],
    defaultTarget: 'background',
    defaultStrength: 0.55,
    defaultParams: { x: 0.014, y: 0.01, scale: 0.025 },
    defaultDriver: 'phrase',
    drivers: ['phrase'],
  },
  glow: {
    type: 'glow',
    name: 'Glow',
    description: 'Soft composite light accent.',
    targets: ['composite'],
    defaultTarget: 'composite',
    defaultStrength: 0.42,
    defaultParams: { amount: 0.12 },
    defaultDriver: 'amplitude',
    drivers: ['beat', 'downbeat', 'phrase', 'amplitude'],
  },
  blur: {
    type: 'blur',
    name: 'Blur',
    description: 'Adjustable source blur.',
    targets: ['background', 'composite'],
    defaultTarget: 'background',
    defaultStrength: 0.35,
    defaultParams: { radius: 24 },
    defaultDriver: null,
    drivers: ['beat', 'downbeat', 'phrase', 'amplitude'],
  },
};

export const EFFECT_TYPES = Object.keys(DEFINITIONS) as EffectType[];

export function effectDefinition(type: EffectType) {
  return DEFINITIONS[type];
}

function makeId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return prefix + '-' + crypto.randomUUID();
  }
  return prefix + '-' + Math.random().toString(36).slice(2);
}

export function createEffectInstance(
  type: EffectType,
  options: {
    id?: string;
    target?: VisualTarget;
  } = {},
): VisualEffectInstance {
  const definition = effectDefinition(type);
  const target = options.target && definition.targets.includes(options.target)
    ? options.target
    : definition.defaultTarget;

  return {
    id: options.id ?? makeId('effect'),
    type,
    target,
    enabled: true,
    strength: definition.defaultStrength,
    params: { ...definition.defaultParams },
  };
}

export function createDefaultModulation(
  effect: Pick<VisualEffectInstance, 'id' | 'type'>,
  id?: string,
): EffectModulation | null {
  const driver = effectDefinition(effect.type).defaultDriver;
  if (!driver) return null;
  return {
    id: id ?? makeId('mod'),
    effectId: effect.id,
    parameter: 'strength',
    driver,
    amount: 1,
    enabled: true,
  };
}

export function supportsTarget(type: EffectType, target: VisualTarget) {
  return effectDefinition(type).targets.includes(target);
}
