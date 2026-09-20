export type VisualTarget = 'background' | 'foreground' | 'composite';

export type EffectType =
  | 'zoom-punch'
  | 'shake'
  | 'background-drift'
  | 'glow'
  | 'blur';

export type ModulationDriver = 'beat' | 'downbeat' | 'phrase' | 'amplitude';

export type EffectParams = Record<string, number>;

export type VisualEffectInstance = {
  id: string;
  type: EffectType;
  target: VisualTarget;
  enabled: boolean;
  strength: number;
  params: EffectParams;
};

export type EffectModulation = {
  id: string;
  effectId: string;
  parameter: 'strength';
  driver: ModulationDriver;
  amount: number;
  enabled: boolean;
};

export type EffectDefinition = {
  type: EffectType;
  name: string;
  description: string;
  targets: readonly VisualTarget[];
  defaultTarget: VisualTarget;
  defaultStrength: number;
  defaultParams: EffectParams;
  paramRanges: Record<string, { min: number; max: number }>;
  defaultDriver: ModulationDriver | null;
  drivers: readonly ModulationDriver[];
};
